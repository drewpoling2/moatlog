import * as fs from 'fs'
import * as path from 'path'
import { Distiller, EventLogger, isMoatlogTrackedPath, MoatSchemaError } from '@moatlog/core'
import type { Moat, WindowQuality } from '@moatlog/core'
import * as theme from '../theme.js'

interface StatusOptions {
  projectRoot: string
  logDir: string
  verbose?: boolean
}

const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.moatlog',
  '.next',
  'build',
  'out',
  'coverage'
])

const EXCLUDED_EXTENSIONS = new Set(['.map', '.d.ts'])

type MoatStrength = 'none' | 'weak' | 'building' | 'strong'

export function isCountableProjectFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/')
  const segments = normalized.split('/')

  if (segments.some(segment => EXCLUDED_DIRS.has(segment))) return false

  const ext = path.extname(normalized)
  if (EXCLUDED_EXTENSIONS.has(ext)) return false

  return true
}

export function countProjectFiles(projectRoot: string): number {
  let count = 0

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue
        walk(fullPath)
        continue
      }

      if (!entry.isFile()) continue

      const ext = path.extname(entry.name)
      if (EXCLUDED_EXTENSIONS.has(ext)) continue

      count++
    }
  }

  walk(projectRoot)
  return count
}

export function getMoatStrength(
  moat: Moat | null,
  totalFiles: number
): { strength: MoatStrength; coveragePercent: number; seenFiles: number } {
  if (!moat) {
    return { strength: 'none', coveragePercent: 0, seenFiles: 0 }
  }

  const seenFiles = moat.hotFiles.filter(
    f => isCountableProjectFile(f.relativePath)
  ).length
  const coveragePercent = totalFiles > 0
    ? Math.min(100, Math.round((seenFiles / totalFiles) * 100))
    : 0

  let strength: MoatStrength
  if (coveragePercent < 20) strength = 'weak'
  else if (coveragePercent <= 60) strength = 'building'
  else strength = 'strong'

  return { strength, coveragePercent, seenFiles }
}

export function formatRelativeTime(isoDate: string): string {
  const then = new Date(isoDate).getTime()
  const now = Date.now()
  const diffMs = Math.max(0, now - then)

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`

  const months = Math.floor(days / 30)
  return `${months} month${months === 1 ? '' : 's'} ago`
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

export function countWindowQuality(windows: Moat['promptWindows'] | undefined): Record<WindowQuality, number> {
  const counts: Record<WindowQuality, number> = {
    high: 0,
    low: 0,
    meta: 0
  }

  for (const window of windows ?? []) {
    const quality = window.windowQuality ?? 'low'
    counts[quality]++
  }

  return counts
}

export function countReadWriteEvents(
  logDir: string,
  projectRoot: string
): { reads: number; writes: number } {
  const events = EventLogger.readAll(logDir, 30)
    .filter(event => event.agent === 'cursor')
    .filter(
      event =>
        event.relativePath &&
        isMoatlogTrackedPath(event.relativePath, projectRoot)
    )

  return {
    reads: events.filter(event => event.action === 'read').length,
    writes: events.filter(event => event.action === 'write' || event.action === 'create').length
  }
}

function buildStatusTip(reads: number, writes: number): string {
  if (reads === 0 && writes > 0) {
    return 'tip: reads still at 0 — restart Cursor to reload hooks, then have the agent read a file (run `moatlog doctor` to verify)'
  }

  if (reads > 0) {
    return 'tip: keep working in Agent mode — reads and edits both deepen your moat'
  }

  return 'tip: work in Agent mode — events append automatically via hooks'
}

export function status({ projectRoot, logDir, verbose = false }: StatusOptions): void {
  const hooksPath = path.join(projectRoot, '.cursor', 'hooks.json')
  const hooksActive = fs.existsSync(hooksPath)

  if (!hooksActive) {
    console.log(theme.dim('○ hooks not found'))
    console.log(theme.dim('  run `npx moatlog init` to get started'))
    return
  }

  console.log(theme.bright('● hooks active (.cursor/hooks.json)'))
  console.log('')

  const projectName = path.basename(projectRoot)
  const distiller = new Distiller(logDir, projectName)
  let moat
  try {
    moat = distiller.load()
  } catch (err) {
    if (err instanceof MoatSchemaError) {
      console.log(theme.field('moat strength:', 'outdated'))
      console.log(theme.dim(`  ${err.message}`))
      return
    }
    throw err
  }
  const totalFiles = countProjectFiles(projectRoot)
  const { strength, coveragePercent, seenFiles } = getMoatStrength(moat, totalFiles)
  const { reads, writes } = countReadWriteEvents(logDir, projectRoot)

  if (strength === 'none') {
    console.log(theme.field('moat strength:', 'none'))
    console.log(theme.dim('  run `moatlog distill` to generate your moat'))
    return
  }

  const strengthLabel = strength === 'strong'
    ? `${strength} ▪ MCP context is ready`
    : strength

  console.log(theme.field('moat strength:', strengthLabel))
  console.log(
    theme.field(
      'files touched:',
      `${formatNumber(seenFiles)} / ${formatNumber(totalFiles)} files (${coveragePercent}%)`
    )
  )

  const depthLine = verbose
    ? `${formatNumber(moat!.totalEvents)} events · ${formatNumber(moat!.totalSessions)} sessions · ${formatNumber(reads)} reads · ${formatNumber(writes)} writes`
    : `${formatNumber(moat!.totalEvents)} events · ${formatNumber(moat!.totalSessions)} sessions · ${formatNumber(reads)} reads / ${formatNumber(writes)} writes`

  console.log(theme.field('depth:', depthLine))
  console.log(
    theme.field('prompt windows:', formatNumber(moat!.promptWindows?.length ?? 0))
  )
  console.log(
    theme.field('last distill:', formatRelativeTime(moat!.generatedAt))
  )

  if (verbose) {
    const quality = countWindowQuality(moat!.promptWindows)
    console.log(
      theme.field(
        'window quality:',
        `${formatNumber(quality.high)} high · ${formatNumber(quality.low)} low · ${formatNumber(quality.meta)} meta`
      )
    )
  }

  if (strength === 'weak' || strength === 'building') {
    console.log('')
    console.log(theme.dim(`  ${buildStatusTip(reads, writes)}`))
  }
}
