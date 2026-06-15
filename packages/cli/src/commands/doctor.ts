import { spawn, spawnSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import {
  EventLogger,
  detectInstalledAgents,
  countGeneratedCursorSkills,
  getExistingSkillFiles,
  hasAgentsMdSkillsSection,
  hasLlmGeneratedSkills,
  isLlmAvailable,
  LLM_SKILL_MARKER
} from '@moatlog/core'
import * as theme from '../theme.js'

interface DoctorOptions {
  projectRoot: string
  logDir: string
}

interface CheckResult {
  name: string
  pass: boolean
  detail: string
  fix?: string
  info?: boolean
}

export const MOATLOG_MCP_SERVER = 'moatlog'

export const MOATLOG_MCP_TOOLS = [
  'get_task_context',
  'get_hot_files',
  'get_file_history',
  'get_co_accessed_files'
] as const

export function buildPermissionsJson(): string {
  return `${JSON.stringify(
    {
      mcpAllowlist: MOATLOG_MCP_TOOLS.map(tool => `${MOATLOG_MCP_SERVER}:${tool}`)
    },
    null,
    2
  )}\n`
}

function readJsonFile(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function checkHooks(projectRoot: string): CheckResult {
  const hooksPath = path.join(projectRoot, '.cursor', 'hooks.json')
  const eventHookPath = path.join(projectRoot, '.cursor', 'hooks', 'moatlog-event.sh')

  if (!fs.existsSync(hooksPath)) {
    return {
      name: 'Cursor hooks',
      pass: false,
      detail: '.cursor/hooks.json not found',
      fix: 'Run `moatlog init` to scaffold hooks'
    }
  }

  const hooks = readJsonFile(hooksPath) as {
    version?: number
    hooks?: Record<string, Array<{ command?: string; matcher?: string }>>
  } | null

  if (!hooks || typeof hooks.version !== 'number') {
    return {
      name: 'Cursor hooks',
      pass: false,
      detail: 'hooks.json missing required version field',
      fix: 'Run `moatlog init --force` to regenerate hooks.json'
    }
  }

  const hookMap = hooks.hooks ?? {}
  const required = [
    'beforeReadFile',
    'preToolUse',
    'postToolUse',
    'afterFileEdit',
    'beforeSubmitPrompt',
    'stop'
  ]
  const missing = required.filter(name => !hookMap[name]?.length)

  if (missing.length > 0) {
    return {
      name: 'Cursor hooks',
      pass: false,
      detail: `missing hook entries: ${missing.join(', ')}`,
      fix: 'Run `moatlog init --force` to restore moatlog hooks'
    }
  }

  const readHook = hookMap.beforeReadFile?.[0]?.command ?? ''
  if (!readHook.includes('moatlog-event.sh')) {
    return {
      name: 'Cursor hooks',
      pass: false,
      detail: 'beforeReadFile is not wired to moatlog-event.sh',
      fix: 'Run `moatlog init --force` to restore moatlog hooks'
    }
  }

  const readCaptureHook = hookMap.postToolUse?.find(
    entry => entry.command?.includes('moatlog-event.sh') && entry.matcher === 'Read'
  )
  const preReadHook = hookMap.preToolUse?.find(
    entry => entry.command?.includes('moatlog-event.sh') && entry.matcher === 'Read'
  )
  if (!readCaptureHook || !preReadHook) {
    return {
      name: 'Cursor hooks',
      pass: false,
      detail: 'Read capture hooks missing — preToolUse/postToolUse Read entries not wired',
      fix: 'Run `moatlog init --force` to add Read capture hooks'
    }
  }

  if (!fs.existsSync(eventHookPath)) {
    return {
      name: 'Cursor hooks',
      pass: false,
      detail: '.cursor/hooks/moatlog-event.sh not found',
      fix: 'Run `moatlog init --force` to restore hook scripts'
    }
  }

  return {
    name: 'Cursor hooks',
    pass: true,
    detail: 'beforeReadFile + preToolUse/postToolUse Read capture wired to moatlog-event.sh'
  }
}

function checkReadCapture(logDir: string): CheckResult {
  const events = EventLogger.readAll(logDir, 7).filter(event => event.agent === 'cursor')
  const reads = events.filter(event => event.action === 'read').length
  const writes = events.filter(
    event => event.action === 'write' || event.action === 'create'
  ).length

  if (writes < 10) {
    return {
      name: 'Read capture',
      pass: true,
      detail: `${reads} reads · ${writes} writes in recent events (not enough activity to verify)`
    }
  }

  if (reads === 0 || reads < Math.max(3, Math.floor(writes * 0.05))) {
    return {
      name: 'Read capture',
      pass: false,
      detail: `${reads} reads vs ${writes} writes in recent events — agent reads may not be reaching hooks`,
      fix: 'Save .cursor/hooks.json (or restart Cursor) to reload hooks, then run an Agent task that reads files'
    }
  }

  return {
    name: 'Read capture',
    pass: true,
    detail: `${reads} reads · ${writes} writes captured in recent events`
  }
}

function resolveMcpCommand(projectRoot: string): { command: string; args: string[] } | null {
  const mcpJsonPath = path.join(projectRoot, '.cursor', 'mcp.json')
  const config = readJsonFile(mcpJsonPath) as {
    mcpServers?: Record<string, { command?: string; args?: string[] }>
  } | null

  const server = config?.mcpServers?.[MOATLOG_MCP_SERVER]
  if (server?.command) {
    return { command: server.command, args: server.args ?? ['mcp'] }
  }

  const localBin = path.join(projectRoot, 'node_modules', '.bin', 'moatlog')
  if (fs.existsSync(localBin)) {
    return { command: localBin, args: ['mcp'] }
  }

  const which = spawnSync('command', ['-v', 'moatlog'], { shell: true, encoding: 'utf-8' })
  if (which.status === 0) {
    return { command: 'moatlog', args: ['mcp'] }
  }

  return null
}

async function pingMcpServer(
  projectRoot: string,
  command: string,
  args: string[]
): Promise<{ ok: boolean; detail: string }> {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (ok: boolean, detail: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill()
      resolve({ ok, detail })
    }

    const timer = setTimeout(() => {
      finish(false, 'MCP server timed out starting')
    }, 5000)

    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
      if (stdout.includes('"tools"')) {
        finish(true, 'MCP server responded to tools/list')
      }
    })

    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })

    child.on('error', error => {
      finish(false, `MCP server failed to start: ${error.message}`)
    })

    child.on('exit', code => {
      if (settled) return
      finish(false, stderr.trim() || `MCP server exited with code ${code ?? 'unknown'}`)
    })

    const initRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'moatlog-doctor', version: '0.1.0' }
      }
    })

    const listToolsRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    })

    child.stdin.write(`${initRequest}\n`)
    child.stdin.write(`${listToolsRequest}\n`)
    child.stdin.end()
  })
}

async function checkMcp(projectRoot: string): Promise<CheckResult> {
  const mcpJsonPath = path.join(projectRoot, '.cursor', 'mcp.json')

  if (!fs.existsSync(mcpJsonPath)) {
    return {
      name: 'MCP server',
      pass: false,
      detail: '.cursor/mcp.json not found',
      fix: 'Run `moatlog init` to wire the moatlog MCP server'
    }
  }

  const resolved = resolveMcpCommand(projectRoot)
  if (!resolved) {
    return {
      name: 'MCP server',
      pass: false,
      detail: 'moatlog binary not found on PATH or in node_modules/.bin',
      fix: 'Run `npm run build` in the repo, then restart Cursor'
    }
  }

  const ping = await pingMcpServer(projectRoot, resolved.command, resolved.args)
  if (!ping.ok) {
    return {
      name: 'MCP server',
      pass: false,
      detail: ping.detail,
      fix: 'Try `npm run build`, then reload the moatlog MCP server in Cursor Settings → MCP'
    }
  }

  return {
    name: 'MCP server',
    pass: true,
    detail: ping.detail
  }
}

function checkMoatJson(projectRoot: string, logDir: string): CheckResult {
  const moatPath = path.join(logDir, 'moat.json')

  if (!fs.existsSync(moatPath)) {
    return {
      name: 'moat.json',
      pass: false,
      detail: 'moat.json not found',
      fix: 'Work in Agent mode with hooks enabled, then run `moatlog distill`'
    }
  }

  const moat = readJsonFile(moatPath) as { generatedAt?: string } | null
  if (!moat?.generatedAt) {
    return {
      name: 'moat.json',
      pass: false,
      detail: 'moat.json exists but is missing generatedAt',
      fix: 'Run `moatlog distill` to regenerate moat.json'
    }
  }

  const generatedAt = new Date(moat.generatedAt).getTime()
  const ageDays = (Date.now() - generatedAt) / (1000 * 60 * 60 * 24)

  const events = EventLogger.readAll(logDir, 30)
  const eventsAfterDistill = events.filter(
    event => new Date(event.timestamp).getTime() > generatedAt
  )

  if (eventsAfterDistill.length > 0) {
    return {
      name: 'moat.json',
      pass: false,
      detail: `${eventsAfterDistill.length} events since last distill (${moat.generatedAt})`,
      fix: 'Run `moatlog distill` to refresh moat.json'
    }
  }

  if (ageDays > 14) {
    return {
      name: 'moat.json',
      pass: false,
      detail: `moat.json is ${Math.floor(ageDays)} days old with no recent activity`,
      fix: 'Run `moatlog distill` after your next Agent session'
    }
  }

  return {
    name: 'moat.json',
    pass: true,
    detail: `fresh — generated ${moat.generatedAt}`
  }
}

function checkPermissions(projectRoot: string): CheckResult {
  const permissionsPath = path.join(projectRoot, '.cursor', 'permissions.json')
  const permissions = readJsonFile(permissionsPath) as { mcpAllowlist?: string[] } | null

  if (!permissions?.mcpAllowlist?.length) {
    return {
      name: 'MCP permissions',
      pass: false,
      detail: '.cursor/permissions.json missing moatlog MCP allowlist',
      fix: 'Run `moatlog init --force` to add permissions.json, or enable tools manually in Cursor Settings → MCP'
    }
  }

  const allowlist = new Set(permissions.mcpAllowlist)
  const requiredEntries = MOATLOG_MCP_TOOLS.map(tool => `${MOATLOG_MCP_SERVER}:${tool}`)
  const missing = requiredEntries.filter(entry => !allowlist.has(entry))

  if (missing.length > 0 && !allowlist.has(`${MOATLOG_MCP_SERVER}:*`)) {
    return {
      name: 'MCP permissions',
      pass: false,
      detail: `missing allowlist entries: ${missing.join(', ')}`,
      fix: 'Run `moatlog init --force` to refresh permissions.json'
    }
  }

  return {
    name: 'MCP permissions',
    pass: true,
    detail: 'moatlog MCP tools allowlisted for auto-run'
  }
}

function checkMcpUsage(projectRoot: string, logDir: string): CheckResult {
  const events = EventLogger.readAll(logDir, 7)
  const mcpQueries = events.filter(event => event.action === 'mcp_query')
  const taskContextQueries = mcpQueries.filter(e => (e as any).tool === 'get_task_context')

  if (mcpQueries.length === 0) {
    // Check if moat exists and is reasonably sized
    const moatPath = path.join(logDir, 'moat.json')
    const moat = readJsonFile(moatPath) as { totalEvents?: number } | null

    if (moat?.totalEvents && moat.totalEvents > 100) {
      return {
        name: 'MCP usage',
        pass: false,
        detail: 'No MCP queries in last 7 days (moat exists with >100 events)',
        fix: 'Confirm moatlog.mdc rule is active and agent is restarted after init'
      }
    }

    return {
      name: 'MCP usage',
      pass: true,
      detail: 'No MCP activity yet (moat building)'
    }
  }

  return {
    name: 'MCP usage',
    pass: true,
    detail: `${taskContextQueries.length} get_task_context calls in last 7 days — moat actively used`
  }
}

function checkCursorSkills(projectRoot: string): CheckResult {
  const count = countGeneratedCursorSkills(projectRoot)

  if (count === 0) {
    if (isLlmAvailable()) {
      return {
        name: 'Cursor skills',
        pass: false,
        detail: 'skills not generated',
        fix: 'Run `moatlog skills generate`'
      }
    }

    return {
      name: 'Cursor skills',
      pass: true,
      info: true,
      detail: 'skills require Cursor or Claude Code CLI'
    }
  }

  const hasLlmSkills = getExistingSkillFiles(projectRoot).some(file =>
    fs.readFileSync(file, 'utf-8').includes(LLM_SKILL_MARKER)
  )

  if (!hasLlmSkills) {
    return {
      name: 'Cursor skills',
      pass: false,
      detail: 'skills not generated',
      fix: 'Run `moatlog skills generate`'
    }
  }

  return {
    name: 'Cursor skills',
    pass: true,
    detail: `${count} skill file${count === 1 ? '' : 's'} in .cursor/rules/`
  }
}

function checkClaudeSkills(projectRoot: string): CheckResult {
  const agentsPath = path.join(projectRoot, 'AGENTS.md')

  if (!fs.existsSync(agentsPath) || !hasAgentsMdSkillsSection(fs.readFileSync(agentsPath, 'utf-8'))) {
    if (isLlmAvailable()) {
      return {
        name: 'Claude Code skills',
        pass: false,
        detail: 'skills not in AGENTS.md',
        fix: 'Run `moatlog skills generate`'
      }
    }

    return {
      name: 'Claude Code skills',
      pass: true,
      info: true,
      detail: 'skills require Cursor or Claude Code CLI'
    }
  }

  if (!hasLlmGeneratedSkills(projectRoot)) {
    return {
      name: 'Claude Code skills',
      pass: false,
      detail: 'skills not in AGENTS.md',
      fix: 'Run `moatlog skills generate`'
    }
  }

  return {
    name: 'Claude Code skills',
    pass: true,
    detail: 'moatlog section in AGENTS.md'
  }
}

export async function doctor({ projectRoot, logDir }: DoctorOptions): Promise<void> {
  console.log(theme.heading('moatlog doctor\n'))

  const installedAgents = detectInstalledAgents(projectRoot)

  const checks = [
    checkHooks(projectRoot),
    checkReadCapture(logDir),
    await checkMcp(projectRoot),
    checkMoatJson(projectRoot, logDir),
    checkPermissions(projectRoot),
    checkMcpUsage(projectRoot, logDir)
  ]

  if (installedAgents.includes('cursor')) {
    checks.push(checkCursorSkills(projectRoot))
  }

  if (installedAgents.includes('claude-code')) {
    checks.push(checkClaudeSkills(projectRoot))
  }

  for (const check of checks) {
    const icon = check.info
      ? theme.dim('ℹ')
      : check.pass
        ? theme.success('✓')
        : theme.error('✗')
    console.log(`${icon} ${theme.bright(check.name)}`)
    console.log(theme.dim(`  ${check.detail}`))
    if (!check.pass && check.fix) {
      console.log(theme.warn(`  fix: ${check.fix}`))
    }
    console.log('')
  }

  const failed = checks.filter(check => !check.pass)
  if (failed.length > 0) {
    console.log(theme.error(`${failed.length} check${failed.length === 1 ? '' : 's'} failed`))
    process.exit(1)
  }

  console.log(theme.success('All checks passed — moatlog is wired correctly'))
}
