import * as fs from 'fs'
import * as path from 'path'
import type { AgentEvent } from './types.js'

export const EVENT_LOG_BOUNDARY_SESSION = '_moatlog_event_log_boundary'

export function isSyntheticDistillEvent(event: AgentEvent): boolean {
  return event.action === 'event_log_boundary'
}

function maxEventTimestamp(events: AgentEvent[]): string {
  let maxMs = 0
  let maxTimestamp = events[0].timestamp

  for (const event of events) {
    const ms = Date.parse(event.timestamp)
    if (!Number.isNaN(ms) && ms >= maxMs) {
      maxMs = ms
      maxTimestamp = event.timestamp
    }
  }

  return maxTimestamp
}

function boundaryTimestampAfter(timestamp: string): string {
  const ms = Date.parse(timestamp)
  const boundaryMs = Number.isNaN(ms) ? 0 : ms + 1
  return new Date(boundaryMs).toISOString().replace(/\.\d{3}Z$/, '.000Z')
}

function dateFromEventLogFile(filename: string): string | null {
  const match = filename.match(/events-(\d{4}-\d{2}-\d{2})\.jsonl$/)
  return match ? `${match[1]}T23:59:59.000Z` : null
}

export function createEventLogBoundary(
  sourceFile: string,
  afterTimestamp: string
): AgentEvent {
  return {
    id: `boundary:${sourceFile}`,
    timestamp: boundaryTimestampAfter(afterTimestamp),
    sessionId: EVENT_LOG_BOUNDARY_SESSION,
    agent: 'cursor',
    action: 'event_log_boundary',
    projectName: 'moatlog'
  }
}

export class EventLogger {
  private logPath: string
  private stream: fs.WriteStream

  constructor(logDir: string) {
    fs.mkdirSync(logDir, { recursive: true })
    const date = new Date().toISOString().split('T')[0]
    this.logPath = path.join(logDir, `events-${date}.jsonl`)
    this.stream = fs.createWriteStream(this.logPath, { flags: 'a' })
  }

  write(event: AgentEvent): void {
    this.stream.write(JSON.stringify(event) + '\n')
  }

  close(): void {
    this.stream.end()
  }

  static readAll(logDir: string, days = 30): AgentEvent[] {
    if (!fs.existsSync(logDir)) return []

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)

    const files = fs.readdirSync(logDir)
      .filter(f => f.endsWith('.jsonl'))
      .filter(f => {
        const dateStr = f.replace('events-', '').replace('.jsonl', '')
        const fileDate = new Date(dateStr)
        return !isNaN(fileDate.getTime()) && fileDate >= cutoff
      })
      .sort()

    const events: AgentEvent[] = []

    for (let index = 0; index < files.length; index++) {
      const file = files[index]
      const fileEvents: AgentEvent[] = []
      const content = fs.readFileSync(path.join(logDir, file), 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)

      for (const line of lines) {
        try {
          fileEvents.push(JSON.parse(line))
        } catch {
          // skip malformed lines
        }
      }

      events.push(...fileEvents)

      if (index < files.length - 1) {
        const afterTimestamp =
          fileEvents.length > 0
            ? maxEventTimestamp(fileEvents)
            : dateFromEventLogFile(file) ?? new Date().toISOString()

        events.push(createEventLogBoundary(file, afterTimestamp))
      }
    }

    return events
  }
}
