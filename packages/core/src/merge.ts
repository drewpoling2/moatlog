import { MOAT_GENERATED_NOTICE } from './distiller.js'
import { MOAT_SCHEMA_VERSION } from './moat-schema.js'
import { buildTaskFileSets, type EnrichedPromptWindow } from './task-context.js'
import type {
  AgentName,
  CoAccessedEntry,
  FileProfile,
  Moat,
  MoatDataHealth,
  PromptWindow,
  Session,
  WindowQuality
} from './types.js'

export type MergeConflictType =
  | 'POSSIBLE_RENAME'
  | 'POSSIBLE_DELETION'
  | 'COUNT_REGRESSION'
  | 'QUALITY_CONFLICT'

export interface MergeConflict {
  id: string
  type: MergeConflictType
  message: string
  ours?: unknown
  theirs?: unknown
  evidence?: Record<string, unknown>
}

export interface MergeSummary {
  newFilesFromTheirs: number
  newFilesFromOurs: number
  filesWithSummedCounts: number
  newPromptWindowsFromTheirs: number
  warnings: string[]
}

export interface MergeResult {
  merged: Moat
  conflicts: MergeConflict[]
  summary: MergeSummary
}

export type MergeResolutionAction =
  | 'keep_ours'
  | 'keep_theirs'
  | 'use_merged'
  | 'drop_theirs_path'
  | 'rename_theirs_to_ours'

export interface MergeResolutionDecision {
  id: string
  action: MergeResolutionAction
  path?: string
}

const QUALITY_RANK: Record<WindowQuality, number> = {
  high: 3,
  low: 2,
  meta: 1
}

const LOW_ACTIVITY_THRESHOLD = 5
const COUNT_REGRESSION_RATIO = 0.5
const CO_ACCESS_OVERLAP_THRESHOLD = 0.5

export function createEmptyMoat(overrides: Partial<Moat> = {}): Moat {
  return {
    _generated: MOAT_GENERATED_NOTICE,
    _version: MOAT_SCHEMA_VERSION,
    scope: 'root',
    projectName: 'unknown',
    generatedAt: new Date(0).toISOString(),
    generatedFrom: '0 events across 0 sessions',
    totalEvents: 0,
    totalSessions: 0,
    dataHealth: {
      readsCaptured: false,
      windowCounts: { high: 0, low: 0, meta: 0 }
    },
    hotFiles: [],
    sessions: [],
    extensionBreakdown: {},
    promptWindows: [],
    taskFileSets: [],
    ...overrides
  }
}

export function threeWayCount(base: number, ours: number, theirs: number): number {
  return Math.max(0, base + (ours - base) + (theirs - base))
}

function indexHotFiles(moat: Moat): Map<string, FileProfile> {
  return new Map(moat.hotFiles.map(profile => [profile.relativePath, profile]))
}

function indexPromptWindows(moat: Moat): Map<string, PromptWindow> {
  return new Map(moat.promptWindows.map(window => [window.id, window]))
}

function unionAgents(a: AgentName[], b: AgentName[]): AgentName[] {
  return [...new Set([...a, ...b])].sort()
}

function mergeCoAccessed(
  base: CoAccessedEntry[],
  ours: CoAccessedEntry[],
  theirs: CoAccessedEntry[]
): CoAccessedEntry[] {
  const baseMap = new Map(base.map(entry => [entry.path, entry.support]))
  const oursMap = new Map(ours.map(entry => [entry.path, entry.support]))
  const theirsMap = new Map(theirs.map(entry => [entry.path, entry.support]))
  const paths = new Set([...oursMap.keys(), ...theirsMap.keys(), ...baseMap.keys()])

  return [...paths]
    .map(path => ({
      path,
      support: threeWayCount(
        baseMap.get(path) ?? 0,
        oursMap.get(path) ?? 0,
        theirsMap.get(path) ?? 0
      )
    }))
    .filter(entry => entry.support > 0)
    .sort((a, b) => b.support - a.support)
}

function emptyProfile(relativePath: string): FileProfile {
  return {
    relativePath,
    agents: [],
    writeCount: 0,
    createCount: 0,
    deleteCount: 0,
    totalEvents: 0,
    sessionsAppeared: 0,
    firstSeen: new Date(0).toISOString(),
    lastSeen: new Date(0).toISOString(),
    coAccessedWith: []
  }
}

function mergeFileProfile(
  base: FileProfile | undefined,
  ours: FileProfile,
  theirs: FileProfile
): FileProfile {
  const b = base ?? emptyProfile(ours.relativePath)
  const writeCount = threeWayCount(b.writeCount, ours.writeCount, theirs.writeCount)
  const readCount = threeWayCount(b.readCount ?? 0, ours.readCount ?? 0, theirs.readCount ?? 0)
  const totalEvents = threeWayCount(b.totalEvents, ours.totalEvents, theirs.totalEvents)
  const createCount = threeWayCount(b.createCount, ours.createCount, theirs.createCount)
  const deleteCount = threeWayCount(b.deleteCount, ours.deleteCount, theirs.deleteCount)
  const sessionsAppeared = threeWayCount(
    b.sessionsAppeared,
    ours.sessionsAppeared,
    theirs.sessionsAppeared
  )

  const merged: FileProfile = {
    relativePath: ours.relativePath,
    agents: unionAgents(ours.agents, theirs.agents),
    writeCount,
    createCount,
    deleteCount,
    totalEvents,
    sessionsAppeared,
    firstSeen: [b.firstSeen, ours.firstSeen, theirs.firstSeen].sort()[0],
    lastSeen: [b.lastSeen, ours.lastSeen, theirs.lastSeen].sort().at(-1)!,
    coAccessedWith: mergeCoAccessed(
      b.coAccessedWith,
      ours.coAccessedWith,
      theirs.coAccessedWith
    )
  }

  if (
    (ours.readCount ?? 0) > 0 ||
    (theirs.readCount ?? 0) > 0 ||
    (b.readCount ?? 0) > 0
  ) {
    merged.readCount = readCount
    merged.readWriteRatio = writeCount > 0 ? readCount / writeCount : readCount
  }

  const typical = new Set([
    ...(b.typicallyAccessedBefore ?? []),
    ...(ours.typicallyAccessedBefore ?? []),
    ...(theirs.typicallyAccessedBefore ?? [])
  ])
  if (typical.size > 0) {
    merged.typicallyAccessedBefore = [...typical]
  }

  return merged
}

function coAccessPartnerPaths(profile: FileProfile): Set<string> {
  return new Set(profile.coAccessedWith.map(entry => entry.path))
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const path of a) {
    if (b.has(path)) shared++
  }
  return shared / Math.min(a.size, b.size)
}

function higherQuality(a: WindowQuality, b: WindowQuality): WindowQuality {
  return QUALITY_RANK[a] >= QUALITY_RANK[b] ? a : b
}

function mergeExtensionBreakdown(
  base: Record<string, number>,
  ours: Record<string, number>,
  theirs: Record<string, number>
): Record<string, number> {
  const keys = new Set([
    ...Object.keys(base),
    ...Object.keys(ours),
    ...Object.keys(theirs)
  ])
  const merged: Record<string, number> = {}

  for (const key of keys) {
    const value = threeWayCount(base[key] ?? 0, ours[key] ?? 0, theirs[key] ?? 0)
    if (value > 0) merged[key] = value
  }

  return merged
}

function mergeSessions(base: Session[], ours: Session[], theirs: Session[]): Session[] {
  const baseMap = new Map(base.map(session => [session.id, session]))
  const oursMap = new Map(ours.map(session => [session.id, session]))
  const theirsMap = new Map(theirs.map(session => [session.id, session]))
  const ids = new Set([...oursMap.keys(), ...theirsMap.keys()])
  const merged: Session[] = []

  for (const id of ids) {
    const o = oursMap.get(id)
    const t = theirsMap.get(id)
    const b = baseMap.get(id)

    if (o && t) {
      merged.push({
        ...o,
        eventCount: threeWayCount(b?.eventCount ?? 0, o.eventCount, t.eventCount),
        filesRead: [...new Set([...o.filesRead, ...t.filesRead])],
        filesWritten: [...new Set([...o.filesWritten, ...t.filesWritten])],
        endedAt: [o.endedAt, t.endedAt].filter(Boolean).sort().at(-1)
      })
      continue
    }

    merged.push((o ?? t)!)
  }

  return merged.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

function mergeDataHealth(
  base: MoatDataHealth,
  ours: MoatDataHealth,
  theirs: MoatDataHealth
): MoatDataHealth {
  return {
    readsCaptured: ours.readsCaptured || theirs.readsCaptured,
    windowCounts: {
      high: threeWayCount(
        base.windowCounts.high,
        ours.windowCounts.high,
        theirs.windowCounts.high
      ),
      low: threeWayCount(
        base.windowCounts.low,
        ours.windowCounts.low,
        theirs.windowCounts.low
      ),
      meta: threeWayCount(
        base.windowCounts.meta,
        ours.windowCounts.meta,
        theirs.windowCounts.meta
      )
    }
  }
}

function detectConflicts(base: Moat, ours: Moat, theirs: Moat): MergeConflict[] {
  const conflicts: MergeConflict[] = []
  const oursFiles = indexHotFiles(ours)
  const theirsFiles = indexHotFiles(theirs)
  const baseFiles = indexHotFiles(base)
  const oursWindows = indexPromptWindows(ours)
  const theirsWindows = indexPromptWindows(theirs)

  const oursOnly = [...oursFiles.keys()].filter(path => !theirsFiles.has(path))
  const theirsOnly = [...theirsFiles.keys()].filter(path => !oursFiles.has(path))

  let renameIndex = 0
  for (const oursPath of oursOnly) {
    const oursProfile = oursFiles.get(oursPath)!
    const oursPartners = coAccessPartnerPaths(oursProfile)

    for (const theirsPath of theirsOnly) {
      const theirsProfile = theirsFiles.get(theirsPath)!
      const overlap = overlapRatio(oursPartners, coAccessPartnerPaths(theirsProfile))
      if (overlap <= CO_ACCESS_OVERLAP_THRESHOLD) continue

      conflicts.push({
        id: `rename-${renameIndex++}`,
        type: 'POSSIBLE_RENAME',
        message: `${oursPath} in ours may be ${theirsPath} in theirs — same co-access partners`,
        ours: oursProfile,
        theirs: theirsProfile,
        evidence: { overlap, oursPath, theirsPath }
      })
    }
  }

  let deletionIndex = 0
  for (const theirsPath of theirsOnly) {
    if (!baseFiles.has(theirsPath)) continue

    const profile = theirsFiles.get(theirsPath)!
    const activity = profile.writeCount + (profile.readCount ?? 0)
    if (activity >= LOW_ACTIVITY_THRESHOLD) continue

    conflicts.push({
      id: `deletion-theirs-${deletionIndex++}`,
      type: 'POSSIBLE_DELETION',
      message: `${theirsPath} in theirs absent from ours — possibly deleted`,
      theirs: profile,
      evidence: { activity, theirsPath, side: 'theirs' as const }
    })
  }

  for (const oursPath of oursOnly) {
    if (!baseFiles.has(oursPath)) continue

    const profile = oursFiles.get(oursPath)!
    const activity = profile.writeCount + (profile.readCount ?? 0)
    if (activity >= LOW_ACTIVITY_THRESHOLD) continue

    conflicts.push({
      id: `deletion-ours-${deletionIndex++}`,
      type: 'POSSIBLE_DELETION',
      message: `${oursPath} in ours absent from theirs — possibly deleted`,
      ours: profile,
      evidence: { activity, oursPath, side: 'ours' as const }
    })
  }

  let regressionIndex = 0
  for (const [path, oursProfile] of oursFiles) {
    const baseProfile = baseFiles.get(path)
    if (!baseProfile) continue

    for (const field of ['writeCount', 'readCount', 'totalEvents'] as const) {
      const baseValue =
        field === 'readCount' ? (baseProfile.readCount ?? 0) : baseProfile[field]
      const oursValue =
        field === 'readCount' ? (oursProfile.readCount ?? 0) : oursProfile[field]
      if (baseValue < 2) continue
      if (oursValue >= baseValue * COUNT_REGRESSION_RATIO) continue

      conflicts.push({
        id: `regression-${regressionIndex++}`,
        type: 'COUNT_REGRESSION',
        message: `${path} ${field} dropped from ${baseValue} to ${oursValue} in ours — possible reset, delta math may be wrong`,
        ours: { path, field, baseValue, oursValue },
        evidence: { path, field, baseValue, oursValue }
      })
    }
  }

  let qualityIndex = 0
  for (const [id, oursWindow] of oursWindows) {
    const theirsWindow = theirsWindows.get(id)
    if (!theirsWindow) continue
    const oursQuality = oursWindow.windowQuality ?? 'low'
    const theirsQuality = theirsWindow.windowQuality ?? 'low'
    if (oursQuality === theirsQuality) continue

    conflicts.push({
      id: `quality-${qualityIndex++}`,
      type: 'QUALITY_CONFLICT',
      message: `prompt window ${id} has quality ${oursQuality} in ours vs ${theirsQuality} in theirs`,
      ours: oursWindow,
      theirs: theirsWindow,
      evidence: {
        id,
        oursQuality,
        theirsQuality,
        resolvedQuality: higherQuality(oursQuality, theirsQuality)
      }
    })
  }

  return conflicts
}

export function mergeMoat(baseInput: Moat | null, oursInput: Moat, theirsInput: Moat): MergeResult {
  const base = baseInput ?? createEmptyMoat({
    scope: oursInput.scope,
    projectName: oursInput.projectName
  })
  const ours = oursInput
  const theirs = theirsInput

  const baseFiles = indexHotFiles(base)
  const oursFiles = indexHotFiles(ours)
  const theirsFiles = indexHotFiles(theirs)
  const paths = new Set([...oursFiles.keys(), ...theirsFiles.keys()])

  const warnings: string[] = []
  let newFilesFromTheirs = 0
  let newFilesFromOurs = 0
  let filesWithSummedCounts = 0

  const mergedHotFiles: FileProfile[] = []

  for (const path of [...paths].sort()) {
    const o = oursFiles.get(path)
    const t = theirsFiles.get(path)
    const b = baseFiles.get(path)

    if (o && t) {
      filesWithSummedCounts++
      mergedHotFiles.push(mergeFileProfile(b, o, t))
    } else if (o) {
      if (!b) newFilesFromOurs++
      mergedHotFiles.push(o)
    } else if (t) {
      newFilesFromTheirs++
      mergedHotFiles.push(t)
    }
  }

  mergedHotFiles.sort((a, b) => b.totalEvents - a.totalEvents)

  const baseWindows = indexPromptWindows(base)
  const oursWindows = indexPromptWindows(ours)
  const theirsWindows = indexPromptWindows(theirs)
  const windowIds = new Set([...oursWindows.keys(), ...theirsWindows.keys()])
  const mergedWindows: PromptWindow[] = []
  let newPromptWindowsFromTheirs = 0

  for (const id of windowIds) {
    const o = oursWindows.get(id)
    const t = theirsWindows.get(id)

    if (o && t) {
      warnings.push(`duplicate prompt window id ${id} — kept ours`)
      const oursQuality = o.windowQuality ?? 'low'
      const theirsQuality = t.windowQuality ?? 'low'
      mergedWindows.push({
        ...o,
        windowQuality: higherQuality(oursQuality, theirsQuality)
      })
      continue
    }

    if (o) {
      mergedWindows.push(o)
      continue
    }

    if (t) {
      if (!baseWindows.has(id) && !oursWindows.has(id)) newPromptWindowsFromTheirs++
      mergedWindows.push(t)
    }
  }

  mergedWindows.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  const mergedSessions = mergeSessions(base.sessions, ours.sessions, theirs.sessions)
  const mergedExtension = mergeExtensionBreakdown(
    base.extensionBreakdown,
    ours.extensionBreakdown,
    theirs.extensionBreakdown
  )
  const mergedDataHealth = mergeDataHealth(base.dataHealth, ours.dataHealth, theirs.dataHealth)

  const merged: Moat = {
    _generated: MOAT_GENERATED_NOTICE,
    _version: MOAT_SCHEMA_VERSION,
    scope: ours.scope || theirs.scope || base.scope,
    projectName: ours.projectName || theirs.projectName || base.projectName,
    generatedAt:
      [ours.generatedAt, theirs.generatedAt].sort().at(-1) ?? ours.generatedAt,
    generatedFrom: `${threeWayCount(base.totalEvents, ours.totalEvents, theirs.totalEvents)} events across ${mergedSessions.length} sessions`,
    totalEvents: threeWayCount(base.totalEvents, ours.totalEvents, theirs.totalEvents),
    totalSessions: mergedSessions.length,
    dataHealth: mergedDataHealth,
    hotFiles: mergedHotFiles,
    sessions: mergedSessions,
    extensionBreakdown: mergedExtension,
    promptWindows: mergedWindows,
    taskFileSets: buildTaskFileSets(mergedWindows as EnrichedPromptWindow[])
  }

  const conflicts = detectConflicts(base, ours, theirs)

  return {
    merged,
    conflicts,
    summary: {
      newFilesFromTheirs,
      newFilesFromOurs,
      filesWithSummedCounts,
      newPromptWindowsFromTheirs,
      warnings
    }
  }
}

export function applyMergeDecisions(
  result: MergeResult,
  decisions: MergeResolutionDecision[]
): MergeResult {
  const decisionMap = new Map(decisions.map(decision => [decision.id, decision]))
  const hotFileMap = new Map(
    result.merged.hotFiles.map(profile => [profile.relativePath, { ...profile }])
  )
  const windows = [...result.merged.promptWindows]

  for (const conflict of result.conflicts) {
    const decision = decisionMap.get(conflict.id)
    if (!decision) continue

    switch (conflict.type) {
      case 'POSSIBLE_RENAME': {
        const evidence = conflict.evidence as { oursPath?: string; theirsPath?: string }
        const theirsPath = evidence.theirsPath
        const oursPath = evidence.oursPath
        if (!theirsPath || !oursPath) break

        if (decision.action === 'rename_theirs_to_ours' || decision.action === 'keep_ours') {
          hotFileMap.delete(theirsPath)
        } else if (decision.action === 'keep_theirs') {
          hotFileMap.delete(oursPath)
        }
        break
      }
      case 'POSSIBLE_DELETION': {
        const evidence = conflict.evidence as { theirsPath?: string; oursPath?: string }

        if (evidence.theirsPath) {
          if (decision.action === 'drop_theirs_path' || decision.action === 'keep_ours') {
            hotFileMap.delete(evidence.theirsPath)
          } else if (
            (decision.action === 'keep_theirs' || decision.action === 'use_merged') &&
            conflict.theirs
          ) {
            hotFileMap.set(evidence.theirsPath, conflict.theirs as FileProfile)
          }
        }

        if (evidence.oursPath) {
          if (decision.action === 'keep_theirs') {
            hotFileMap.delete(evidence.oursPath)
          } else if (
            (decision.action === 'keep_ours' || decision.action === 'use_merged') &&
            conflict.ours
          ) {
            hotFileMap.set(evidence.oursPath, conflict.ours as FileProfile)
          }
        }
        break
      }
      case 'COUNT_REGRESSION': {
        const evidence = conflict.evidence as {
          path?: string
          field?: 'writeCount' | 'readCount' | 'totalEvents'
          baseValue?: number
          oursValue?: number
        }
        const profile = evidence.path ? hotFileMap.get(evidence.path) : undefined
        if (!profile || !evidence.field) break

        if (decision.action === 'keep_ours' && typeof evidence.oursValue === 'number') {
          if (evidence.field === 'readCount') profile.readCount = evidence.oursValue
          else profile[evidence.field] = evidence.oursValue
        }
        break
      }
      case 'QUALITY_CONFLICT': {
        const evidence = conflict.evidence as { id?: string; resolvedQuality?: WindowQuality }
        if (!evidence.id || !evidence.resolvedQuality) break
        const index = windows.findIndex(window => window.id === evidence.id)
        if (index >= 0) {
          windows[index] = {
            ...windows[index],
            windowQuality: evidence.resolvedQuality
          }
        }
        break
      }
    }
  }

  const mergedHotFiles = [...hotFileMap.values()].sort(
    (a, b) => b.totalEvents - a.totalEvents
  )

  return {
    ...result,
    merged: {
      ...result.merged,
      hotFiles: mergedHotFiles,
      promptWindows: windows,
      taskFileSets: buildTaskFileSets(windows as EnrichedPromptWindow[])
    },
    conflicts: result.conflicts.filter(conflict => !decisionMap.has(conflict.id))
  }
}

export function autoResolveQualityConflicts(result: MergeResult): MergeResult {
  const qualityDecisions: MergeResolutionDecision[] = result.conflicts
    .filter(conflict => conflict.type === 'QUALITY_CONFLICT')
    .map(conflict => ({
      id: conflict.id,
      action: 'use_merged' as const
    }))

  if (qualityDecisions.length === 0) return result
  return applyMergeDecisions(result, qualityDecisions)
}

export function formatMergeSummary(result: MergeResult): string {
  const { summary, conflicts } = result
  const parts = [
    `${summary.newFilesFromTheirs} new files from theirs`,
    `${summary.filesWithSummedCounts} files with summed counts`,
    `${summary.newPromptWindowsFromTheirs} new prompt windows`
  ]

  if (summary.warnings.length > 0) {
    parts.push(`${summary.warnings.length} warnings`)
  }

  if (conflicts.length === 0) {
    return `merged: ${parts.join(', ')} — no conflicts, moat.json updated`
  }

  return `merged: ${parts.join(', ')} — ${conflicts.length} conflicts require review`
}
