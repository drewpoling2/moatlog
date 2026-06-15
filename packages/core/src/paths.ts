const LOCK_FILES = new Set(['yarn.lock', 'package-lock.json', 'pnpm-lock.yaml'])

/** Doc content JSON is source; other .json files are config/metadata. */
const JSON_CONTENT_PREFIX = 'docs/content/'

export type DistillFilterReason =
  | 'kept'
  | 'no_path'
  | 'node_modules'
  | 'dist'
  | 'config'
  | 'moatlogignore'

function normalizePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/')
}

function isConfigFile(normalized: string): boolean {
  const base = normalized.split('/').pop() ?? ''
  if (LOCK_FILES.has(base)) return true
  if (!base.endsWith('.json')) return false
  if (normalized.startsWith(JSON_CONTENT_PREFIX)) return false
  return true
}

export function getDistillFilterReason(
  relativePath: string | undefined
): DistillFilterReason {
  if (!relativePath) return 'no_path'

  const normalized = normalizePath(relativePath)
  if (normalized.split('/').includes('node_modules')) return 'node_modules'
  if (normalized.includes('/dist/')) return 'dist'
  if (isConfigFile(normalized)) return 'config'

  return 'kept'
}

export function isDistillTrackedPath(relativePath: string): boolean {
  return getDistillFilterReason(relativePath) === 'kept'
}

export function isSessionBoundaryEvent(event: {
  action: string
  relativePath?: string
}): boolean {
  if (event.action === 'prompt_start' || event.action === 'agent_stop') return true
  if (!event.relativePath) return false
  return isDistillTrackedPath(event.relativePath)
}
