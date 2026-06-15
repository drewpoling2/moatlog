import * as fs from 'fs'
import * as path from 'path'

function hasMoatJson(dir: string): boolean {
  return fs.existsSync(path.join(dir, '.moatlog', 'moat.json'))
}

function hasEventLogs(dir: string): boolean {
  const logDir = path.join(dir, '.moatlog')
  if (!fs.existsSync(logDir)) return false

  return fs.readdirSync(logDir).some(file => {
    if (!file.startsWith('events-') || !file.endsWith('.jsonl')) return false
    return fs.statSync(path.join(logDir, file)).size > 0
  })
}

function hasMoatlogHooks(dir: string): boolean {
  const hooksPath = path.join(dir, '.cursor', 'hooks.json')
  if (!fs.existsSync(hooksPath)) return false

  try {
    const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf-8')) as {
      hooks?: Record<string, Array<{ command?: string }>>
    }
    const readHook = hooks.hooks?.beforeReadFile?.[0]?.command ?? ''
    return readHook.includes('moatlog-event.sh')
  } catch {
    return false
  }
}

export function isMoatlogProjectRoot(dir: string): boolean {
  return scoreMoatlogProject(dir) > 0
}

function scoreMoatlogProject(dir: string): number {
  let score = 0
  if (hasMoatJson(dir)) score += 4
  if (hasEventLogs(dir)) score += 2
  if (hasMoatlogHooks(dir)) score += 1
  return score
}

/** Walk up from startDir to find the best moatlog project root. */
export function findProjectRoot(startDir = process.cwd()): string {
  let dir = path.resolve(startDir)
  let bestDir = dir
  let bestScore = 0
  let gitRoot = dir

  while (true) {
    const score = scoreMoatlogProject(dir)
    if (score > bestScore) {
      bestScore = score
      bestDir = dir
    }

    if (fs.existsSync(path.join(dir, '.git'))) {
      gitRoot = dir
    }

    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  if (bestScore > 0) return bestDir
  return gitRoot
}

export function resolveProjectRoot(startDir = process.cwd()): {
  projectRoot: string
  fromCwd: string
} {
  const fromCwd = path.resolve(startDir)
  const projectRoot = findProjectRoot(fromCwd)
  return { projectRoot, fromCwd }
}
