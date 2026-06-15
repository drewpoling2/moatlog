import { EventLogger, Profiler, buildAgentReportSections } from '@moatlog/core'
import type { AgentEvent } from '@moatlog/core'
import * as theme from '../theme.js'

interface ReportOptions {
  projectRoot: string
  logDir: string
  byAgent?: boolean
}

export function report({ logDir, byAgent = false }: ReportOptions): void {
  const events = EventLogger.readAll(logDir)

  if (events.length === 0) {
    console.log(theme.warn('No events logged yet. Work in Cursor with hooks enabled.'))
    return
  }

  console.log(theme.heading('\nmoatlog report\n'))

  if (byAgent) {
    printReportByAgent(events)
    return
  }

  const profiler = new Profiler(events)
  const summary = profiler.getSummary()

  console.log(theme.label('overview'))
  console.log(theme.fieldPlain('total events', String(summary.totalEvents)))
  console.log(theme.fieldPlain('sessions', String(summary.totalSessions)))
  console.log(theme.fieldPlain('files tracked', String(summary.totalFilesTracked)))

  console.log(theme.label('\nhot files'))
  for (const file of summary.hotFiles) {
    const bar = '█'.repeat(Math.min(file.totalEvents, 20))
    console.log(
      `  ${theme.bright(file.relativePath.padEnd(40))} ` +
      `${theme.dim(bar)} ${theme.bright(String(file.totalEvents))}`
    )
  }

  console.log(theme.label('\nmost written'))
  for (const file of summary.mostWrittenFiles) {
    console.log(
      `  ${theme.bright(file.relativePath.padEnd(40))} ` +
      `${theme.dim(`${file.writeCount} writes`)}`
    )
  }

  console.log(theme.label('\nfile types'))
  const ext = summary.extensions
  for (const [extension, count] of Object.entries(ext).slice(0, 8)) {
    console.log(
      `  ${theme.label(extension.padEnd(12))}${theme.bright(String(count))}`
    )
  }

  console.log()
}

function printReportByAgent(events: AgentEvent[]): void {
  const sections = buildAgentReportSections(events)

  for (const section of sections) {
    console.log(
      `${theme.bright(section.agent)} ${theme.dim(`(${section.sessionCount} sessions)`)}`
    )

    for (const file of section.hotFiles) {
      const bar = '█'.repeat(Math.min(file.totalEvents, 20))
      console.log(
        `  ${theme.bright(file.relativePath.padEnd(40))} ` +
        `${theme.dim(bar)} ${theme.bright(String(file.totalEvents))}`
      )
    }

    console.log()
  }
}
