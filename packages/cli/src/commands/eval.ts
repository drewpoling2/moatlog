import * as fs from 'fs'
import * as path from 'path'
import {
  Distiller,
  formatEvalReport,
  MIN_QUALIFYING_WINDOWS,
  runRetrievalEval
} from '@moatlog/core'
import * as theme from '../theme.js'

export interface EvalCommandOptions {
  projectRoot: string
  logDir: string
  threshold?: number
  limit?: number
  baseline?: boolean
  json?: boolean
  help?: boolean
}

function printEvalHelp(): void {
  console.log(`
moatlog eval — offline retrieval quality report

Usage:
  moatlog eval [--threshold <n>] [--limit <n>] [--baseline] [--json]

Options:
  --threshold <n>  Minimum file count for a window to be included (default: 2)
  --limit <n>      Max windows to evaluate (default: all qualifying)
  --baseline       Also run naive hot-file baseline for comparison
  --json           Output full results as JSON
  --help           Show this help
`)
}

export function evalCommand({
  projectRoot,
  logDir,
  threshold = 2,
  limit,
  baseline = false,
  json = false,
  help = false
}: EvalCommandOptions): number {
  if (help) {
    printEvalHelp()
    return 0
  }

  const moatPath = path.join(logDir, 'moat.json')
  if (!fs.existsSync(moatPath)) {
    console.error(theme.warn('No moat.json found — run moatlog distill first.'))
    return 1
  }

  const distiller = new Distiller(logDir, path.basename(projectRoot))
  let moat
  try {
    moat = distiller.load()
  } catch (err) {
    console.error(theme.warn((err as Error).message))
    return 1
  }

  if (!moat) {
    console.error(theme.warn('No moat.json found — run moatlog distill first.'))
    return 1
  }

  const result = runRetrievalEval(moat, { threshold, limit, baseline })

  if (result.insufficientData) {
    console.log(theme.warn(formatEvalReport(result)))
    console.log('')
    console.log(
      theme.dim(
        `  need at least ${MIN_QUALIFYING_WINDOWS} qualifying windows (high quality, ≥${threshold} files, task excerpt)`
      )
    )
    return 1
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2))
    return 0
  }

  console.log(theme.heading('\n' + formatEvalReport(result) + '\n'))
  return 0
}
