import { existsSync } from 'fs'
import { join } from 'path'
import type { AgentName } from './types.js'

export function detectInstalledAgents(projectRoot: string): AgentName[] {
  const agents: AgentName[] = []
  if (existsSync(join(projectRoot, '.cursor', 'hooks'))) {
    agents.push('cursor')
  }
  if (existsSync(join(projectRoot, '.claude', 'hooks'))) {
    agents.push('claude-code')
  }
  return agents
}
