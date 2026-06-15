import type {
  AgentEvent,
  FileProfile,
  CoAccessedEntry,
  PromptWindow,
  Session
} from './types.js'
import { DEFAULT_CONFIG } from './types.js'
import { isDistillTrackedPath, isSessionBoundaryEvent } from './paths.js'

function eventTimeMs(event: AgentEvent): number {
  const ms = Date.parse(event.timestamp)
  return Number.isNaN(ms) ? 0 : ms
}

export class Profiler {
  private events: AgentEvent[]
  private sessionsCache: Session[] | null
  private profilesCache: FileProfile[] | null

  constructor(events: AgentEvent[], sessions?: Session[]) {
    this.events = events
    this.sessionsCache = sessions ?? null
    this.profilesCache = null
  }

  static sortEventsByTime(events: AgentEvent[]): AgentEvent[] {
    return [...events].sort((a, b) => eventTimeMs(a) - eventTimeMs(b))
  }

  // group events by idle gap across all JSONL files (30 min default)
  getSessions(): Session[] {
    if (this.sessionsCache) return this.sessionsCache
    if (this.events.length === 0) {
      this.sessionsCache = []
      return this.sessionsCache
    }

    const sorted = Profiler.sortEventsByTime(this.events)
    const boundaryEvents = sorted.filter(isSessionBoundaryEvent)

    if (boundaryEvents.length === 0) {
      this.sessionsCache = []
      return this.sessionsCache
    }

    const groups: AgentEvent[][] = []
    let current: AgentEvent[] = [boundaryEvents[0]]

    for (let i = 1; i < boundaryEvents.length; i++) {
      const gap = eventTimeMs(boundaryEvents[i]) - eventTimeMs(boundaryEvents[i - 1])

      if (gap > DEFAULT_CONFIG.sessionTimeoutMs) {
        groups.push(current)
        current = []
      }
      current.push(boundaryEvents[i])
    }
    groups.push(current)

    this.sessionsCache = groups.map((boundaryGroup, index) => {
      const startMs = eventTimeMs(boundaryGroup[0])
      const endMs = eventTimeMs(boundaryGroup[boundaryGroup.length - 1])

      const windowEvents = sorted.filter(e => {
        const t = eventTimeMs(e)
        return t >= startMs && t <= endMs
      })

      const filesRead = [...new Set(
        windowEvents
          .filter(e =>
            e.action === 'read' &&
            e.relativePath &&
            isDistillTrackedPath(e.relativePath)
          )
          .map(e => e.relativePath!)
      )]
      const filesWritten = [...new Set(
        windowEvents
          .filter(e =>
            (e.action === 'write' || e.action === 'create') &&
            e.relativePath &&
            isDistillTrackedPath(e.relativePath)
          )
          .map(e => e.relativePath!)
      )]

      return {
        id: `${boundaryGroup[0].sessionId}-${index}`,
        startedAt: boundaryGroup[0].timestamp,
        endedAt: boundaryGroup[boundaryGroup.length - 1].timestamp,
        agent: boundaryGroup[0].agent,
        eventCount: windowEvents.length,
        filesRead,
        filesWritten
      }
    })

    return this.sessionsCache
  }

  getAllProfiles(): FileProfile[] {
    if (this.profilesCache) return this.profilesCache

    const sessions = this.getSessions()
    const eventsByPath = new Map<string, AgentEvent[]>()

    for (const event of this.events) {
      if (!event.relativePath) continue
      const list = eventsByPath.get(event.relativePath) ?? []
      list.push(event)
      eventsByPath.set(event.relativePath, list)
    }

    const profiles: FileProfile[] = []

    for (const [relativePath, fileEvents] of eventsByPath) {
      const readCount = fileEvents.filter(e => e.action === 'read').length
      const writeCount = fileEvents.filter(e => e.action === 'write').length
      const createCount = fileEvents.filter(e => e.action === 'create').length
      const deleteCount = fileEvents.filter(e => e.action === 'delete').length

      const sessionsWithFile = sessions.filter(s =>
        s.filesRead.includes(relativePath) ||
        s.filesWritten.includes(relativePath)
      )

      const sorted = Profiler.sortEventsByTime(fileEvents)
      const agents = [...new Set(fileEvents.map(e => e.agent))].sort()

      profiles.push({
        relativePath,
        agents,
        readCount,
        writeCount,
        createCount,
        deleteCount,
        totalEvents: fileEvents.length,
        readWriteRatio: writeCount > 0 ? readCount / writeCount : readCount,
        sessionsAppeared: sessionsWithFile.length,
        firstSeen: sorted[0].timestamp,
        lastSeen: sorted[sorted.length - 1].timestamp,
        coAccessedWith: [],
        typicallyAccessedBefore: this.buildTypicallyAccessedBefore(relativePath)
      })
    }

    this.profilesCache = profiles.sort((a, b) => b.totalEvents - a.totalEvents)
    return this.profilesCache
  }

  private getEventsInSession(session: Session): AgentEvent[] {
    const startMs = eventTimeMs({ timestamp: session.startedAt } as AgentEvent)
    const endMs = session.endedAt
      ? eventTimeMs({ timestamp: session.endedAt } as AgentEvent)
      : startMs

    return Profiler.sortEventsByTime(
      this.events.filter(event => {
        const t = eventTimeMs(event)
        return t >= startMs && t <= endMs
      })
    )
  }

  private buildTypicallyAccessedBefore(relativePath: string): string[] {
    const sessions = this.getSessions()
    const readBeforeCount = new Map<string, number>()
    let writeOccurrences = 0

    for (const session of sessions) {
      const sessionEvents = this.getEventsInSession(session)
      const writesToTarget = sessionEvents.filter(
        event =>
          (event.action === 'write' || event.action === 'create') &&
          event.relativePath === relativePath
      )

      if (writesToTarget.length === 0) continue

      for (const write of writesToTarget) {
        writeOccurrences++
        const writeTime = eventTimeMs(write)

        for (const event of sessionEvents) {
          if (event.action !== 'read' || !event.relativePath) continue
          if (event.relativePath === relativePath) continue
          if (!isDistillTrackedPath(event.relativePath)) continue
          if (eventTimeMs(event) >= writeTime) continue

          readBeforeCount.set(
            event.relativePath,
            (readBeforeCount.get(event.relativePath) ?? 0) + 1
          )
        }
      }
    }

    if (writeOccurrences === 0) return []

    const threshold = Math.max(1, Math.ceil(writeOccurrences * 0.5))

    return Array.from(readBeforeCount.entries())
      .filter(([, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([filePath]) => filePath)
      .slice(0, 5)
  }

  getFileProfile(relativePath: string): FileProfile | null {
    return this.getAllProfiles().find(p => p.relativePath === relativePath) ?? null
  }

  getHotFiles(limit = 10): FileProfile[] {
    return this.getAllProfiles().slice(0, limit)
  }

  getExtensionBreakdown(): Record<string, number> {
    const breakdown: Record<string, number> = {}
    for (const event of this.events) {
      const ext = event.extension || '(none)'
      breakdown[ext] = (breakdown[ext] ?? 0) + 1
    }
    return Object.fromEntries(
      Object.entries(breakdown).sort((a, b) => b[1] - a[1])
    )
  }

  // summary stats for the report command
  getSummary() {
    const sessions = this.getSessions()
    const profiles = this.getAllProfiles()

    return {
      totalEvents: this.events.length,
      totalSessions: sessions.length,
      totalFilesTracked: profiles.length,
      hotFiles: profiles.slice(0, 5),
      mostWrittenFiles: [...profiles]
        .sort((a, b) => b.writeCount - a.writeCount)
        .slice(0, 5),
      extensions: this.getExtensionBreakdown()
    }
  }
}

const DEFAULT_CO_ACCESS_MIN_SUPPORT = 2
const DEFAULT_CO_ACCESS_TOP_N = 10

/** Co-access from prompt-window file sets, not session-level unions. */
export function buildCoAccessedFromWindows(
  relativePath: string,
  windows: Pick<PromptWindow, 'id' | 'files'>[],
  minSupport = DEFAULT_CO_ACCESS_MIN_SUPPORT,
  topN = DEFAULT_CO_ACCESS_TOP_N
): CoAccessedEntry[] {
  const coWindowIds = new Map<string, Set<string>>()

  for (const window of windows) {
    if (!window.files.includes(relativePath)) continue

    for (const file of window.files) {
      if (file === relativePath) continue
      const windowIds = coWindowIds.get(file) ?? new Set<string>()
      windowIds.add(window.id)
      coWindowIds.set(file, windowIds)
    }
  }

  return Array.from(coWindowIds.entries())
    .map(([path, windowIds]) => ({ path, support: windowIds.size }))
    .filter(entry => entry.support >= minSupport)
    .sort((a, b) => b.support - a.support)
    .slice(0, topN)
}
