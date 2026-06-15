import { Profiler } from './profiler.js'
import type { AgentEvent, PromptWindow } from './types.js'
import { isMoatlogTrackedPath } from './tracked-path.js'

const FILE_WINDOW_ACTIONS = new Set<AgentEvent['action']>(['read', 'write', 'create'])

const FOLLOW_UP_TASK_PATTERN =
  /^(now|yes|ok|no|do you|can you|you done|thanks|thank you|how is|is it|is this|is moat|are you).{0,40}$/i

function eventTimeMs(event: Pick<AgentEvent, 'timestamp'>): number {
  const ms = Date.parse(event.timestamp)
  return Number.isNaN(ms) ? 0 : ms
}

type TrackedWindow = PromptWindow & {
  lastFileTimeMs?: number
}

/** Short follow-up prompts that often arrive while the prior turn is still writing. */
export function isFollowUpPrompt(task: string): boolean {
  const trimmed = task.trim()
  if (trimmed.length < 50) return true
  return FOLLOW_UP_TASK_PATTERN.test(trimmed)
}

function openWindowsForSession(
  openBySession: Map<string, TrackedWindow[]>,
  sessionId: string
): TrackedWindow[] {
  return openBySession.get(sessionId) ?? []
}

/** Close windows whose last file event predates the next prompt (legacy fallback when agent_stop is missing). */
function inferCloseCompletedWindows(
  openWindows: TrackedWindow[],
  promptTimeMs: number
): TrackedWindow[] {
  return openWindows.filter(window => {
    if (window.lastFileTimeMs == null) return true
    return window.lastFileTimeMs >= promptTimeMs
  })
}

function closeOldestOpenWindow(openWindows: TrackedWindow[]): TrackedWindow[] {
  return openWindows.slice(1)
}

export function resolveAttributionWindow(
  fileEvent: AgentEvent,
  openWindows: TrackedWindow[],
  generationByWindowId: Map<string, string>
): TrackedWindow | null {
  const fileTime = eventTimeMs(fileEvent)
  const eligible = openWindows.filter(window => eventTimeMs(window) <= fileTime)

  if (eligible.length === 0) return null

  if (fileEvent.generationId) {
    for (const window of eligible) {
      const windowGeneration = generationByWindowId.get(window.id)
      if (windowGeneration === fileEvent.generationId) {
        return window
      }
    }
  }

  return eligible[0]
}

export function buildPromptWindows(
  events: AgentEvent[],
  projectRoot: string
): PromptWindow[] {
  const sorted = Profiler.sortEventsByTime(events)
  const windows: TrackedWindow[] = []
  const generationByWindowId = new Map<string, string>()
  const openBySession = new Map<string, TrackedWindow[]>()

  for (const event of sorted) {
    if (event.action === 'prompt_start' && event.task) {
      const promptTimeMs = eventTimeMs(event)
      const openWindows = openWindowsForSession(openBySession, event.sessionId)
      const stillOpen = inferCloseCompletedWindows(openWindows, promptTimeMs)

      const window: TrackedWindow = {
        id: event.id,
        task: event.task,
        timestamp: event.timestamp,
        sessionId: event.sessionId,
        agent: event.agent,
        files: []
      }
      windows.push(window)
      stillOpen.push(window)
      openBySession.set(event.sessionId, stillOpen)

      if (event.generationId) {
        generationByWindowId.set(window.id, event.generationId)
      }
      continue
    }

    if (event.action === 'agent_stop') {
      const openWindows = openWindowsForSession(openBySession, event.sessionId)
      if (openWindows.length === 0) continue

      if (event.generationId) {
        const matchIndex = openWindows.findIndex(
          window => generationByWindowId.get(window.id) === event.generationId
        )
        if (matchIndex >= 0) {
          openWindows.splice(matchIndex, 1)
          openBySession.set(event.sessionId, openWindows)
          continue
        }
      }

      openBySession.set(event.sessionId, closeOldestOpenWindow(openWindows))
      continue
    }

    if (event.action === 'session_end') {
      openBySession.set(event.sessionId, [])
      continue
    }

    if (event.action === 'event_log_boundary') {
      openBySession.clear()
      continue
    }

    if (
      !FILE_WINDOW_ACTIONS.has(event.action) ||
      !event.relativePath ||
      !isMoatlogTrackedPath(event.relativePath, projectRoot)
    ) {
      continue
    }

    const openWindows = openWindowsForSession(openBySession, event.sessionId)
    const target = resolveAttributionWindow(event, openWindows, generationByWindowId)
    if (!target || target.files.includes(event.relativePath)) continue

    target.files.push(event.relativePath)
    target.lastFileTimeMs = eventTimeMs(event)
  }

  return windows.map(({ lastFileTimeMs: _lastFileTimeMs, ...window }) => window)
}
