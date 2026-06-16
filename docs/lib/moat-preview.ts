import fs from 'fs'
import path from 'path'

export interface MoatStatusPreview {
  projectName: string
  totalEvents: number
  totalSessions: number
  hotFileCount: number
  promptWindowCount: number
  generatedAt: string
  readsCaptured: boolean
}

export interface MoatStatusMetric {
  label: string
  percent: number
}

export interface MoatStatusView {
  hooksActive: boolean
  moatStrength: 'none' | 'weak' | 'building' | 'strong'
  lastDistill: string
  sessions: number
  coveragePercent: number
  metrics: MoatStatusMetric[]
  eventHash: string
  moatHash: string
}

export interface LiveCommandScript {
  id: string
  command: string
  lines: string[]
}

export interface MoatPreviewData {
  json: string
  status: MoatStatusPreview
}

function activityBar(blocks: number): string {
  return '#'.repeat(blocks)
}

function hotFileLine(relativePath: string, count: number, blocks: number): string {
  return `  ${relativePath.padEnd(40)} ${activityBar(blocks)} ${count}`
}

const STATIC_REPORT_LINES = [
  '',
  'overview',
  '  total events     799',
  '  sessions         19',
  '  files tracked    85',
  '',
  'hot files',
  hotFileLine('docs/app/globals.css', 57, 20),
  hotFileLine('packages/mcp/src/server.ts', 43, 20),
  hotFileLine('docs/styles/tokens.css', 17, 17),
  hotFileLine('docs/styles/components/layout.css', 16, 16),
  hotFileLine('packages/core/src/distiller.ts', 16, 16),
  '',
  'most written',
  '  docs/app/globals.css                     57 writes',
  '  packages/mcp/src/server.ts               43 writes',
  '  docs/styles/components/layout.css        16 writes',
  '  packages/core/src/distiller.ts           16 writes',
  '  docs/styles/tokens.css                   15 writes',
  '',
  'file types',
  '  (none)      366',
  '  .ts         170',
  '  .css        143',
  '  .tsx        65',
  '  .json       32',
  '  .sh         15',
  '  .md         4',
  '  .local      2'
]

const STATIC_LOG_LINES = [
  '',
  '209 prompt windows (showing last 3)',
  '',
  '… 206 earlier windows',
  '',
  '2026-06-11 05:25  Build the docs site content — renderer working, write actual pages',
  '  docs/lib/docs.ts, docs/content/overview.json, docs/content/moat-json.json +3 more',
  '',
  '2026-06-11 05:38  Sidebar cleanup, rename Watch→Capture, add init command block',
  '  docs/content/overview.json, docs/app/docs/DocsHeader.tsx, docs/app/globals.css',
  '',
  '2026-06-11 16:37  Apply Gameboy-meets-SaaS aesthetic to docs site',
  '  docs/app/layout.tsx, docs/app/globals.css, docs/content/overview.json +3 more'
]

function moatJsonPath(): string {
  return path.join(process.cwd(), '..', '.moatlog', 'moat.json')
}

function formatDistillAge(iso: string): string {
  const ms = Date.now() - Date.parse(iso)
  if (Number.isNaN(ms) || ms < 0) return 'recently'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function toHexHash(value: number): string {
  return `0x${(value & 0xffffff).toString(16).toUpperCase().padStart(6, '0')}`
}

function metricPercent(value: number, cap: number): number {
  if (cap <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((value / cap) * 100)))
}

function getMoatStrengthLabel(hotFileCount: number): MoatStatusView['moatStrength'] {
  const coverageEstimate = metricPercent(hotFileCount, 80)
  if (coverageEstimate < 20) return 'weak'
  if (coverageEstimate <= 60) return 'building'
  return 'strong'
}

const DEMO_STATUS_PERCENTAGES = {
  coveragePercent: 47,
  metrics: [
    { label: 'reads', percent: 82 },
    { label: 'writes', percent: 61 },
    { label: 'prompts', percent: 44 },
    { label: 'distills', percent: 28 },
  ],
} as const satisfies Pick<MoatStatusView, 'coveragePercent' | 'metrics'>

export function buildMoatStatusView(preview: MoatPreviewData | null): MoatStatusView {
  if (!preview) {
    return {
      hooksActive: true,
      moatStrength: 'building',
      lastDistill: '2 min ago',
      sessions: 3,
      coveragePercent: DEMO_STATUS_PERCENTAGES.coveragePercent,
      metrics: [...DEMO_STATUS_PERCENTAGES.metrics],
      eventHash: '0x00249F',
      moatHash: '0x0138',
    }
  }

  const { status } = preview

  return {
    hooksActive: true,
    moatStrength: getMoatStrengthLabel(status.hotFileCount),
    lastDistill: formatDistillAge(status.generatedAt),
    sessions: status.totalSessions,
    coveragePercent: DEMO_STATUS_PERCENTAGES.coveragePercent,
    metrics: [...DEMO_STATUS_PERCENTAGES.metrics],
    eventHash: toHexHash(status.totalEvents),
    moatHash: toHexHash(status.hotFileCount * 97 + status.totalSessions),
  }
}

export function buildLiveCommandScripts(): LiveCommandScript[] {
  return [
    { id: 'status', command: 'moatlog status', lines: [] },
    { id: 'report', command: 'moatlog report', lines: [...STATIC_REPORT_LINES] },
    { id: 'log', command: 'moatlog log', lines: [...STATIC_LOG_LINES] }
  ]
}

export function getMoatPreview(): MoatPreviewData | null {
  const filePath = moatJsonPath()
  if (!fs.existsSync(filePath)) return null

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
      projectName?: string
      generatedAt?: string
      generatedFrom?: string
      totalEvents?: number
      totalSessions?: number
      dataHealth?: { readsCaptured?: boolean; windowCounts?: Record<string, number> }
      hotFiles?: Array<{ relativePath: string; totalEvents: number; coAccessedWith?: unknown[] }>
      promptWindows?: unknown[]
    }

    const hotFiles = (raw.hotFiles ?? []).slice(0, 2).map(file => ({
      relativePath: file.relativePath,
      totalEvents: file.totalEvents,
      coAccessedWith: file.coAccessedWith?.slice(0, 2)
    }))

    const windowCounts = raw.dataHealth?.windowCounts ?? {}
    const promptWindowCount = Object.values(windowCounts).reduce((sum, n) => sum + n, 0)

    const preview = {
      _version: (raw as { _version?: string })._version,
      projectName: raw.projectName,
      generatedFrom: raw.generatedFrom,
      dataHealth: raw.dataHealth,
      hotFiles
    }

    return {
      json: JSON.stringify(preview, null, 2),
      status: {
        projectName: raw.projectName ?? 'project',
        totalEvents: raw.totalEvents ?? 0,
        totalSessions: raw.totalSessions ?? 0,
        hotFileCount: raw.hotFiles?.length ?? 0,
        promptWindowCount: promptWindowCount || (raw.promptWindows?.length ?? 0),
        generatedAt: raw.generatedAt ?? new Date().toISOString(),
        readsCaptured: raw.dataHealth?.readsCaptured ?? false
      }
    }
  } catch {
    return null
  }
}

export function getMoatJsonGithubUrl(repoUrl: string | null): string | null {
  if (!repoUrl) return null
  return `${repoUrl}/blob/main/.moatlog/moat.json`
}
