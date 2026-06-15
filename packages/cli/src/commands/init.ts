import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { DEFAULT_MOATLOGIGNORE_PATTERNS, AGENTS_MD_STUB } from '@moatlog/core'
import { buildPermissionsJson } from './doctor.js'
import * as theme from '../theme.js'

export type InitAgent = 'auto' | 'cursor' | 'claude-code' | 'all'

interface InitOptions {
  projectRoot: string
  force?: boolean
  agent?: InitAgent
}

interface FileSpec {
  rel: string
  template: string
  executable?: boolean
  substituteProjectName?: boolean
}

const CURSOR_INIT_FILES: FileSpec[] = [
  { rel: '.cursor/hooks.json', template: 'hooks.json' },
  {
    rel: '.cursor/hooks/moatlog-event.sh',
    template: 'moatlog-event.sh',
    executable: true,
    substituteProjectName: true
  },
  {
    rel: '.cursor/hooks/moatlog-distill.sh',
    template: 'moatlog-distill.sh',
    executable: true
  },
  { rel: '.cursor/rules/moatlog.mdc', template: 'moatlog.mdc' },
  {
    rel: '.cursor/rules/moatlog-skills-spec.mdc',
    template: 'cursor/rules/moatlog-skills-spec.mdc'
  }
]

const CLAUDE_INIT_FILES: FileSpec[] = [
  {
    rel: '.claude/hooks/moatlog-event-claude.sh',
    template: 'claude-code/moatlog-event-claude.sh',
    executable: true,
    substituteProjectName: true
  },
  {
    rel: '.claude/hooks/moatlog-distill-claude.sh',
    template: 'claude-code/moatlog-distill-claude.sh',
    executable: true,
    substituteProjectName: true
  }
]

function templateDir(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../templates'
  )
}

function readTemplate(name: string): string {
  return fs.readFileSync(path.join(templateDir(), name), 'utf-8')
}

function hasCommand(name: string): boolean {
  const result = spawnSync('command', ['-v', name], {
    shell: true,
    stdio: 'ignore'
  })
  return result.status === 0
}

export function resolveInitAgents(
  agent: InitAgent,
  projectRoot: string
): { cursor: boolean; claudeCode: boolean } {
  if (agent === 'cursor') {
    return { cursor: true, claudeCode: false }
  }
  if (agent === 'claude-code') {
    return { cursor: false, claudeCode: true }
  }
  if (agent === 'all') {
    return { cursor: true, claudeCode: true }
  }

  const claudeCode =
    fs.existsSync(path.join(projectRoot, '.claude')) || hasCommand('claude')
  return { cursor: true, claudeCode }
}

function resolveMcpConfig(projectRoot: string): { command: string; args: string[] } {
  const localBin = path.join(projectRoot, 'node_modules', '.bin', 'moatlog')
  if (fs.existsSync(localBin)) {
    return { command: localBin, args: ['mcp'] }
  }

  if (hasCommand('moatlog')) {
    return { command: 'moatlog', args: ['mcp'] }
  }

  return { command: 'npx', args: ['-y', '@moatlog/cli', 'mcp'] }
}

function buildMcpJson(projectRoot: string): string {
  const { command, args } = resolveMcpConfig(projectRoot)
  return `${JSON.stringify(
    {
      mcpServers: {
        moatlog: { command, args }
      }
    },
    null,
    2
  )}\n`
}

function writeFile(
  projectRoot: string,
  rel: string,
  content: string,
  options: { force: boolean; executable?: boolean }
): 'created' | 'updated' | 'skipped' {
  const dest = path.join(projectRoot, rel)

  if (fs.existsSync(dest) && !options.force) {
    return 'skipped'
  }

  const existed = fs.existsSync(dest)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, content, 'utf-8')

  if (options.executable) {
    fs.chmodSync(dest, 0o755)
  }

  return existed ? 'updated' : 'created'
}

function buildMoatlogignoreContent(): string {
  const header = [
    '# moatlog ignore patterns',
    '# files matching these patterns are excluded from event capture',
    '# and distillation. syntax is the same as .gitignore.',
    ''
  ].join('\n')
  const patterns = [...DEFAULT_MOATLOGIGNORE_PATTERNS, '.moatlog/']
  return `${header}${patterns.join('\n')}\n`
}

function ensureMoatlogignore(
  projectRoot: string,
  options: { force: boolean }
): 'created' | 'updated' | 'skipped' {
  return writeFile(projectRoot, '.moatlogignore', buildMoatlogignoreContent(), options)
}

function ensureGitignoreEntries(
  projectRoot: string,
  entries: string[]
): Array<'created' | 'updated' | 'skipped'> {
  const gitignorePath = path.join(projectRoot, '.gitignore')
  const results: Array<'created' | 'updated' | 'skipped'> = []

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `${entries.join('\n')}\n`, 'utf-8')
    return entries.map(() => 'created' as const)
  }

  const content = fs.readFileSync(gitignorePath, 'utf-8')
  const lines = content.split('\n')
  const missing = entries.filter(entry => {
    return !lines.some(
      line => line.trim() === entry || line.trim() === `${entry}/`
    )
  })

  if (missing.length === 0) {
    return entries.map(() => 'skipped' as const)
  }

  const suffix = content.endsWith('\n') ? '' : '\n'
  fs.writeFileSync(gitignorePath, `${content}${suffix}${missing.join('\n')}\n`, 'utf-8')

  for (const entry of entries) {
    const wasMissing = missing.includes(entry)
    results.push(wasMissing ? 'updated' : 'skipped')
  }

  return results
}

function ensureGitignore(projectRoot: string): 'created' | 'updated' | 'skipped' {
  const [moatlogResult] = ensureGitignoreEntries(projectRoot, ['.moatlog'])
  return moatlogResult
}

function ensureClaudeHooksGitignore(projectRoot: string): 'created' | 'updated' | 'skipped' {
  const [hooksResult] = ensureGitignoreEntries(projectRoot, ['.claude/hooks'])
  return hooksResult
}

const GITATTRIBUTES_ENTRIES = [
  '.moatlog/moat.json merge=moatlog-union',
  '# moatlog skills spec — source of truth, do not merge',
  '.cursor/rules/moatlog-skills-spec.mdc merge=ours',
  '# moatlog skills — regenerated on conflict',
  '.cursor/rules/moatlog-*.mdc merge=moatlog-skills-regen',
  'AGENTS.md merge=moatlog-skills-regen'
]

function ensureGitattributes(projectRoot: string): 'created' | 'updated' | 'skipped' {
  const gitattributesPath = path.join(projectRoot, '.gitattributes')

  if (!fs.existsSync(gitattributesPath)) {
    fs.writeFileSync(gitattributesPath, `${GITATTRIBUTES_ENTRIES.join('\n')}\n`, 'utf-8')
    return 'created'
  }

  const content = fs.readFileSync(gitattributesPath, 'utf-8')
  const missing = GITATTRIBUTES_ENTRIES.filter(entry => !content.includes(entry))

  if (missing.length === 0) {
    return 'skipped'
  }

  const suffix = content.endsWith('\n') ? '' : '\n'
  fs.writeFileSync(gitattributesPath, `${content}${suffix}${missing.join('\n')}\n`, 'utf-8')
  return 'updated'
}

function resolveMoatlogCommand(projectRoot: string): string {
  const localBin = path.join(projectRoot, 'node_modules', '.bin', 'moatlog')
  if (fs.existsSync(localBin)) return localBin
  if (hasCommand('moatlog')) return 'moatlog'
  return 'npx -y @moatlog/cli'
}

function registerMergeDriver(projectRoot: string): 'configured' | 'skipped' {
  if (!fs.existsSync(path.join(projectRoot, '.git'))) {
    return 'skipped'
  }

  const moatlogCmd = resolveMoatlogCommand(projectRoot)
  const driver = `${moatlogCmd} merge-driver %O %A %B %A`
  const result = spawnSync('git', ['config', 'merge.moatlog-union.driver', driver], {
    cwd: projectRoot,
    encoding: 'utf-8'
  })

  return result.status === 0 ? 'configured' : 'skipped'
}

function registerSkillsRegenDriver(projectRoot: string): 'configured' | 'skipped' {
  if (!fs.existsSync(path.join(projectRoot, '.git'))) {
    return 'skipped'
  }

  const moatlogCmd = resolveMoatlogCommand(projectRoot)
  const driver = `${moatlogCmd} skills generate`
  const result = spawnSync('git', ['config', 'merge.moatlog-skills-regen.driver', driver], {
    cwd: projectRoot,
    encoding: 'utf-8'
  })

  return result.status === 0 ? 'configured' : 'skipped'
}

function ensureAgentsMdStub(projectRoot: string): 'created' | 'skipped' {
  const agentsPath = path.join(projectRoot, 'AGENTS.md')
  if (fs.existsSync(agentsPath)) {
    return 'skipped'
  }

  fs.writeFileSync(agentsPath, AGENTS_MD_STUB, 'utf-8')
  return 'created'
}

function mergeClaudeHookEntries(existing: unknown[], template: unknown[]): unknown[] {
  const merged = [...existing]
  for (const templateEntry of template) {
    if (merged.some(entry => JSON.stringify(entry) === JSON.stringify(templateEntry))) {
      continue
    }
    merged.push(templateEntry)
  }
  return merged
}

function mergeClaudeSettings(
  existing: Record<string, unknown>,
  template: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...existing }
  const existingHooks =
    existing.hooks && typeof existing.hooks === 'object'
      ? (existing.hooks as Record<string, unknown[]>)
      : {}
  const templateHooks =
    template.hooks && typeof template.hooks === 'object'
      ? (template.hooks as Record<string, unknown[]>)
      : {}

  const mergedHooks: Record<string, unknown[]> = { ...existingHooks }

  for (const [eventName, templateEntries] of Object.entries(templateHooks)) {
    const current = Array.isArray(mergedHooks[eventName]) ? mergedHooks[eventName] : []
    mergedHooks[eventName] = mergeClaudeHookEntries(current, templateEntries)
  }

  merged.hooks = mergedHooks
  return merged
}

function scaffoldFileSpecs(
  projectRoot: string,
  specs: FileSpec[],
  projectName: string,
  force: boolean,
  created: string[],
  updated: string[],
  skipped: string[]
): void {
  for (const spec of specs) {
    let content = readTemplate(spec.template)
    if (spec.substituteProjectName) {
      content = content.replaceAll('__PROJECT_NAME__', projectName)
    }

    const result = writeFile(projectRoot, spec.rel, content, {
      force,
      executable: spec.executable
    })

    if (result === 'created') created.push(spec.rel)
    else if (result === 'updated') updated.push(spec.rel)
    else skipped.push(spec.rel)
  }
}

function scaffoldClaudeSettings(
  projectRoot: string
): 'created' | 'updated' | 'skipped' {
  const settingsPath = path.join(projectRoot, '.claude', 'settings.json')
  const template = JSON.parse(
    readTemplate('claude-code/settings.json')
  ) as Record<string, unknown>

  if (!fs.existsSync(settingsPath)) {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    fs.writeFileSync(settingsPath, `${JSON.stringify(template, null, 2)}\n`, 'utf-8')
    return 'created'
  }

  const existing = JSON.parse(
    fs.readFileSync(settingsPath, 'utf-8')
  ) as Record<string, unknown>
  const merged = mergeClaudeSettings(existing, template)
  const before = JSON.stringify(existing)
  const after = JSON.stringify(merged)

  if (before === after) {
    return 'skipped'
  }

  fs.writeFileSync(settingsPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf-8')
  return 'updated'
}

export function init({
  projectRoot,
  force = false,
  agent = 'auto'
}: InitOptions): void {
  const projectName = path.basename(projectRoot)
  const agents = resolveInitAgents(agent, projectRoot)
  const created: string[] = []
  const updated: string[] = []
  const skipped: string[] = []

  if (!hasCommand('jq')) {
    console.log(theme.warn('⚠ jq is required for agent hooks but was not found on PATH'))
    console.log(theme.dim('  install jq, then re-run moatlog init if hooks fail\n'))
  }

  fs.mkdirSync(path.join(projectRoot, '.moatlog'), { recursive: true })

  if (agents.cursor) {
    scaffoldFileSpecs(
      projectRoot,
      CURSOR_INIT_FILES,
      projectName,
      force,
      created,
      updated,
      skipped
    )

    const mcpResult = writeFile(
      projectRoot,
      '.cursor/mcp.json',
      buildMcpJson(projectRoot),
      { force }
    )

    if (mcpResult === 'created') created.push('.cursor/mcp.json')
    else if (mcpResult === 'updated') updated.push('.cursor/mcp.json')
    else skipped.push('.cursor/mcp.json')

    const permissionsResult = writeFile(
      projectRoot,
      '.cursor/permissions.json',
      buildPermissionsJson(),
      { force }
    )

    if (permissionsResult === 'created') created.push('.cursor/permissions.json')
    else if (permissionsResult === 'updated') updated.push('.cursor/permissions.json')
    else skipped.push('.cursor/permissions.json')
  }

  let claudeSettingsResult: 'created' | 'updated' | 'skipped' | null = null
  let claudeHooksCreated = false

  if (agents.claudeCode) {
    scaffoldFileSpecs(
      projectRoot,
      CLAUDE_INIT_FILES,
      projectName,
      force,
      created,
      updated,
      skipped
    )

    claudeSettingsResult = scaffoldClaudeSettings(projectRoot)
    if (claudeSettingsResult === 'created') {
      created.push('.claude/settings.json')
    } else if (claudeSettingsResult === 'updated') {
      updated.push('.claude/settings.json')
    } else {
      skipped.push('.claude/settings.json')
    }

    const hooksGitignoreResult = ensureClaudeHooksGitignore(projectRoot)
    if (hooksGitignoreResult === 'created') created.push('.gitignore (.claude/hooks)')
    else if (hooksGitignoreResult === 'updated') updated.push('.gitignore (.claude/hooks)')

    claudeHooksCreated =
      created.some(file => file.startsWith('.claude/hooks/')) ||
      updated.some(file => file.startsWith('.claude/hooks/'))

    const agentsMdResult = ensureAgentsMdStub(projectRoot)
    if (agentsMdResult === 'created') {
      created.push('AGENTS.md')
    }
  }

  const moatlogignoreResult = ensureMoatlogignore(projectRoot, { force })
  if (moatlogignoreResult === 'updated') updated.push('.moatlogignore')
  else if (moatlogignoreResult === 'skipped') skipped.push('.moatlogignore')

  if (agents.cursor || agents.claudeCode) {
    const gitignoreResult = ensureGitignore(projectRoot)
    if (gitignoreResult === 'created') created.push('.gitignore')
    else if (gitignoreResult === 'updated') updated.push('.gitignore')

    const gitattributesResult = ensureGitattributes(projectRoot)
    if (gitattributesResult === 'created') created.push('.gitattributes')
    else if (gitattributesResult === 'updated') updated.push('.gitattributes')

    if (registerMergeDriver(projectRoot) === 'configured') {
      updated.push('git config merge.moatlog-union.driver')
    }

    if (registerSkillsRegenDriver(projectRoot) === 'configured') {
      updated.push('git config merge.moatlog-skills-regen.driver')
    }
  }

  console.log(theme.heading('moatlog init\n'))

  if (created.length > 0) {
    console.log(theme.label('created'))
    for (const file of created) {
      console.log(theme.fieldPlain('', file, 0))
    }
    console.log('')
  }

  if (updated.length > 0) {
    console.log(theme.label('updated'))
    for (const file of updated) {
      console.log(theme.fieldPlain('', file, 0))
    }
    console.log('')
  }

  if (skipped.length > 0) {
    console.log(theme.dim('skipped (already exists — use --force to overwrite):'))
    for (const file of skipped) {
      console.log(theme.dim(`  ${file}`))
    }
    console.log('')
  }

  if (moatlogignoreResult === 'created') {
    console.log(theme.success('  ✓ .moatlogignore — default secret patterns'))
    console.log('')
  }

  if (
    created.includes('.cursor/rules/moatlog-skills-spec.mdc') ||
    updated.includes('.cursor/rules/moatlog-skills-spec.mdc')
  ) {
    console.log(theme.success('  ✓ .cursor/rules/moatlog-skills-spec.mdc — skills schema'))
    console.log('')
  }

  if (created.includes('AGENTS.md')) {
    console.log(theme.success('  ✓ AGENTS.md — behavioral skills section ready'))
    console.log('')
  }

  if (claudeSettingsResult === 'created' || claudeSettingsResult === 'updated') {
    console.log(theme.success('  ✓ .claude/settings.json — Claude Code hooks wired'))
  }
  if (claudeHooksCreated) {
    console.log(theme.success('  ✓ .claude/hooks/ — moatlog event scripts'))
  }
  if (claudeSettingsResult === 'created' || claudeSettingsResult === 'updated' || claudeHooksCreated) {
    console.log('')
  }

  console.log(theme.label('next steps'))
  if (agents.cursor) {
    console.log(theme.dim('  1. Restart Cursor so hooks and MCP reload'))
  }
  if (agents.claudeCode) {
    console.log(
      theme.dim(
        `  ${agents.cursor ? '2' : '1'}. Restart Claude Code so .claude/settings.json hooks reload`
      )
    )
  }
  const workStep = agents.cursor && agents.claudeCode ? 3 : agents.claudeCode ? 2 : 2
  console.log(
    theme.dim(
      `  ${workStep}. Work in Agent mode — events append to .moatlog/ from any configured agent`
    )
  )
  console.log(theme.dim(`  ${workStep + 1}. Run \`moatlog status\` to check hooks and moat strength`))
  console.log(
    theme.dim(`  ${workStep + 2}. Agents call get_task_context via MCP at session start`)
  )
  console.log(
    theme.dim(`  ${workStep + 3}. Run \`moatlog doctor\` if hooks or MCP are not connecting`)
  )
}
