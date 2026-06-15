import * as path from 'path'
import {
  Distiller,
  generateSkills,
  clusterWindows,
  skillToMdc,
  skillFilename,
  findProjectRoot,
  buildAgentsMdSkillsSection,
  detectInstalledAgents,
  writeCursorSkills,
  writeAgentsMdSkills,
  type AgentName
} from '@moatlog/core'
import * as theme from '../theme.js'
import { readSkillsSpec } from '../skills-spec.js'

export interface SkillsOptions {
  projectRoot: string
  logDir: string
  action: 'list' | 'generate'
  preview?: boolean
  minOccurrences?: number
  help?: boolean
}

function agentDestination(agent: AgentName): string {
  if (agent === 'claude-code') return 'AGENTS.md'
  return '.cursor/rules/'
}

function printSkillsHelp(): void {
  console.log(`
moatlog skills — generate behavioral rules from moat.json patterns

Usage:
  moatlog skills                          List detected clusters
  moatlog skills generate [--preview] [--min-occurrences <n>]

Commands:
  list (default)    Show detected clusters without generating files
  generate          Write skills to agent-specific locations

Options:
  --preview                Show what would be written without writing
  --min-occurrences <n>    Minimum windows per cluster (default: 3)
  --help                   Show this help
`)
}

export async function skills(opts: SkillsOptions): Promise<number> {
  if (opts.help) {
    printSkillsHelp()
    return 0
  }

  const projectRoot = opts.projectRoot || findProjectRoot()
  const logDir = opts.logDir || path.join(projectRoot, '.moatlog')

  const distiller = new Distiller(logDir, path.basename(projectRoot))
  const moat = distiller.load()

  if (!moat) {
    console.error(theme.warn('moat.json not found — run moatlog distill first'))
    return 1
  }

  const highQualityWindows = (moat.promptWindows ?? []).filter(w => w.windowQuality === 'high')

  if (highQualityWindows.length === 0) {
    console.log(theme.dim('no high-quality windows found — need agent sessions with clear task descriptions'))
    return 0
  }

  if (opts.action === 'list' || (!opts.action && !opts.preview)) {
    const clusters = clusterWindows(highQualityWindows, { minOccurrences: opts.minOccurrences })

    if (clusters.length === 0) {
      console.log(
        theme.dim(
          `not enough data — need at least ${opts.minOccurrences ?? 3} high-quality windows per cluster\n` +
            `currently: ${highQualityWindows.length} high-quality windows`
        )
      )
      return 0
    }

    console.log(
      theme.heading(
        `detected ${clusters.length} cluster${clusters.length === 1 ? '' : 's'} from ${highQualityWindows.length} high-quality window${highQualityWindows.length === 1 ? '' : 's'}\n`
      )
    )

    for (const cluster of clusters) {
      const topFiles = cluster.fileFrequencies
        .slice(0, 3)
        .map(f => path.basename(f.path))
        .join(', ')

      console.log(theme.bright(`cluster ${cluster.occurrences}`))
      console.log(theme.dim(`  files: ${topFiles}`))
      console.log('')
    }

    return 0
  }

  let specContent: string
  try {
    specContent = readSkillsSpec(projectRoot)
  } catch (err) {
    console.error(theme.warn((err as Error).message))
    return 1
  }

  const generatedSkills = await generateSkills(moat, {
    minOccurrences: opts.minOccurrences,
    specContent,
    debug: opts.preview
  })

  if (generatedSkills === null) {
    console.log(
      theme.dim(
        'skills require an LLM — install Cursor or Claude Code CLI, or set ANTHROPIC_API_KEY'
      )
    )
    return 0
  }

  if (generatedSkills.length === 0) {
    console.log(
      theme.warn(
        `no skills to generate — need at least ${opts.minOccurrences ?? 3} high-quality windows per cluster`
      )
    )
    return 0
  }

  const installedAgents = detectInstalledAgents(projectRoot)
  if (installedAgents.length === 0) {
    console.log(theme.warn('no agent hooks found — run moatlog init first'))
    return 1
  }

  if (opts.preview) {
    console.log(theme.heading(`preview: would generate ${generatedSkills.length} skill${generatedSkills.length === 1 ? '' : 's'}\n`))

    if (installedAgents.includes('cursor')) {
      console.log(theme.label('cursor → .cursor/rules/'))
      for (const skill of generatedSkills) {
        console.log(theme.bright(`${skillFilename(skill)}`))
        console.log(theme.dim('─'.repeat(60)))
        console.log(skillToMdc(skill))
        console.log('')
      }
    }

    if (installedAgents.includes('claude-code')) {
      console.log(theme.label('claude-code → AGENTS.md'))
      console.log(theme.dim('─'.repeat(60)))
      console.log(buildAgentsMdSkillsSection(generatedSkills))
      console.log('')
    }

    return 0
  }

  const writtenAgents: AgentName[] = []

  if (installedAgents.includes('cursor')) {
    writeCursorSkills(projectRoot, generatedSkills)
    writtenAgents.push('cursor')
  }

  if (installedAgents.includes('claude-code')) {
    writeAgentsMdSkills(projectRoot, generatedSkills)
    writtenAgents.push('claude-code')
  }

  console.log(theme.heading(`generated ${generatedSkills.length} skill${generatedSkills.length === 1 ? '' : 's'}\n`))

  for (const agent of writtenAgents) {
    console.log(theme.bright(`  → ${agentDestination(agent)} (${agent})`))
    for (const skill of generatedSkills) {
      if (agent === 'cursor') {
        console.log(theme.dim(`    ${skillFilename(skill)} — ${skill.occurrences} window${skill.occurrences === 1 ? '' : 's'}`))
      } else {
        console.log(theme.dim(`    ### ${skill.name} — ${skill.occurrences} window${skill.occurrences === 1 ? '' : 's'}`))
      }
    }
    console.log('')
  }

  return 0
}
