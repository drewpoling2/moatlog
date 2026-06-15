import * as fs from 'fs'
import * as path from 'path'
import { Profiler, buildCoAccessedFromWindows } from './profiler.js'
import { EventLogger, isSyntheticDistillEvent } from './logger.js'
import type {
  AgentEvent,
  FileProfile,
  Moat,
  MoatDataHealth,
  Session,
  WindowQuality
} from './types.js'
import {
  buildTaskFileSets,
  enrichPromptWindows,
  type EnrichedPromptWindow
} from './task-context.js'
import { buildPromptWindows } from './prompt-windows.js'
import { getDistillFilterReason } from './paths.js'
import { isMoatlogIgnoredPath } from './moatlogignore.js'
import { isMoatlogTrackedPath } from './tracked-path.js'
import type { AgentName } from './types.js'
import {
  assertMoatSchemaCurrent,
  MOAT_SCHEMA_VERSION,
  MoatSchemaError
} from './moat-schema.js'

/** Agents whose hook events are included in distillation. */
export const DISTILLED_AGENTS: AgentName[] = ['cursor', 'claude-code']

export type { DistillFilterReason } from './paths.js'
export { getDistillFilterReason, isDistillTrackedPath } from './paths.js'
export { MOAT_SCHEMA_VERSION, MoatSchemaError, assertMoatSchemaCurrent } from './moat-schema.js'
export type { Moat } from './types.js'

export interface DistillFilterStats {
  total: number
  kept: number
  excluded: Record<Exclude<import('./paths.js').DistillFilterReason, 'kept'>, number>
}

export function analyzeDistillFilter(
  events: AgentEvent[],
  projectRoot: string
): DistillFilterStats {
  const excluded: DistillFilterStats['excluded'] = {
    no_path: 0,
    node_modules: 0,
    dist: 0,
    config: 0,
    moatlogignore: 0
  }

  let kept = 0
  for (const event of events) {
    if (isSyntheticDistillEvent(event)) continue

    if (!event.relativePath) {
      excluded.no_path++
      continue
    }

    if (isMoatlogIgnoredPath(event.relativePath, projectRoot)) {
      excluded.moatlogignore++
      continue
    }

    const reason = getDistillFilterReason(event.relativePath)
    if (reason === 'kept') kept++
    else excluded[reason]++
  }

  return { total: events.length, kept, excluded }
}

function filterEventsForDistill(
  events: AgentEvent[],
  projectRoot: string
): AgentEvent[] {
  return events.filter(
    e => e.relativePath && isMoatlogTrackedPath(e.relativePath, projectRoot)
  )
}

function filterFileProfile(
  profile: FileProfile,
  projectRoot: string
): FileProfile {
  const tracked = (filePath: string) =>
    isMoatlogTrackedPath(filePath, projectRoot)

  return {
    ...profile,
    coAccessedWith: profile.coAccessedWith.filter(entry => tracked(entry.path)),
    typicallyAccessedBefore: profile.typicallyAccessedBefore?.filter(tracked)
  }
}

function filterSession(session: Session, projectRoot: string): Session {
  const tracked = (filePath: string) =>
    isMoatlogTrackedPath(filePath, projectRoot)

  return {
    ...session,
    filesRead: session.filesRead.filter(tracked),
    filesWritten: session.filesWritten.filter(tracked)
  }
}

export const MOAT_GENERATED_NOTICE =
  'do not edit manually — run moatlog distill to regenerate'

function serializeFileProfile(
  profile: FileProfile,
  coAccessedWith: FileProfile['coAccessedWith'],
  readsCaptured: boolean
): FileProfile {
  const serialized: FileProfile = {
    relativePath: profile.relativePath,
    agents: profile.agents,
    writeCount: profile.writeCount,
    createCount: profile.createCount,
    deleteCount: profile.deleteCount,
    totalEvents: profile.totalEvents,
    sessionsAppeared: profile.sessionsAppeared,
    firstSeen: profile.firstSeen,
    lastSeen: profile.lastSeen,
    coAccessedWith
  }

  if (readsCaptured) {
    serialized.readCount = profile.readCount ?? 0
    serialized.readWriteRatio = profile.readWriteRatio ?? 0
    if (profile.typicallyAccessedBefore && profile.typicallyAccessedBefore.length > 0) {
      serialized.typicallyAccessedBefore = profile.typicallyAccessedBefore
    }
  }

  return serialized
}

function serializePromptWindow(window: EnrichedPromptWindow): EnrichedPromptWindow {
  const { task: _task, ...persisted } = window
  return persisted
}

function buildDataHealth(
  profiles: FileProfile[],
  promptWindows: EnrichedPromptWindow[]
): MoatDataHealth {
  const readsCaptured = profiles.some(profile => (profile.readCount ?? 0) > 0)
  const windowCounts: Record<WindowQuality, number> = {
    high: 0,
    low: 0,
    meta: 0
  }

  for (const window of promptWindows) {
    windowCounts[window.windowQuality]++
  }

  return { readsCaptured, windowCounts }
}

export interface DistillResult {
  moat: Moat
  filterStats: DistillFilterStats
}

/** @deprecated Use Moat */
export type Insights = Moat

export class Distiller {
  private logDir: string
  private projectRoot: string
  private projectName: string
  private scope: string

  constructor(logDir: string, projectName: string, scope = 'root') {
    this.logDir = logDir
    this.projectRoot = path.dirname(logDir)
    this.projectName = projectName
    this.scope = scope
  }

  distill(days = 30): DistillResult {
    const projectRoot = this.projectRoot
    const allEvents = EventLogger.readAll(this.logDir, days).filter(e =>
      DISTILLED_AGENTS.includes(e.agent)
    )

    if (allEvents.length === 0) {
      throw new Error(
        'No events to distill. Work in Cursor or Claude Code with hooks enabled, then run moatlog distill.'
      )
    }

    const filterStats = analyzeDistillFilter(allEvents, projectRoot)
    const trackedEvents = filterEventsForDistill(allEvents, projectRoot)

    if (trackedEvents.length === 0) {
      throw new Error(
        'No trackable events to distill after filtering node_modules and dist paths.'
      )
    }

    const sessionProfiler = new Profiler(allEvents)
    const sessions = sessionProfiler
      .getSessions()
      .map(session => filterSession(session, projectRoot))

    const trackedProfiler = new Profiler(trackedEvents, sessionProfiler.getSessions())
    const rawProfiles = trackedProfiler
      .getAllProfiles()
      .filter(p => {
        if (p.deleteCount === 0) return true
        return p.createCount > p.deleteCount
      })
      .map(profile => filterFileProfile(profile, projectRoot))

    const knownFiles = rawProfiles.map(profile => profile.relativePath)
    const rawPromptWindows = buildPromptWindows(allEvents, projectRoot)
    const enrichedPromptWindows: EnrichedPromptWindow[] = enrichPromptWindows(
      rawPromptWindows,
      knownFiles
    )
    const promptWindows = enrichedPromptWindows.map(serializePromptWindow)

    const readsCaptured = rawProfiles.some(profile => (profile.readCount ?? 0) > 0)
    const hotFiles = rawProfiles.map(profile =>
      serializeFileProfile(
        profile,
        buildCoAccessedFromWindows(profile.relativePath, enrichedPromptWindows),
        readsCaptured
      )
    )

    const taskFileSets = buildTaskFileSets(enrichedPromptWindows)
    const dataHealth = buildDataHealth(rawProfiles, promptWindows)

    const moat: Moat = {
      _generated: MOAT_GENERATED_NOTICE,
      _version: MOAT_SCHEMA_VERSION,
      scope: this.scope,
      projectName: this.projectName,
      generatedAt: new Date().toISOString(),
      generatedFrom: `${trackedEvents.length} events across ${sessions.length} sessions`,
      totalEvents: trackedEvents.length,
      totalSessions: sessions.length,
      dataHealth,
      hotFiles,
      sessions,
      extensionBreakdown: trackedProfiler.getExtensionBreakdown(),
      promptWindows,
      taskFileSets
    }

    return { moat, filterStats }
  }

  save(moat: Moat): string {
    const outPath = path.join(this.logDir, 'moat.json')
    fs.writeFileSync(outPath, JSON.stringify(moat, null, 2))

    const legacyPath = path.join(this.logDir, 'insights.json')
    if (fs.existsSync(legacyPath)) {
      fs.unlinkSync(legacyPath)
    }

    return outPath
  }

  load(): Moat | null {
    const moatPath = path.join(this.logDir, 'moat.json')
    if (!fs.existsSync(moatPath)) return null

    const data = JSON.parse(fs.readFileSync(moatPath, 'utf-8')) as Record<string, unknown>
    assertMoatSchemaCurrent(data._version as string | undefined)
    return this.normalizeMoat(data)
  }

  private normalizeMoat(data: Record<string, unknown>): Moat {
    const moat = data as unknown as Moat
    const knownFiles = (moat.hotFiles ?? []).map(profile => profile.relativePath)
    const promptWindows = enrichPromptWindows(moat.promptWindows ?? [], knownFiles)

    return {
      ...moat,
      promptWindows,
      taskFileSets: moat.taskFileSets ?? buildTaskFileSets(promptWindows)
    }
  }
}
