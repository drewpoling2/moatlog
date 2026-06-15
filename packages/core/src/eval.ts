import {
  baselineTopFiles,
  moatWithoutWindow,
  retrievalFromMoat
} from './retrieval.js'
import type { Moat, PromptWindow } from './types.js'

export const MIN_QUALIFYING_WINDOWS = 5
export const DEFAULT_EVAL_THRESHOLD = 2
export const DEFAULT_EVAL_TOP_K = 5

export interface RetrievalMetrics {
  hit: boolean
  precisionAt5: number
  recallAt5: number
}

export interface EvalWindowResult {
  windowId: string
  taskExcerpt: string
  expectedFiles: string[]
  returnedFiles: string[]
  hit: boolean
  precisionAt5: number
  recallAt5: number
  baselineReturned?: string[]
  baselineHit?: boolean
  baselinePrecisionAt5?: number
  baselineRecallAt5?: number
}

export interface EvalBaselineSummary {
  hitRate: number
  hitCount: number
  avgPrecisionAt5: number
  avgRecallAt5: number
  improvementPp: number
}

export interface EvalResult {
  totalWindows: number
  qualifyingWindows: number
  evaluatedWindows: number
  threshold: number
  topK: number
  hitRate: number
  hitCount: number
  avgPrecisionAt5: number
  avgRecallAt5: number
  baseline?: EvalBaselineSummary
  windows: EvalWindowResult[]
  worstWindows: EvalWindowResult[]
  insufficientData: boolean
}

export interface EvalOptions {
  threshold?: number
  limit?: number
  baseline?: boolean
  topK?: number
}

export function getQualifyingWindows(moat: Moat, threshold = DEFAULT_EVAL_THRESHOLD): PromptWindow[] {
  return (moat.promptWindows ?? []).filter(window => {
    if (window.windowQuality !== 'high') return false
    if (window.files.length < threshold) return false
    if (!window.taskExcerpt?.trim()) return false
    return true
  })
}

export function computeRetrievalMetrics(
  expected: string[],
  returned: string[],
  topK = DEFAULT_EVAL_TOP_K
): RetrievalMetrics {
  const top = returned.slice(0, topK)
  const expectedSet = new Set(expected)
  const overlap = top.filter(file => expectedSet.has(file))

  return {
    hit: overlap.length >= 1,
    precisionAt5: overlap.length / topK,
    recallAt5: expected.length === 0 ? 0 : overlap.length / expected.length
  }
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function truncateExcerpt(excerpt: string, max = 48): string {
  const trimmed = excerpt.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}…`
}

export function runRetrievalEval(moat: Moat, options: EvalOptions = {}): EvalResult {
  const threshold = options.threshold ?? DEFAULT_EVAL_THRESHOLD
  const topK = options.topK ?? DEFAULT_EVAL_TOP_K
  const qualifying = getQualifyingWindows(moat, threshold)
  const totalWindows = moat.promptWindows?.length ?? 0
  const limited = options.limit ? qualifying.slice(0, options.limit) : qualifying

  const baseResult: EvalResult = {
    totalWindows,
    qualifyingWindows: qualifying.length,
    evaluatedWindows: 0,
    threshold,
    topK,
    hitRate: 0,
    hitCount: 0,
    avgPrecisionAt5: 0,
    avgRecallAt5: 0,
    windows: [],
    worstWindows: [],
    insufficientData: qualifying.length < MIN_QUALIFYING_WINDOWS
  }

  if (baseResult.insufficientData) {
    return baseResult
  }

  const windowResults: EvalWindowResult[] = []

  for (const window of limited) {
    const view = moatWithoutWindow(moat, window.id)
    const retrieval = retrievalFromMoat(view, window.taskExcerpt!, topK)
    const returnedFiles = retrieval?.files.map(file => file.path) ?? []
    const metrics = computeRetrievalMetrics(window.files, returnedFiles, topK)

    const entry: EvalWindowResult = {
      windowId: window.id,
      taskExcerpt: window.taskExcerpt!,
      expectedFiles: [...window.files],
      returnedFiles,
      hit: metrics.hit,
      precisionAt5: metrics.precisionAt5,
      recallAt5: metrics.recallAt5
    }

    if (options.baseline) {
      const baselineReturned = baselineTopFiles(moat, topK)
      const baselineMetrics = computeRetrievalMetrics(window.files, baselineReturned, topK)
      entry.baselineReturned = baselineReturned
      entry.baselineHit = baselineMetrics.hit
      entry.baselinePrecisionAt5 = baselineMetrics.precisionAt5
      entry.baselineRecallAt5 = baselineMetrics.recallAt5
    }

    windowResults.push(entry)
  }

  const hitCount = windowResults.filter(result => result.hit).length
  const worstWindows = [...windowResults]
    .filter(result => !result.hit)
    .sort((a, b) => a.precisionAt5 - b.precisionAt5 || a.recallAt5 - b.recallAt5)
    .slice(0, 5)

  const result: EvalResult = {
    ...baseResult,
    evaluatedWindows: windowResults.length,
    hitRate: hitCount / windowResults.length,
    hitCount,
    avgPrecisionAt5: average(windowResults.map(entry => entry.precisionAt5)),
    avgRecallAt5: average(windowResults.map(entry => entry.recallAt5)),
    windows: windowResults,
    worstWindows,
    insufficientData: false
  }

  if (options.baseline) {
    const baselineHitCount = windowResults.filter(entry => entry.baselineHit).length
    const baselineHitRate = baselineHitCount / windowResults.length
    result.baseline = {
      hitRate: baselineHitRate,
      hitCount: baselineHitCount,
      avgPrecisionAt5: average(
        windowResults.map(entry => entry.baselinePrecisionAt5 ?? 0)
      ),
      avgRecallAt5: average(
        windowResults.map(entry => entry.baselineRecallAt5 ?? 0)
      ),
      improvementPp: Math.round((result.hitRate - baselineHitRate) * 100)
    }
  }

  return result
}

function formatFileList(files: string[]): string {
  if (files.length === 0) return '[]'
  return `[${files.join(', ')}]`
}

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

export function formatEvalReport(result: EvalResult): string {
  if (result.insufficientData) {
    return (
      `moatlog eval — retrieval quality report\n` +
      `${'─'.repeat(40)}\n` +
      `qualifying windows:   ${result.qualifyingWindows} / ${result.totalWindows} total\n\n` +
      `Not enough data for a meaningful eval (need at least ${MIN_QUALIFYING_WINDOWS} ` +
      `high-quality windows with ≥${result.threshold} files and a task excerpt).`
    )
  }

  const lines = [
    'moatlog eval — retrieval quality report',
    '─'.repeat(40),
    `windows evaluated:    ${result.evaluatedWindows}`,
    `qualifying windows:   ${result.qualifyingWindows} / ${result.totalWindows} total (high quality, ≥${result.threshold} files)`,
    '',
    `hit rate (top ${result.topK}):     ${formatPercent(result.hitRate)}   (${result.hitCount}/${result.evaluatedWindows} windows)`,
    `precision@${result.topK}:          ${result.avgPrecisionAt5.toFixed(2)}  (avg fraction of top ${result.topK} that matched)`,
    `recall@${result.topK}:             ${result.avgRecallAt5.toFixed(2)}  (avg fraction of window files found)`
  ]

  if (result.baseline) {
    lines.push(
      '',
      `baseline hit rate:    ${formatPercent(result.baseline.hitRate)}   (${result.baseline.hitCount}/${result.evaluatedWindows} windows)`,
      `moat improvement:     ${result.baseline.improvementPp >= 0 ? '+' : ''}${result.baseline.improvementPp}pp vs naive baseline`
    )
  }

  if (result.worstWindows.length > 0) {
    lines.push('', 'worst windows (missed):')
    for (const window of result.worstWindows) {
      lines.push(
        `  "${truncateExcerpt(window.taskExcerpt)}" → returned ${formatFileList(window.returnedFiles)}`,
        `                                   expected ${formatFileList(window.expectedFiles)}`
      )
    }
  }

  return lines.join('\n')
}
