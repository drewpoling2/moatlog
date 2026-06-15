import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import {
  applyMergeDecisions,
  autoResolveQualityConflicts,
  createEmptyMoat,
  formatMergeSummary,
  mergeMoat,
  type MergeConflict,
  type MergeResolutionDecision,
  type Moat
} from '@moatlog/core'
import * as theme from '../theme.js'
import { autoRegenerateSkillsAfterMerge } from '../skills-auto-regen.js'

export interface MergeOptions {
  projectRoot: string
  logDir: string
  branch?: string
  dryRun?: boolean
  noLlm?: boolean
  help?: boolean
}

export interface MergeDriverOptions {
  ancestorPath: string
  currentPath: string
  otherPath: string
  outputPath: string
}

const MOAT_JSON_PATH = '.moatlog/moat.json'

function printMergeHelp(): void {
  console.log(`
moatlog merge — merge another branch's moat.json into the current one

Usage:
  moatlog merge [--branch <branch>] [--dry-run] [--no-llm]

Options:
  --branch <branch>  Branch to merge from (default: main)
  --dry-run          Show what would change without writing moat.json
  --no-llm           Deterministic pass only; surface conflicts as text
  --help             Show this help
`)
}

function runGit(projectRoot: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf-8'
  })

  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim()
  }
}

function parseMoatJson(raw: string, label: string): Moat {
  try {
    return JSON.parse(raw) as Moat
  } catch {
    throw new Error(`Could not parse ${label} as moat.json`)
  }
}

function readMoatFile(filePath: string, label: string): Moat | null {
  if (!fs.existsSync(filePath)) return null
  return parseMoatJson(fs.readFileSync(filePath, 'utf-8'), label)
}

function gitShowMoat(projectRoot: string, ref: string): Moat | null {
  const result = runGit(projectRoot, ['show', `${ref}:${MOAT_JSON_PATH}`])
  if (!result.ok) return null
  if (!result.stdout) return null
  return parseMoatJson(result.stdout, ref)
}

function warnSchemaVersions(versions: Array<{ label: string; version?: string }>): void {
  const unique = [...new Set(versions.map(entry => entry.version).filter(Boolean))]
  if (unique.length <= 1) return

  console.log(theme.warn('⚠ moat.json schema versions differ between merge inputs:'))
  for (const entry of versions) {
    if (entry.version) {
      console.log(theme.dim(`  ${entry.label}: ${entry.version}`))
    }
  }
  console.log(theme.dim('  attempting merge anyway\n'))
}

function printConflicts(conflicts: MergeConflict[]): void {
  console.log(theme.warn(`${conflicts.length} conflicts require manual review:`))
  conflicts.forEach((conflict, index) => {
    console.log(`  ${index + 1}. ${conflict.type}: ${conflict.message}`)
  })
  console.log('')
  console.log(theme.dim('  re-run without --no-llm to attempt automatic resolution'))
  console.log(theme.dim('  or resolve manually and run moatlog distill'))
}

function buildConflictPrompt(conflicts: MergeConflict[]): string {
  return JSON.stringify({
    instruction:
      'Resolve moat.json merge conflicts. Return JSON only: {"decisions":[{"id":"...","action":"keep_ours|keep_theirs|drop_theirs_path|rename_theirs_to_ours|use_merged","path":"optional"}]}',
    conflicts: conflicts.map(conflict => ({
      id: conflict.id,
      type: conflict.type,
      message: conflict.message,
      evidence: conflict.evidence
    }))
  })
}

type AgentCli = 'cursor' | 'claude' | 'anthropic'

function detectAgentCli(): AgentCli | null {
  if (spawnSync('command', ['-v', 'cursor'], { shell: true, stdio: 'ignore' }).status === 0) {
    return 'cursor'
  }
  if (spawnSync('command', ['-v', 'claude'], { shell: true, stdio: 'ignore' }).status === 0) {
    return 'claude'
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return 'anthropic'
  }
  return null
}

function parseLlmDecisions(raw: string): MergeResolutionDecision[] | null {
  const trimmed = raw.trim()
  const jsonStart = trimmed.indexOf('{')
  const jsonEnd = trimmed.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1) return null

  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as {
      decisions?: MergeResolutionDecision[]
    }
    if (!Array.isArray(parsed.decisions)) return null
    return parsed.decisions
  } catch {
    return null
  }
}

function resolveConflictsWithAgent(
  conflicts: MergeConflict[],
  agent: AgentCli
): { decisions: MergeResolutionDecision[]; agentLabel: string } | null {
  const prompt = buildConflictPrompt(conflicts)

  if (agent === 'cursor') {
    const result = spawnSync(
      'cursor',
      ['-p', '--output-format', 'json', prompt],
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    )
    if (result.status !== 0) return null
    const decisions = parseLlmDecisions(result.stdout ?? '')
    return decisions ? { decisions, agentLabel: 'cursor' } : null
  }

  if (agent === 'claude') {
    const result = spawnSync('claude', ['-p', prompt], {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    })
    if (result.status !== 0) return null
    const decisions = parseLlmDecisions(result.stdout ?? '')
    return decisions ? { decisions, agentLabel: 'claude' } : null
  }

  return null
}

function fetchMergeInputs(
  projectRoot: string,
  logDir: string,
  branch: string
): { base: Moat | null; ours: Moat; theirs: Moat | null; twoWay: boolean } {
  if (!fs.existsSync(path.join(projectRoot, '.git'))) {
    throw new Error('Not a git repository — moatlog merge requires git')
  }

  const headCheck = runGit(projectRoot, ['rev-parse', '--verify', 'HEAD'])
  const branchCheck = runGit(projectRoot, ['rev-parse', '--verify', branch])
  if (!branchCheck.ok) {
    const currentBranch = runGit(projectRoot, ['branch', '--show-current'])
    if (!headCheck.ok && currentBranch.ok && currentBranch.stdout === branch) {
      const oursPath = path.join(logDir, 'moat.json')
      const ours = readMoatFile(oursPath, 'current moat.json') ?? createEmptyMoat({
        projectName: path.basename(projectRoot)
      })
      return { base: ours, ours, theirs: null, twoWay: true }
    }
    throw new Error(`Branch not found: ${branch}`)
  }

  const oursPath = path.join(logDir, 'moat.json')
  const ours = readMoatFile(oursPath, 'current moat.json') ?? createEmptyMoat({
    projectName: path.basename(projectRoot)
  })

  const theirs = gitShowMoat(projectRoot, branch)
  const mergeBase = runGit(projectRoot, ['merge-base', 'HEAD', branch])
  let base: Moat | null = null
  let twoWay = false

  if (mergeBase.ok && mergeBase.stdout) {
    base = gitShowMoat(projectRoot, mergeBase.stdout)
  }

  if (!base) {
    base = ours
    twoWay = true
  }

  return { base, ours, theirs, twoWay }
}

function finalizeMergeResult(
  base: Moat | null,
  ours: Moat,
  theirs: Moat
) {
  let result = mergeMoat(base, ours, theirs)
  result = autoResolveQualityConflicts(result)
  result = {
    ...result,
    conflicts: result.conflicts.filter(
      (conflict: MergeConflict) => conflict.type !== 'QUALITY_CONFLICT'
    )
  }
  return result
}

export function runMergeDriver({
  ancestorPath,
  currentPath,
  otherPath,
  outputPath
}: MergeDriverOptions): number {
  const base = readMoatFile(ancestorPath, 'ancestor moat.json') ?? createEmptyMoat()
  const ours = readMoatFile(currentPath, 'current moat.json') ?? createEmptyMoat()
  const theirs = readMoatFile(otherPath, 'other moat.json') ?? createEmptyMoat()

  const result = finalizeMergeResult(base, ours, theirs)
  fs.writeFileSync(outputPath, JSON.stringify(result.merged, null, 2))
  return 0
}

export async function merge({
  projectRoot,
  logDir,
  branch = 'main',
  dryRun = false,
  noLlm = false,
  help = false
}: MergeOptions): Promise<number> {
  if (help) {
    printMergeHelp()
    return 0
  }

  let inputs
  try {
    inputs = fetchMergeInputs(projectRoot, logDir, branch)
  } catch (err) {
    console.error(theme.warn((err as Error).message))
    return 1
  }

  const { base, ours, theirs, twoWay } = inputs

  if (!theirs) {
    console.log(theme.dim(`No moat.json on ${branch} — nothing to merge`))
    return 0
  }

  warnSchemaVersions([
    { label: 'base', version: base?._version },
    { label: 'ours', version: ours._version },
    { label: 'theirs', version: theirs._version }
  ])

  if (twoWay) {
    console.log(theme.dim('  no common ancestor moat.json — using two-way merge (ours as base)\n'))
  }

  let result = finalizeMergeResult(base, ours, theirs)

  if (result.summary.warnings.length > 0) {
    for (const warning of result.summary.warnings) {
      console.log(theme.dim(`  warning: ${warning}`))
    }
    console.log('')
  }

  if (result.conflicts.length > 0 && noLlm) {
    printConflicts(result.conflicts)
    if (!dryRun) {
      console.log(theme.dim('  moat.json not updated'))
    }
    return 1
  }

  if (result.conflicts.length > 0 && !noLlm) {
    const agent = detectAgentCli()
    if (agent) {
      const resolution = resolveConflictsWithAgent(result.conflicts, agent)
      if (resolution) {
        result = applyMergeDecisions(result, resolution.decisions)
        console.log(
          theme.dim(`  ${resolution.agentLabel} resolved ${resolution.decisions.length} conflicts`)
        )
      } else {
        console.log(theme.warn('  agent CLI returned invalid JSON — falling back to manual review'))
        printConflicts(result.conflicts)
        return 1
      }
    } else {
      printConflicts(result.conflicts)
      console.log(theme.dim('  no agent CLI detected (cursor, claude, or ANTHROPIC_API_KEY)'))
      return 1
    }
  }

  console.log(theme.heading('\nmoatlog merge\n'))
  console.log(theme.bright(formatMergeSummary(result)))

  if (dryRun) {
    console.log(theme.dim('\n  dry-run — moat.json not updated'))
    return 0
  }

  const outPath = path.join(logDir, 'moat.json')
  fs.mkdirSync(logDir, { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(result.merged, null, 2))
  console.log(theme.dim(`\n  saved ${outPath}`))

  await autoRegenerateSkillsAfterMerge(result.merged, projectRoot)

  return 0
}
