#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import * as path from 'path'
import * as fs from 'fs'
import { randomUUID } from 'crypto'
import {
  EventLogger,
  Profiler,
  Distiller,
  isMetaQuery,
  findProjectRoot,
  MoatSchemaError,
  taskTextForMatching,
  resolveTaskContext,
  type Moat,
  type PromptWindow,
  type TaskContextResult,
  type AgentEvent
} from '@moatlog/core'

const projectRoot = findProjectRoot()
const logDir = path.join(projectRoot, '.moatlog')

function logMcpQuery(event: Partial<AgentEvent>): void {
  // Fire and forget — don't await or block the response
  try {
    const logger = new EventLogger(logDir)
    logger.write({
      id: randomUUID(),
      timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z'),
      sessionId: event.sessionId ?? 'unknown',
      agent: 'claude-code',
      action: 'mcp_query',
      projectName: path.basename(projectRoot),
      ...event
    } as AgentEvent)
    logger.close()
  } catch {
    // Silently fail — don't let logging errors crash the server
  }
}

function getMoat(): Moat | null {
  const distiller = new Distiller(logDir, path.basename(projectRoot))
  return distiller.load()
}

function getProfiler(): Profiler {
  const events = EventLogger.readAll(logDir)
  return new Profiler(events)
}

function hasData(): boolean {
  if (!fs.existsSync(logDir)) return false
  if (fs.existsSync(path.join(logDir, 'moat.json'))) return true
  if (fs.existsSync(path.join(logDir, 'insights.json'))) return true
  return fs.readdirSync(logDir).some(f => f.endsWith('.jsonl'))
}

const server = new Server(
  { name: 'moatlog', version: '0.1.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_hot_files',
      description: 'Returns the most frequently accessed files in this project based on agent session history. Use this at the start of any task to understand which files matter most.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          limit: {
            type: 'number',
            description: 'Number of files to return (default 10)'
          }
        }
      }
    },
    {
      name: 'get_file_history',
      description: 'Returns the behavioral history for a specific file — how often it has been accessed, which sessions it appeared in, and which files are typically accessed alongside it.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file from project root'
          }
        },
        required: ['path']
      }
    },
    {
      name: 'get_co_accessed_files',
      description: 'Returns files frequently accessed in the same agent session as the given file. Use this to understand what context is needed when working on a specific file.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file from project root'
          }
        },
        required: ['path']
      }
    },
    {
      name: 'get_task_context',
      description: 'Given a description of what you are about to do, returns historically relevant files based on past session patterns. Call this before starting any significant task.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task: {
            type: 'string',
            description: 'Description of the task you are about to perform'
          },
          limit: {
            type: 'number',
            description: 'Number of files to return (default 5)'
          }
        },
        required: ['task']
      }
    }
  ]
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!hasData()) {
    return {
      content: [{
        type: 'text' as const,
        text: 'No moatlog data found. Enable Cursor hooks and run moatlog distill.'
      }]
    }
  }

  const { name, arguments: args } = request.params

  let moat: Moat | null
  try {
    moat = getMoat()
  } catch (err) {
    if (err instanceof MoatSchemaError) {
      return {
        content: [{
          type: 'text' as const,
          text: err.message
        }]
      }
    }
    throw err
  }

  const profiler = moat ? null : getProfiler()

  function getProfiles() {
    if (moat) return moat.hotFiles
    return profiler!.getAllProfiles()
  }

  function getProfile(relativePath: string) {
    if (moat) {
      return moat.hotFiles.find(p => p.relativePath === relativePath) ?? null
    }
    return profiler!.getFileProfile(relativePath)
  }

  function getCoAccessed(relativePath: string) {
    const profile = getProfile(relativePath)
    return profile?.coAccessedWith ?? []
  }

  function taskKeywordOverlap(a: string, b: string): number {
    const wordsA = a.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    const wordsB = b.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    if (wordsA.length === 0 || wordsB.length === 0) return 0

    const matches = wordsA.filter(word =>
      wordsB.some(other => other.includes(word) || word.includes(other))
    ).length

    return matches / Math.max(wordsA.length, wordsB.length)
  }

  function pathMatchScore(task: string, paths: string[]): number {
    if (paths.length === 0) return 0

    const genericSegments = new Set([
      'docs', 'src', 'app', 'lib', 'styles', 'components', 'packages', 'core', 'cli', 'mcp',
      'css', 'ts', 'tsx', 'js', 'jsx', 'json', 'md', 'html', 'sh', 'test', 'tests', 'dist'
    ])
    const taskLower = task.toLowerCase()
    const taskWords = taskLower.split(/\s+/).filter(word => word.length > 2)
    let score = 0

    for (const filePath of paths) {
      const normalized = filePath.toLowerCase()
      if (taskLower.includes(normalized)) {
        score += 2
        continue
      }

      const basename = normalized.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''
      if (basename.length > 2 && taskWords.some(word => word.includes(basename) || basename.includes(word))) {
        score += 1
        continue
      }

      const segments = normalized.split(/[/.\\_-]/).filter(Boolean)
      for (const segment of segments) {
        if (segment.length <= 3 || genericSegments.has(segment)) continue
        if (taskWords.some(word => word.includes(segment) || segment.includes(word))) {
          score += 0.5
        }
      }
    }

    return score / paths.length
  }

  function getTaskContextResult(task: string, limit: number): TaskContextResult | null {
    if (!moat) return null
    return resolveTaskContext(
      task,
      {
        promptWindows: moat.promptWindows ?? [],
        taskFileSets: moat.taskFileSets ?? [],
        hotFiles: moat.hotFiles
      },
      limit
    )
  }

  function formatTaskContextResult(task: string, result: TaskContextResult): string {
    const matchedWindows = getPromptWindows()
      .filter(window => window.windowQuality !== 'meta')
      .map(window => ({
        window,
        score: Math.max(
          taskKeywordOverlap(task, taskTextForMatching(window)),
          pathMatchScore(task, window.pathsInTaskNormalized ?? window.pathsInTask ?? []),
          pathMatchScore(task, window.files)
        )
      }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score)

    const matchedTasks = matchedWindows.slice(0, 3).map(entry => {
      const pathsInTaskCount = entry.window.pathsInTask?.length ?? 0
      const excerpt = entry.window.taskExcerpt ?? taskTextForMatching(entry.window)
      const preview = excerpt.slice(0, 100)
      return `"${preview}${excerpt.length > 100 ? '…' : ''}" (${Math.round(entry.score * 100)}% match, ${entry.window.files.length} files, ${pathsInTaskCount} paths in task)`
    })

    const payload = {
      files: result.files.map(file => ({
        path: file.path,
        score: Number(file.score.toFixed(4)),
        source: file.source
      })),
      matchedWindows: result.matchedWindows,
      matchedTaskSets: result.matchedTaskSets,
      expandedViaCoAccess: result.expandedViaCoAccess
    }

    return (
      `Task context for "${task}":\n\n` +
      `${JSON.stringify(payload, null, 2)}\n\n` +
      (matchedTasks.length > 0
        ? `Matched past tasks:\n${matchedTasks.map(taskLine => `  ${taskLine}`).join('\n')}`
        : '')
    )
  }

  function getPromptWindows(): PromptWindow[] {
    return moat?.promptWindows ?? []
  }

  switch (name) {
    case 'get_hot_files': {
      const limit = (args?.limit as number) ?? 10
      const profiles = getProfiles().slice(0, limit)

      if (profiles.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No file activity logged yet.'
          }]
        }
      }

      const source = moat
        ? `moat.json (${moat.generatedFrom})`
        : 'raw events'

      const output = profiles.map(f =>
        `${f.relativePath}\n` +
        `  accesses: ${f.totalEvents} ` +
        `writes: ${f.writeCount} ` +
        `reads: ${f.readCount ?? 0} ` +
        `sessions: ${f.sessionsAppeared}`
      ).join('\n\n')

      logMcpQuery({
        tool: 'get_hot_files',
        input: '',
        returnCount: profiles.length
      })

      return {
        content: [{
          type: 'text' as const,
          text: `Hot files in this project (from ${source}):\n\n${output}`
        }]
      }
    }

    case 'get_file_history': {
      const filePath = args?.path as string
      const profile = getProfile(filePath)

      if (!profile) {
        return {
          content: [{
            type: 'text' as const,
            text: `No history found for ${filePath}`
          }]
        }
      }

      const coAccessed = getCoAccessed(filePath).slice(0, 5)
        .map(c => `  ${c.path} (support ${c.support} windows)`)
        .join('\n')

      const accessedBefore = (profile.typicallyAccessedBefore ?? [])
        .map(p => `  ${p}`)
        .join('\n')

      logMcpQuery({
        tool: 'get_file_history',
        input: filePath,
        returnCount: 1
      })

      return {
        content: [{
          type: 'text' as const,
          text:
            `File: ${profile.relativePath}\n` +
            `accesses: ${profile.totalEvents}  ` +
            `writes: ${profile.writeCount}  ` +
            `reads: ${profile.readCount ?? 0}  ` +
            `sessions: ${profile.sessionsAppeared}\n` +
            `first seen: ${profile.firstSeen}\n` +
            `last seen: ${profile.lastSeen}\n\n` +
            `Co-accessed files (write + read patterns):\n${coAccessed || '  none yet'}\n\n` +
            `Typically accessed before editing this file:\n${accessedBefore || '  none yet'}`
        }]
      }
    }

    case 'get_co_accessed_files': {
      const filePath = args?.path as string
      const coAccessed = getCoAccessed(filePath)

      if (coAccessed.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No co-access data for ${filePath} yet.`
          }]
        }
      }

      const output = coAccessed
        .map(c => `${c.path} — ${c.support} shared windows`)
        .join('\n')

      logMcpQuery({
        tool: 'get_co_accessed_files',
        input: filePath,
        returnCount: coAccessed.length
      })

      return {
        content: [{
          type: 'text' as const,
          text: `Files co-accessed in the same prompt windows as ${filePath}:\n\n${output}`
        }]
      }
    }

    case 'get_task_context': {
      const task = args?.task as string
      const limit = (args?.limit as number) ?? 5

      if (isMetaQuery(task)) {
        return {
          content: [{
            type: 'text' as const,
            text:
              'Meta query detected — moat retrieval skipped.\n' +
              'This query is about moatlog/the agent, not the codebase. ' +
              'Ask a task-specific question to get file context.'
          }]
        }
      }

      const taskContext = getTaskContextResult(task, limit)
      if (taskContext && taskContext.files.length > 0) {
        const filesReturned = taskContext.files.map(f => f.path)
        logMcpQuery({
          tool: 'get_task_context',
          task,
          filesReturned,
          returnCount: filesReturned.length
        })
        return {
          content: [{
            type: 'text' as const,
            text: formatTaskContextResult(task, taskContext)
          }]
        }
      }

      const allProfiles = getProfiles()
      const taskWords = task.toLowerCase().split(/\s+/)

      const scored = allProfiles.map(profile => {
        const pathWords = profile.relativePath
          .toLowerCase()
          .split(/[\/\.\-\_]/)

        const matches = taskWords.filter(word =>
          pathWords.some(pw => pw.includes(word) || word.includes(pw))
        ).length

        return { profile, score: matches + (profile.totalEvents * 0.01) }
      })

      const relevant = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.profile)

      if (relevant.length === 0) {
        logMcpQuery({
          tool: 'get_task_context',
          task,
          filesReturned: [],
          returnCount: 0
        })
        return {
          content: [{
            type: 'text' as const,
            text: 'No historically relevant files found for this task.'
          }]
        }
      }

      const filesReturned = relevant.map(f => f.relativePath)
      logMcpQuery({
        tool: 'get_task_context',
        task,
        filesReturned,
        returnCount: filesReturned.length
      })

      const output = relevant.map(f =>
        `${f.relativePath} (${f.totalEvents} events, ${f.sessionsAppeared} sessions)`
      ).join('\n')

      return {
        content: [{
          type: 'text' as const,
          text:
            `Historically relevant files for "${task}":\n\n${output}\n\n` +
            `Tip: call get_co_accessed_files on each to get full context.`
        }]
      }
    }

    default:
      return {
        content: [{
          type: 'text' as const,
          text: `Unknown tool: ${name}`
        }]
      }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('moatlog MCP server running')
}

main().catch(console.error)
