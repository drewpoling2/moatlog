import * as fs from 'fs'
import * as path from 'path'
import {
  hasAgentsMdSkillsSection,
  writeAgentsMdSkills
} from './agents-md.js'
import { detectInstalledAgents } from './agents.js'
import { isLlmAvailable, runWithLlm, parseJsonFromLlmResponse } from './llm.js'
import type { AgentName, Moat, PromptWindow } from './types.js'

export const LLM_SKILL_MARKER = '<!-- moatlog-llm-generated -->'
export const NEW_SESSIONS_AUTO_REGEN_THRESHOLD = 5

export interface Skill {
  name: string
  description: string
  triggerDescription: string
  coreFiles: Array<{ path: string; pct: number }>
  coAccessPairs: Array<{ a: string; b: string; support: number }>
  guidance: string
  exampleTasks: string[]
  occurrences: number
}

interface SkillCluster {
  windows: PromptWindow[]
  taskExcerpts: string[]
  fileFrequencies: Array<{ path: string; count: number; pct: number }>
  coAccessPairs: Array<{ a: string; b: string; support: number }>
  occurrences: number
}

function jaccardSimilarity(filesA: Set<string>, filesB: Set<string>): number {
  const intersection = new Set([...filesA].filter(f => filesB.has(f)))
  const union = new Set([...filesA, ...filesB])
  return union.size === 0 ? 0 : intersection.size / union.size
}

export function clusterWindows(
  windows: PromptWindow[],
  options?: { minOccurrences?: number }
): SkillCluster[] {
  const minOccurrences = options?.minOccurrences ?? 3

  if (windows.length === 0) return []

  // Group windows by Jaccard similarity (>0.4)
  const clusters: PromptWindow[][] = []
  const processed = new Set<string>()

  for (const w of windows) {
    if (processed.has(w.id)) continue

    const cluster: PromptWindow[] = [w]
    const fileSet = new Set(w.files)
    processed.add(w.id)

    // Find all similar windows
    for (const other of windows) {
      if (processed.has(other.id)) continue
      const otherSet = new Set(other.files)
      const similarity = jaccardSimilarity(fileSet, otherSet)

      if (similarity > 0.4) {
        cluster.push(other)
        processed.add(other.id)
        // Merge file sets for transitivity
        for (const f of other.files) {
          fileSet.add(f)
        }
      }
    }

    // Only keep clusters with minimum occurrences
    if (cluster.length >= minOccurrences) {
      clusters.push(cluster)
    }
  }

  // Convert to SkillCluster with computed metrics
  const skillClusters: SkillCluster[] = []

  for (const cluster of clusters) {
    const totalWindows = cluster.length

    // Compute file frequencies
    const fileFreq = new Map<string, number>()
    for (const w of cluster) {
      for (const file of w.files) {
        fileFreq.set(file, (fileFreq.get(file) ?? 0) + 1)
      }
    }

    const fileFrequencies = Array.from(fileFreq.entries())
      .filter(([_, count]) => count > totalWindows * 0.6) // Only >60% files
      .map(([path, count]) => ({
        path,
        count,
        pct: Math.round((count / totalWindows) * 100)
      }))
      .sort((a, b) => b.count - a.count)

    if (fileFrequencies.length < 2) continue // Skip if <2 core files

    // Get co-access pairs (would need moat.hotFiles passed in)
    const coreFileSet = new Set(fileFrequencies.map(f => f.path))
    const coAccessPairs: Array<{ a: string; b: string; support: number }> = []

    // Collect co-access data from cluster windows
    for (const w of cluster) {
      for (let i = 0; i < w.files.length; i++) {
        for (let j = i + 1; j < w.files.length; j++) {
          if (coreFileSet.has(w.files[i]) && coreFileSet.has(w.files[j])) {
            const a = w.files[i]
            const b = w.files[j]
            const existing = coAccessPairs.find(
              p => (p.a === a && p.b === b) || (p.a === b && p.b === a)
            )
            if (existing) {
              existing.support++
            } else {
              coAccessPairs.push({ a, b, support: 1 })
            }
          }
        }
      }
    }

    coAccessPairs.sort((a, b) => b.support - a.support)

    // Get example tasks
    const taskExcerpts = cluster
      .filter(w => w.taskExcerpt)
      .map(w => w.taskExcerpt!)
      .sort((a, b) => a.length - b.length)
      .slice(0, 3)

    skillClusters.push({
      windows: cluster,
      taskExcerpts,
      fileFrequencies,
      coAccessPairs,
      occurrences: totalWindows
    })
  }

  return skillClusters.sort((a, b) => b.occurrences - a.occurrences)
}

interface LlmSkillResponse {
  clusterId?: number
  name: string
  description: string
  triggerDescription: string
  coreFiles?: string[]
  guidance: string
  exampleTasks?: string[]
}

function normalizeCoreFilePath(filePath: string): string {
  return filePath.replace(/\s*\(\d+%\)\s*$/, '').trim()
}

async function synthesizeWithLlm(
  moat: Moat,
  clusters: SkillCluster[],
  options?: {
    specContent?: string
    debug?: boolean
    llmRunner?: (prompt: string) => Promise<string | null>
  }
): Promise<Skill[] | null> {
  const clusterData = clusters.map((c, i) => ({
    id: i + 1,
    occurrences: c.occurrences,
    taskExcerpts: c.taskExcerpts.slice(0, 5),
    fileFrequencies: c.fileFrequencies.slice(0, 6),
    coAccessPairs: c.coAccessPairs.slice(0, 4)
  }))

  const specIncluded = Boolean(options?.specContent?.trim())
  const prompt = JSON.stringify({
    instruction: options?.specContent ?? '',
    project: moat.projectName,
    task:
      'Generate one skill definition per cluster following the naming formula and format rules in instruction exactly. Return ONLY valid JSON matching responseFormat — no prose, no markdown fences, no explanation before or after the JSON.',
    clusters: clusterData,
    responseFormat: {
      skills: [
        {
          id: 1,
          name: 'domain-subdomain-outcome',
          description: 'one sentence describing the type of work',
          triggerDescription: 'When editing specific/file/paths.ts or other/core/files.ts',
          coreFiles: ['only files with >60% frequency from cluster'],
          guidance: '2-4 sentences explaining why these files change together',
          exampleTasks: ['real task excerpt from cluster']
        }
      ]
    }
  })

  const debug = options?.debug
  const log = (message: string) => {
    if (debug) console.error(`[moatlog skills] ${message}`)
  }

  log(`spec file included in prompt: ${specIncluded ? 'yes' : 'no'}`)
  log(`prompt (first 200 chars): ${prompt.slice(0, 200)}`)

  try {
    const runLlm = options?.llmRunner ?? ((prompt: string) => runWithLlm(prompt, { debug }))
    const response = await runLlm(prompt)
    if (!response) {
      log('LLM response: null')
      return null
    }

    log(`LLM response (first 500 chars): ${response.slice(0, 500)}`)

    const parsed = parseJsonFromLlmResponse<{ skills: LlmSkillResponse[] }>(response)
    if (!parsed || !parsed.skills || !Array.isArray(parsed.skills)) {
      log('JSON parse: failed — no skills array in response')
      return null
    }

    log(`JSON parse: succeeded (${parsed.skills.length} skills)`)

    return parsed.skills.map((item) => {
      const clusterIdx = ((item as LlmSkillResponse & { id?: number }).id ?? item.clusterId ?? 1) - 1
      const cluster = clusters[clusterIdx]

      return {
        name: item.name || `skill-${clusterIdx + 1}`,
        description: item.description || 'Task skill',
        triggerDescription: item.triggerDescription || 'Apply this skill',
        coreFiles: (item.coreFiles || cluster?.fileFrequencies.map(f => f.path) || []).map(p => {
          const path = normalizeCoreFilePath(p)
          return {
            path,
            pct: cluster?.fileFrequencies.find(f => f.path === path)?.pct ?? 0
          }
        }),
        coAccessPairs: cluster?.coAccessPairs ?? [],
        guidance: item.guidance || 'See core files.',
        exampleTasks: item.exampleTasks || cluster?.taskExcerpts.slice(0, 3) || [],
        occurrences: cluster?.occurrences ?? 0
      }
    })
  } catch (err) {
    log(`LLM synthesis error: ${(err as Error).message}`)
    return null
  }
}

export async function generateSkills(
  moat: Moat,
  options?: {
    minOccurrences?: number
    specContent?: string
    debug?: boolean
    llmRunner?: (prompt: string) => Promise<string | null>
  }
): Promise<Skill[] | null> {
  const highQualityWindows = (moat.promptWindows ?? []).filter(w => w.windowQuality === 'high')

  if (highQualityWindows.length < (options?.minOccurrences ?? 3)) {
    return []
  }

  const clusters = clusterWindows(highQualityWindows, { minOccurrences: options?.minOccurrences })

  if (clusters.length === 0) {
    return []
  }

  const llmSkills = await synthesizeWithLlm(moat, clusters, options)
  if (!llmSkills || llmSkills.length === 0) {
    return null
  }

  return llmSkills
}

export function skillFilename(skill: Skill): string {
  return `moatlog-${skill.name}.mdc`
}

export const SKILLS_SPEC_FILENAME = 'moatlog-skills-spec.mdc'

export function isGeneratedSkillFilename(filename: string): boolean {
  return (
    filename.startsWith('moatlog-') &&
    filename.endsWith('.mdc') &&
    filename !== SKILLS_SPEC_FILENAME
  )
}

export function countGeneratedCursorSkills(projectRoot: string): number {
  const rulesDir = path.join(projectRoot, '.cursor', 'rules')
  if (!fs.existsSync(rulesDir)) return 0
  return fs.readdirSync(rulesDir).filter(isGeneratedSkillFilename).length
}

export function getExistingSkillFiles(projectRoot: string): string[] {
  const rulesDir = path.join(projectRoot, '.cursor', 'rules')
  if (!fs.existsSync(rulesDir)) return []
  return fs
    .readdirSync(rulesDir)
    .filter(isGeneratedSkillFilename)
    .map(file => path.join(rulesDir, file))
}

export function hasLlmGeneratedSkills(projectRoot: string): boolean {
  const skillFiles = getExistingSkillFiles(projectRoot)
  if (skillFiles.some(file => fs.readFileSync(file, 'utf-8').includes(LLM_SKILL_MARKER))) {
    return true
  }

  const agentsPath = path.join(projectRoot, 'AGENTS.md')
  return (
    fs.existsSync(agentsPath) &&
    fs.readFileSync(agentsPath, 'utf-8').includes(LLM_SKILL_MARKER)
  )
}

export function skillsAreStale(projectRoot: string, moat: Moat): boolean {
  const skillFiles = getExistingSkillFiles(projectRoot)
  const agentsPath = path.join(projectRoot, 'AGENTS.md')
  const moatGeneratedAt = new Date(moat.generatedAt).getTime()

  const hasAgentsSection =
    fs.existsSync(agentsPath) &&
    hasAgentsMdSkillsSection(fs.readFileSync(agentsPath, 'utf-8'))

  if (skillFiles.length === 0 && !hasAgentsSection) {
    return true
  }

  let oldestMtime = Infinity
  for (const file of skillFiles) {
    oldestMtime = Math.min(oldestMtime, fs.statSync(file).mtimeMs)
  }

  if (hasAgentsSection) {
    oldestMtime = Math.min(oldestMtime, fs.statSync(agentsPath).mtimeMs)
  }

  if (oldestMtime === Infinity) {
    return true
  }

  return moatGeneratedAt > oldestMtime
}

export function shouldAutoRegenSkills(
  projectRoot: string,
  moat: Moat,
  options?: { llmAvailable?: boolean }
): boolean {
  if (!(options?.llmAvailable ?? isLlmAvailable())) {
    return false
  }

  const skillFiles = getExistingSkillFiles(projectRoot)
  const agentsPath = path.join(projectRoot, 'AGENTS.md')
  const hasAgentsSection =
    fs.existsSync(agentsPath) &&
    hasAgentsMdSkillsSection(fs.readFileSync(agentsPath, 'utf-8'))

  if (skillFiles.length === 0 && !hasAgentsSection) {
    return true
  }

  if (!hasLlmGeneratedSkills(projectRoot)) {
    return true
  }

  const mtimes = skillFiles.map(file => fs.statSync(file).mtimeMs)
  if (hasAgentsSection) {
    mtimes.push(fs.statSync(agentsPath).mtimeMs)
  }
  const skillMtime = Math.min(...mtimes)

  const newSessions = (moat.promptWindows ?? []).filter(
    window => new Date(window.timestamp).getTime() > skillMtime
  ).length

  return newSessions >= NEW_SESSIONS_AUTO_REGEN_THRESHOLD
}

export function writeCursorSkills(projectRoot: string, skills: Skill[]): void {
  const rulesDir = path.join(projectRoot, '.cursor', 'rules')
  fs.mkdirSync(rulesDir, { recursive: true })

  const existingFiles = fs.readdirSync(rulesDir).filter(isGeneratedSkillFilename)
  for (const file of existingFiles) {
    fs.unlinkSync(path.join(rulesDir, file))
  }

  for (const skill of skills) {
    const filepath = path.join(rulesDir, skillFilename(skill))
    fs.writeFileSync(filepath, skillToMdc(skill))
  }
}

const SKILL_FOOTER = `---
*Skill generated by moatlog from behavioral data.
Keep current: \`moatlog skills generate\` after significant
work in this area.*`

export function skillToMdc(skill: Skill): string {
  const frontmatter = [
    '---',
    `description: ${skill.description}`,
    'globs:',
    'alwaysApply: false',
    '---'
  ].join('\n')

  const title = `# moatlog: ${skill.name}`
  const autoGenNote = '> Auto-generated from .moatlog/moat.json — do not edit.\n> Regenerate: `moatlog skills generate`'

  const whenApplies = `## When this applies\n${skill.triggerDescription}`

  const coreFilesSection = [
    '## Core files',
    ...skill.coreFiles.map(f => `- \`${f.path}\`\n  (${f.pct}% of similar tasks)`)
  ].join('\n')

  const qualifyingPairs = skill.coAccessPairs.filter(p => p.support > 3)
  const coAccessSection =
    qualifyingPairs.length > 0
      ? [
          '## Co-access patterns',
          ...qualifyingPairs.map(p => `- \`${p.a}\` ↔ \`${p.b}\` (support: ${p.support})`)
        ].join('\n')
      : ''

  const examplesSection = skill.exampleTasks.length > 0
    ? `## Example tasks\n${skill.exampleTasks.map(t => `- "${t}"`).join('\n')}`
    : ''

  const beforeStarting = [
    '## Before starting',
    skill.guidance
  ].join('\n')

  const parts = [
    frontmatter,
    '',
    title,
    '',
    LLM_SKILL_MARKER,
    '',
    autoGenNote,
    '',
    whenApplies,
    '',
    coreFilesSection
  ]

  if (coAccessSection) parts.push('', coAccessSection)

  if (examplesSection) parts.push('', examplesSection)

  parts.push('', beforeStarting, '', SKILL_FOOTER, '')

  return parts.join('\n')
}

export async function generateAndWriteSkills(
  moat: Moat,
  projectRoot: string,
  options?: {
    minOccurrences?: number
    specContent?: string
    debug?: boolean
    llmRunner?: (prompt: string) => Promise<string | null>
  }
): Promise<{ count: number; agents: AgentName[] } | null> {
  const installedAgents = detectInstalledAgents(projectRoot)
  if (installedAgents.length === 0) {
    return { count: 0, agents: [] }
  }

  const skills = await generateSkills(moat, options)
  if (skills === null) {
    return null
  }
  if (skills.length === 0) {
    return { count: 0, agents: [] }
  }

  const writtenAgents: AgentName[] = []

  if (installedAgents.includes('cursor')) {
    writeCursorSkills(projectRoot, skills)
    writtenAgents.push('cursor')
  }

  if (installedAgents.includes('claude-code')) {
    writeAgentsMdSkills(projectRoot, skills)
    writtenAgents.push('claude-code')
  }

  return { count: skills.length, agents: writtenAgents }
}
