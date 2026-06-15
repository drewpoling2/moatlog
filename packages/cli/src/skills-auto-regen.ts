import {
  generateAndWriteSkills,
  isLlmAvailable,
  shouldAutoRegenSkills,
  type Moat
} from '@moatlog/core'
import * as theme from './theme.js'
import { readSkillsSpec } from './skills-spec.js'

async function attemptLlmRegen(
  moat: Moat,
  projectRoot: string
): Promise<Awaited<ReturnType<typeof generateAndWriteSkills>>> {
  let specContent: string | undefined
  try {
    specContent = readSkillsSpec(projectRoot)
  } catch {
    return null
  }

  return generateAndWriteSkills(moat, projectRoot, { specContent })
}

export async function autoRegenerateSkills(
  moat: Moat,
  projectRoot: string,
  options?: { force?: boolean }
): Promise<{ action: 'skip' | 'regen'; result?: NonNullable<Awaited<ReturnType<typeof generateAndWriteSkills>>> }> {
  if (!options?.force && !shouldAutoRegenSkills(projectRoot, moat)) {
    if (isLlmAvailable()) {
      console.log(
        theme.dim('  skills current — run moatlog skills generate to update')
      )
    }
    return { action: 'skip' }
  }

  const result = await attemptLlmRegen(moat, projectRoot)
  if (!result || result.count === 0) {
    return { action: 'skip' }
  }

  for (const agent of result.agents) {
    const dest = agent === 'cursor' ? '.cursor/rules/' : 'AGENTS.md'
    console.log(
      theme.dim(
        `  regenerated ${result.count} skill${result.count === 1 ? '' : 's'} → ${dest} (${agent})`
      )
    )
  }

  return { action: 'regen', result }
}

export async function autoRegenerateSkillsAfterMerge(
  moat: Moat,
  projectRoot: string
): Promise<void> {
  const result = await attemptLlmRegen(moat, projectRoot)
  if (!result || result.count === 0) {
    return
  }

  for (const agent of result.agents) {
    const dest = agent === 'cursor' ? '.cursor/rules/' : 'AGENTS.md'
    console.log(
      theme.dim(
        `  regenerated ${result.count} skill${result.count === 1 ? '' : 's'} → ${dest} (${agent})`
      )
    )
  }
}
