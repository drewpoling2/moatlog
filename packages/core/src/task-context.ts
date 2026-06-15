import { isDistillTrackedPath } from './paths.js'
import { enrichTaskProvenance, extractMatchingTaskText } from './task-provenance.js'
import type {
  PromptWindow,
  TaskFileSet,
  WindowQuality
} from './types.js'

const FILE_PATH_RE =
  /\b((?:(?:[\w.-]+\/)+)?[\w.-]+\.(?:css|tsx?|jsx?|json|mdc?|sh))\b/gi

const META_TASK_PATTERN =
  /^(now|yes|ok|no|do you|can you|you done|thanks|thank you).{0,40}$/i

const META_TASK_CONTENT_PATTERNS: RegExp[] = [
  /\b(?:general )?feedback on the product\b/i,
  /\b(?:is|are) moat(?:log)? (?:helping|working)\b/i,
  /\bdo you have access\b/i,
  /\bcan you see it helping\b/i,
  /\blong[\s-]?term\b.*\bhelp/i
]

/** Meta queries are short and lead with the pattern; specs mention them mid-text. */
const META_TASK_HEAD_CHARS = 100

const META_PATTERN_FILE_OVERRIDE_MIN = 3

export type EnrichedPromptWindow = PromptWindow & {
  pathsInTask: string[]
  pathsInTaskNormalized: string[]
  windowQuality: WindowQuality
}

export function taskTextForMatching(
  window: Pick<PromptWindow, 'task' | 'taskExcerpt' | 'taskProvenance'>
): string {
  if (window.taskExcerpt) return window.taskExcerpt
  if (window.taskProvenance && window.task) {
    return extractMatchingTaskText(window.task, window.taskProvenance)
  }
  return (window.task ?? '').trim()
}

export function taskHeadForMetaCheck(task: string): string {
  return task.slice(0, META_TASK_HEAD_CHARS)
}

function matchesMetaTaskPattern(task: string): boolean {
  const head = taskHeadForMetaCheck(task)
  return (
    META_TASK_PATTERN.test(head) ||
    META_TASK_CONTENT_PATTERNS.some(pattern => pattern.test(head))
  )
}

export function classifyWindowQuality(
  window: Pick<PromptWindow, 'task' | 'taskExcerpt' | 'taskProvenance' | 'files'>
): WindowQuality {
  const task = taskTextForMatching(window)
  const fileCount = window.files.length

  if (fileCount === 0) {
    return 'meta'
  }

  if (matchesMetaTaskPattern(task)) {
    return fileCount >= META_PATTERN_FILE_OVERRIDE_MIN ? 'low' : 'meta'
  }

  if (task.length < 20) {
    return 'meta'
  }

  if (fileCount < 2 || task.length < 50) {
    return 'low'
  }

  return 'high'
}

export function extractPathsInTask(task: string): string[] {
  const seen = new Set<string>()
  const paths: string[] = []

  for (const match of task.matchAll(FILE_PATH_RE)) {
    const normalized = match[1].replace(/\\/g, '/')
    if (seen.has(normalized)) continue
    seen.add(normalized)
    paths.push(normalized)
  }

  return paths
}

export function resolvePathAlias(raw: string, knownFiles: string[]): string | null {
  const path = raw.replace(/\\/g, '/')

  if (knownFiles.includes(path)) return path

  const candidates = knownFiles.filter(file => {
    if (file === path) return true
    if (file.endsWith('/' + path)) return true
    if (path.includes('/')) return file.endsWith(path)
    return file.split('/').pop() === path
  })

  return candidates.length === 1 ? candidates[0] : null
}

export function normalizePathsInTask(rawPaths: string[], knownFiles: string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const raw of rawPaths) {
    const resolved = resolvePathAlias(raw, knownFiles)
    if (!resolved || !isDistillTrackedPath(resolved) || seen.has(resolved)) continue
    seen.add(resolved)
    normalized.push(resolved)
  }

  return normalized
}

export function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a)
  const setB = new Set(b)
  const intersection = [...setA].filter(item => setB.has(item)).length
  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : intersection / union
}

const TASK_FILE_SET_OVERLAP_THRESHOLD = 0.5

function fingerprintFiles(files: string[]): string {
  return files.slice().sort().join('|').slice(0, 40).replace(/[^a-zA-Z0-9]/g, '_')
}

export function buildTaskFileSets(windows: EnrichedPromptWindow[]): TaskFileSet[] {
  const candidates = windows.filter(window => window.files.length >= 2)
  if (candidates.length === 0) return []

  const parent = new Map(candidates.map(window => [window.id, window.id]))

  function find(id: string): string {
    let current = id
    while (parent.get(current) !== current) {
      const next = parent.get(current)!
      parent.set(current, next)
      current = next
    }
    return current
  }

  function union(a: string, b: string): void {
    parent.set(find(a), find(b))
  }

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (jaccardSimilarity(candidates[i].files, candidates[j].files) >= TASK_FILE_SET_OVERLAP_THRESHOLD) {
        union(candidates[i].id, candidates[j].id)
      }
    }
  }

  const groups = new Map<string, EnrichedPromptWindow[]>()
  for (const window of candidates) {
    const root = find(window.id)
    const list = groups.get(root) ?? []
    list.push(window)
    groups.set(root, list)
  }

  return [...groups.values()].map((cluster, index) => {
    const files = [...new Set(cluster.flatMap(window => window.files))].sort()
    const pathsInTask = [
      ...new Set(cluster.flatMap(window => window.pathsInTaskNormalized))
    ]
    const lastSeen = cluster.reduce(
      (latest, window) => (window.timestamp > latest ? window.timestamp : latest),
      cluster[0].timestamp
    )

    return {
      id: `tfs-${index}-${fingerprintFiles(files)}`,
      files,
      pathsInTask,
      windowIds: cluster.map(window => window.id),
      occurrences: cluster.length,
      lastSeen
    }
  })
}

export function enrichPromptWindow(
  window: PromptWindow,
  knownFiles: string[] = []
): EnrichedPromptWindow {
  const provenance = window.task
    ? enrichTaskProvenance(window.task)
    : {
        taskProvenance: window.taskProvenance ?? 'user',
        taskExcerpt: window.taskExcerpt ?? '',
        taskKeywords: window.taskKeywords ?? []
      }
  const enriched: PromptWindow = {
    ...window,
    taskProvenance: provenance.taskProvenance,
    taskExcerpt: provenance.taskExcerpt,
    taskKeywords: provenance.taskKeywords
  }

  const matchingText = taskTextForMatching(enriched)
  const lookupFiles = [...new Set([...knownFiles, ...window.files])]
  const pathsInTask = extractPathsInTask(matchingText)

  return {
    ...enriched,
    windowQuality: classifyWindowQuality(enriched),
    pathsInTask,
    pathsInTaskNormalized: normalizePathsInTask(pathsInTask, lookupFiles)
  }
}

export function enrichPromptWindows(
  windows: PromptWindow[],
  knownFiles: string[] = []
): EnrichedPromptWindow[] {
  return windows.map(window => enrichPromptWindow(window, knownFiles))
}

/** Co-access scores from windows that share direct-match files (query-time). */
export function computeCoAccessFromWindows(
  directScores: Map<string, number>,
  windows: PromptWindow[],
  minDistinctWindows = 2
): Map<string, number> {
  const coAccessScores = new Map<string, number>()
  const eligibleWindows = windows.filter(window => window.windowQuality !== 'meta')

  for (const [seedFile, seedScore] of directScores) {
    if (seedScore <= 0) continue

    const windowsWithSeed = eligibleWindows.filter(window =>
      window.files.includes(seedFile)
    )
    if (windowsWithSeed.length === 0) continue

    const coWindowCounts = new Map<string, Set<string>>()

    for (const window of windowsWithSeed) {
      for (const file of window.files) {
        if (file === seedFile) continue
        const windowIds = coWindowCounts.get(file) ?? new Set<string>()
        windowIds.add(window.id)
        coWindowCounts.set(file, windowIds)
      }
    }

    for (const [file, windowIds] of coWindowCounts) {
      if (windowIds.size < minDistinctWindows) continue
      const coScore = seedScore * 0.8 * (windowIds.size / windowsWithSeed.length)
      const current = coAccessScores.get(file) ?? 0
      if (coScore > current) coAccessScores.set(file, coScore)
    }
  }

  return coAccessScores
}
