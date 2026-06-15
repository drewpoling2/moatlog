import {
  buildTaskFileSets,
  computeCoAccessFromWindows,
  enrichPromptWindows,
  extractPathsInTask,
  jaccardSimilarity,
  taskTextForMatching
} from './task-context.js'
import { isMetaQuery } from './meta-query.js'
import type { FileProfile, Moat, PromptWindow, TaskFileSet } from './types.js'

export type TaskContextSource = 'direct' | 'co-access'

export interface TaskContextFile {
  path: string
  score: number
  source: TaskContextSource
}

export interface TaskContextResult {
  files: TaskContextFile[]
  matchedWindows: number
  matchedTaskSets: number
  expandedViaCoAccess: number
}

export interface RetrievalInput {
  promptWindows: PromptWindow[]
  taskFileSets: TaskFileSet[]
  hotFiles?: FileProfile[]
}

const MIXED_PROVENANCE_WEIGHT = 0.7
const CLUSTER_SCORE_BOOST = 1.2
const KEYWORD_SPREAD_THRESHOLD = 0.25
const KEYWORD_SPREAD_WEIGHT = 0.8
const WEAK_TASK_SIGNAL_THRESHOLD = 0.4
const WEAK_FILE_SCORE_THRESHOLD = 0.3
const HOT_FILE_PRIOR_WEIGHT = 0.15
const HOT_FILE_BOOST_WEIGHT = 0.1
const WEAK_KEYWORD_MATCH_THRESHOLD = 0.25
const CLUSTER_WEAK_KEYWORD_THRESHOLD = 0.4

function getTasksForSet(set: TaskFileSet, windows: PromptWindow[]): string[] {
  return set.windowIds
    .map(id => {
      const window = windows.find(entry => entry.id === id)
      return window ? taskTextForMatching(window) : undefined
    })
    .filter((task): task is string => Boolean(task))
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

function windowRecencyScore(window: PromptWindow, windows: PromptWindow[]): number {
  const times = windows.map(w => new Date(w.timestamp).getTime())
  const t = new Date(window.timestamp).getTime()
  const max = Math.max(...times)
  const min = Math.min(...times)
  if (max === min) return 1
  return 0.1 + 0.9 * ((t - min) / (max - min))
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

function stylesClusterScore(task: string, files: string[]): number {
  const taskLower = task.toLowerCase()
  if (!/(css|design|token|styling|theme|aesthetic)/.test(taskLower)) return 0

  const styleCssFiles = files.filter(
    file => file.startsWith('docs/styles/') && file.endsWith('.css')
  )
  if (styleCssFiles.length < 2) return 0

  return styleCssFiles.length / files.length
}

function preferSeedFile(files: string[]): string | null {
  const tokens = files.find(file => file.endsWith('tokens.css'))
  if (tokens) return tokens
  return files[0] ?? null
}

function updateScore(scores: Map<string, number>, filePath: string, score: number): void {
  const current = scores.get(filePath) ?? 0
  if (score > current) scores.set(filePath, score)
}

function spreadScore(combined: number, fileCount: number): number {
  const base = combined * KEYWORD_SPREAD_WEIGHT
  if (fileCount <= 5) return base
  return base / Math.log2(fileCount + 1)
}

function spreadThreshold(fileCount: number): number {
  if (fileCount <= 3) return 0.15
  return KEYWORD_SPREAD_THRESHOLD
}

function shouldSpreadFiles(keywordScore: number, fileCount: number): boolean {
  return keywordScore >= spreadThreshold(fileCount)
}

function collectClusterBoostedFiles(
  matchedWindowEntries: Array<{ window: PromptWindow; clusterSeed?: string | null }>,
  matchedTaskSetEntries: Array<{ set: TaskFileSet; clusterScore: number; clusterSeed?: string | null }>,
  task: string
): Set<string> {
  const boosted = new Set<string>()

  for (const entry of matchedTaskSetEntries) {
    if (entry.clusterScore <= 0) continue
    for (const file of entry.set.files) boosted.add(file)
    if (entry.clusterSeed) boosted.add(entry.clusterSeed)
  }

  for (const entry of matchedWindowEntries) {
    if (stylesClusterScore(task, entry.window.files) <= 0) continue
    for (const file of entry.window.files) boosted.add(file)
    if (entry.clusterSeed) boosted.add(entry.clusterSeed)
  }

  return boosted
}

function hotFilePriorScore(
  totalEvents: number,
  path = '',
  clusterWeak = false,
  stylingTask = false
): number {
  let weight = HOT_FILE_PRIOR_WEIGHT
  if (
    clusterWeak &&
    stylingTask &&
    (path.startsWith('docs/app/') || path.endsWith('globals.css'))
  ) {
    weight = 0.25
  }
  return Math.log10(totalEvents + 1) * weight
}

function hotFileBoostScore(
  totalEvents: number,
  path = '',
  clusterWeak = false,
  stylingTask = false
): number {
  let weight = HOT_FILE_BOOST_WEIGHT
  if (
    clusterWeak &&
    stylingTask &&
    (path.startsWith('docs/app/') || path.endsWith('globals.css'))
  ) {
    weight = 0.14
  }
  return Math.log10(totalEvents + 1) * weight
}

function isWeakTaskSignal(
  maxTaskScore: number,
  maxKeywordMatch: number,
  maxClusterScore: number,
  extractedTaskPaths: string[]
): boolean {
  if (maxTaskScore < WEAK_TASK_SIGNAL_THRESHOLD) return true
  if (extractedTaskPaths.length > 0) return false
  if (maxKeywordMatch < WEAK_KEYWORD_MATCH_THRESHOLD) return true
  if (maxClusterScore > 0 && maxKeywordMatch < CLUSTER_WEAK_KEYWORD_THRESHOLD) return true
  return false
}

function stylingTaskPriorCandidates(
  hotFiles: FileProfile[],
  task: string,
  clusterWeak: boolean
): FileProfile[] {
  const sorted = [...hotFiles].sort((a, b) => b.totalEvents - a.totalEvents)

  if (
    clusterWeak &&
    /(?:\bdocs\b|design|styling|layout|typography|aesthetic|globals)/i.test(task)
  ) {
    return sorted
      .filter(profile =>
        profile.relativePath.startsWith('docs/') ||
        profile.relativePath.endsWith('globals.css')
      )
      .slice(0, 10)
  }

  return sorted.slice(0, 20)
}

function applyHotFilePrior(
  files: TaskContextFile[],
  hotFiles: FileProfile[] | undefined,
  maxTaskScore: number,
  maxKeywordMatch: number,
  maxClusterScore: number,
  extractedTaskPaths: string[],
  task: string,
  weakSignal: boolean
): TaskContextFile[] {
  if (!hotFiles || hotFiles.length === 0 || files.length === 0) return files
  if (!isWeakTaskSignal(maxTaskScore, maxKeywordMatch, maxClusterScore, extractedTaskPaths)) {
    return files
  }

  const clusterWeak =
    maxClusterScore > 0 && maxKeywordMatch < CLUSTER_WEAK_KEYWORD_THRESHOLD
  const scoredPaths = new Set(files.map(file => file.path))
  const eventsByPath = new Map(
    hotFiles.map(profile => [profile.relativePath, profile.totalEvents])
  )

  const updated = [...files]
  const priorCandidates = stylingTaskPriorCandidates(hotFiles, task, clusterWeak)

  for (const profile of priorCandidates) {
    if (scoredPaths.has(profile.relativePath)) continue
    updated.push({
      path: profile.relativePath,
      score: hotFilePriorScore(
        profile.totalEvents,
        profile.relativePath,
        clusterWeak,
        /(?:\bdocs\b|design|styling|layout|typography|aesthetic|globals)/i.test(task)
      ),
      source: 'direct'
    })
  }

  const stylingTask =
    /(?:\bdocs\b|design|styling|layout|typography|aesthetic|globals)/i.test(task)

  return updated.map(file => {
    const totalEvents = eventsByPath.get(file.path) ?? 0
    if (totalEvents <= 0) return file

    const appShellFile =
      file.path.startsWith('docs/app/') || file.path.endsWith('globals.css')
    const shouldBoost =
      file.score < WEAK_FILE_SCORE_THRESHOLD ||
      (weakSignal && clusterWeak && stylingTask && appShellFile)

    if (!shouldBoost) return file

    const floored = Math.max(
      file.score,
      hotFilePriorScore(totalEvents, file.path, clusterWeak, stylingTask)
    )
    return {
      ...file,
      score: floored + hotFileBoostScore(totalEvents, file.path, clusterWeak, stylingTask)
    }
  })
}

function applyFrequencyMultiplier(
  files: TaskContextFile[],
  hotFiles: FileProfile[] | undefined
): TaskContextFile[] {
  if (!hotFiles || hotFiles.length === 0) return files

  const eventsByPath = new Map(
    hotFiles.map(profile => [profile.relativePath, profile.totalEvents])
  )

  return files.map(file => {
    const totalEvents = eventsByPath.get(file.path) ?? 0
    const multiplier = 1 + Math.log10(totalEvents + 1) * 0.1
    return {
      ...file,
      score: file.score * multiplier
    }
  })
}

export function resolveTaskContext(
  task: string,
  input: RetrievalInput,
  limit = 5
): TaskContextResult | null {
  if (isMetaQuery(task)) return null

  const promptWindows = input.promptWindows
  const taskFileSets = input.taskFileSets
  if (promptWindows.length === 0 && taskFileSets.length === 0) return null

  const extractedTaskPaths = extractPathsInTask(task)
  const directScores = new Map<string, number>()
  let maxKeywordMatch = 0
  let maxClusterScore = 0
  const matchedWindowEntries: Array<{
    window: PromptWindow
    score: number
    clusterSeed?: string | null
  }> = []
  const matchedTaskSetEntries: Array<{
    set: TaskFileSet
    score: number
    clusterScore: number
    keywordScore: number
    explicitPathMatch: boolean
    clusterSeed?: string | null
  }> = []

  for (const window of promptWindows) {
    if (window.windowQuality === 'meta') continue

    const windowPaths = window.pathsInTaskNormalized ?? window.pathsInTask ?? []
    const windowTask = taskTextForMatching(window)
    const keywordScore = taskKeywordOverlap(task, windowTask)
    maxKeywordMatch = Math.max(maxKeywordMatch, keywordScore)
    const pathsInTaskScore = pathMatchScore(task, windowPaths)
    const extractedOverlap = extractedTaskPaths.length > 0
      ? jaccardSimilarity(extractedTaskPaths, [...window.files, ...windowPaths])
      : 0
    const clusterScore = stylesClusterScore(task, window.files)
    maxClusterScore = Math.max(maxClusterScore, clusterScore)
    const recency = windowRecencyScore(window, promptWindows)
    let combined = Math.max(
      keywordScore,
      pathsInTaskScore * 1.2,
      extractedOverlap * 1.1,
      clusterScore * 0.9
    ) * recency

    if (window.windowQuality === 'low') combined *= 0.5
    if (window.taskProvenance === 'mixed') combined *= MIXED_PROVENANCE_WEIGHT

    if (combined <= 0) continue

    matchedWindowEntries.push({ window, score: combined })
  }

  for (const set of taskFileSets) {
    const setTasks = getTasksForSet(set, promptWindows)
    const keywordScore = Math.max(
      0,
      ...setTasks.map(example => taskKeywordOverlap(task, example))
    )
    maxKeywordMatch = Math.max(maxKeywordMatch, keywordScore)
    const setPathScore = pathMatchScore(task, set.files)
    const setPathsInTaskScore = pathMatchScore(task, set.pathsInTask)
    const extractedOverlap = extractedTaskPaths.length > 0
      ? jaccardSimilarity(extractedTaskPaths, set.files)
      : 0
    const clusterScore = stylesClusterScore(task, set.files)
    maxClusterScore = Math.max(maxClusterScore, clusterScore)
    const combined = Math.max(
      keywordScore * 0.9,
      setPathScore,
      setPathsInTaskScore,
      extractedOverlap,
      clusterScore
    )

    if (combined <= 0) continue

    matchedTaskSetEntries.push({
      set,
      score: combined,
      clusterScore,
      keywordScore,
      explicitPathMatch: setPathsInTaskScore > 0 || setPathScore > 0 || extractedOverlap > 0
    })
  }

  for (const entry of matchedWindowEntries) {
    const { window, score: combined } = entry
    const explicitPathMatch = pathMatchScore(task, window.pathsInTaskNormalized ?? window.pathsInTask ?? []) > 0
      || (extractedTaskPaths.length > 0
        && jaccardSimilarity(extractedTaskPaths, [...window.files, ...(window.pathsInTask ?? [])]) > 0)

    for (const file of window.pathsInTaskNormalized ?? window.pathsInTask ?? []) {
      if (explicitPathMatch || extractedTaskPaths.includes(file) || pathMatchScore(task, [file]) > 0) {
        updateScore(directScores, file, combined * 1.1)
      }
    }

    if (stylesClusterScore(task, window.files) > 0 && !explicitPathMatch) {
      entry.clusterSeed = preferSeedFile(window.files)
    } else {
      const windowKeywordScore = taskKeywordOverlap(task, taskTextForMatching(window))
      if (shouldSpreadFiles(windowKeywordScore, window.files.length)) {
        const perFileScore = spreadScore(combined, window.files.length)
        for (const file of window.files) {
          updateScore(directScores, file, perFileScore)
        }
      }
    }
  }

  for (const entry of matchedTaskSetEntries) {
    const { set, score: combined, explicitPathMatch, keywordScore } = entry

    for (const file of set.pathsInTask) {
      if (explicitPathMatch || extractedTaskPaths.includes(file) || pathMatchScore(task, [file]) > 0) {
        updateScore(directScores, file, combined * 1.1)
      }
    }

    if (entry.clusterScore > 0 && !explicitPathMatch) {
      entry.clusterSeed = preferSeedFile(set.files)
    } else if (shouldSpreadFiles(keywordScore, set.files.length)) {
      const perFileScore = spreadScore(combined, set.files.length)
      for (const file of set.files) {
        updateScore(directScores, file, perFileScore)
      }
    }
  }

  const rankedClusterSets = matchedTaskSetEntries
    .filter(entry => entry.clusterScore > 0 && entry.clusterSeed)
    .sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.05) return b.score - a.score
      const componentCssCount = (set: TaskFileSet) =>
        set.files.filter(file => file.includes('/components/') && file.endsWith('.css')).length
      const componentDiff = componentCssCount(b.set) - componentCssCount(a.set)
      if (componentDiff !== 0) return componentDiff
      return a.set.files.length - b.set.files.length
    })

  if (rankedClusterSets.length > 0) {
    const primary = rankedClusterSets[0]
    for (const entry of rankedClusterSets.slice(1)) {
      if (entry.clusterSeed) directScores.delete(entry.clusterSeed)
    }
    updateScore(directScores, primary.clusterSeed!, primary.score)
  }

  const rankedClusterWindows = matchedWindowEntries
    .filter(entry => entry.clusterSeed)
    .sort((a, b) => b.score - a.score)

  if (rankedClusterSets.length === 0 && rankedClusterWindows.length > 0) {
    const primary = rankedClusterWindows[0]
    for (const entry of rankedClusterWindows.slice(1)) {
      if (entry.clusterSeed) directScores.delete(entry.clusterSeed)
    }
    updateScore(directScores, primary.clusterSeed!, primary.score)
  }

  if (directScores.size === 0) return null

  const coAccessScores = computeCoAccessFromWindows(directScores, promptWindows)
  const primarySetEntry = rankedClusterSets[0]

  if (primarySetEntry) {
    const seed = primarySetEntry.clusterSeed
    const seedScore = seed ? directScores.get(seed) ?? primarySetEntry.score : primarySetEntry.score
    if (seed) {
      for (const other of primarySetEntry.set.files) {
        if (other === seed) continue
        updateScore(coAccessScores, other, seedScore * 0.8)
      }
    }
  } else {
    for (const { set } of matchedTaskSetEntries) {
      for (const file of set.files) {
        const seedScore = directScores.get(file) ?? 0
        if (seedScore <= 0) continue
        for (const other of set.files) {
          if (other === file) continue
          updateScore(coAccessScores, other, seedScore * 0.8)
        }
      }
    }
  }

  const clusterBoostedFiles = collectClusterBoostedFiles(
    matchedWindowEntries,
    matchedTaskSetEntries,
    task
  )

  const merged = new Map<string, TaskContextFile>()

  for (const [filePath, score] of directScores) {
    merged.set(filePath, { path: filePath, score, source: 'direct' })
  }

  for (const [filePath, score] of coAccessScores) {
    const existing = merged.get(filePath)
    if (existing) {
      if (score > existing.score) {
        merged.set(filePath, { path: filePath, score, source: 'co-access' })
      }
    } else {
      merged.set(filePath, { path: filePath, score, source: 'co-access' })
    }
  }

  const baseScores = [...merged.values()]
  const maxTaskScore = baseScores.length > 0
    ? Math.max(...baseScores.map(file => file.score))
    : 0

  const weakSignal = isWeakTaskSignal(
    maxTaskScore,
    maxKeywordMatch,
    maxClusterScore,
    extractedTaskPaths
  )

  const files = baseScores.map(file => {
    let score = file.score
    if (clusterBoostedFiles.has(file.path)) {
      score *= CLUSTER_SCORE_BOOST
      if (weakSignal && file.path.startsWith('docs/styles/')) {
        score *= 0.55
      }
    }
    return { ...file, score }
  })

  const withPrior = applyHotFilePrior(
    files,
    input.hotFiles,
    maxTaskScore,
    maxKeywordMatch,
    maxClusterScore,
    extractedTaskPaths,
    task,
    weakSignal
  )

  const clusterWeak =
    maxClusterScore > 0 && maxKeywordMatch < CLUSTER_WEAK_KEYWORD_THRESHOLD
  const stylingTask =
    /(?:\bdocs\b|design|styling|layout|typography|aesthetic|globals)/i.test(task)
  const dampened = withPrior.map(file => {
    if (weakSignal && clusterWeak && stylingTask && file.path.startsWith('packages/')) {
      return { ...file, score: file.score * 0.5 }
    }
    return file
  })

  const ranked = applyFrequencyMultiplier(dampened, input.hotFiles)
    .sort((a, b) => b.score - a.score)

  return {
    files: ranked.slice(0, limit),
    matchedWindows: matchedWindowEntries.length,
    matchedTaskSets: matchedTaskSetEntries.length,
    expandedViaCoAccess: ranked.filter(file => file.source === 'co-access').length
  }
}

export function retrievalFromMoat(moat: Moat, task: string, limit = 5): TaskContextResult | null {
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

export function moatWithoutWindow(moat: Moat, windowId: string): Moat {
  const knownFiles = moat.hotFiles.map(profile => profile.relativePath)
  const remaining = (moat.promptWindows ?? []).filter(window => window.id !== windowId)
  const enriched = enrichPromptWindows(remaining, knownFiles)

  return {
    ...moat,
    promptWindows: enriched,
    taskFileSets: buildTaskFileSets(enriched)
  }
}

export function baselineTopFiles(moat: Moat, limit = 5): string[] {
  return [...moat.hotFiles]
    .sort((a, b) => b.totalEvents - a.totalEvents)
    .slice(0, limit)
    .map(profile => profile.relativePath)
}
