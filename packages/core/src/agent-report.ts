import { Profiler } from './profiler.js'
import type { AgentEvent, AgentName } from './types.js'

export interface AgentReportFile {
  relativePath: string
  totalEvents: number
}

export interface AgentReportSection {
  agent: AgentName
  sessionCount: number
  hotFiles: AgentReportFile[]
}

const DEFAULT_HOT_FILE_LIMIT = 5

export function collectAgents(events: AgentEvent[]): AgentName[] {
  return [...new Set(events.map(event => event.agent))].sort()
}

export function buildAgentReportSections(
  events: AgentEvent[],
  hotFileLimit = DEFAULT_HOT_FILE_LIMIT
): AgentReportSection[] {
  return collectAgents(events).map(agent => {
    const agentEvents = events.filter(event => event.agent === agent)
    const profiler = new Profiler(agentEvents)

    return {
      agent,
      sessionCount: profiler.getSessions().length,
      hotFiles: profiler.getHotFiles(hotFileLimit).map(file => ({
        relativePath: file.relativePath,
        totalEvents: file.totalEvents
      }))
    }
  })
}
