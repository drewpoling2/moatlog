import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyMergeDecisions,
  autoResolveQualityConflicts,
  createEmptyMoat,
  mergeMoat,
  threeWayCount
} from './merge.js'
import type { FileProfile, Moat, PromptWindow } from './types.js'

function profile(
  relativePath: string,
  partial: Partial<FileProfile> = {}
): FileProfile {
  return {
    relativePath,
    agents: ['cursor'],
    writeCount: 0,
    createCount: 0,
    deleteCount: 0,
    totalEvents: 0,
    sessionsAppeared: 1,
    firstSeen: '2026-06-01T00:00:00.000Z',
    lastSeen: '2026-06-01T00:00:00.000Z',
    coAccessedWith: [],
    ...partial
  }
}

function window(id: string, partial: Partial<PromptWindow> = {}): PromptWindow {
  return {
    id,
    timestamp: '2026-06-01T00:00:00.000Z',
    sessionId: 'session-1',
    agent: 'cursor',
    files: [],
    ...partial
  }
}

function moat(hotFiles: FileProfile[], promptWindows: PromptWindow[] = []): Moat {
  return createEmptyMoat({
    projectName: 'test',
    hotFiles,
    promptWindows,
    totalEvents: hotFiles.reduce((sum, file) => sum + file.totalEvents, 0),
    totalSessions: 1
  })
}

test('threeWayCount handles count regression via delta math', () => {
  assert.equal(threeWayCount(2, 5, 3), 6)
  assert.equal(threeWayCount(12, 1, 8), 0)
  assert.equal(threeWayCount(0, 5, 3), 8)
})

test('mergeMoat unions ours-only and theirs-only hotFiles', () => {
  const base = moat([profile('shared.ts', { writeCount: 2, totalEvents: 2 })])
  const ours = moat([
    profile('shared.ts', { writeCount: 5, totalEvents: 5 }),
    profile('ours-only.ts', { writeCount: 4, totalEvents: 4 })
  ])
  const theirs = moat([
    profile('shared.ts', { writeCount: 3, totalEvents: 3 }),
    profile('theirs-only.ts', { writeCount: 6, totalEvents: 6 })
  ])

  const result = mergeMoat(base, ours, theirs)
  const paths = result.merged.hotFiles.map(file => file.relativePath)

  assert.deepEqual(paths, ['shared.ts', 'theirs-only.ts', 'ours-only.ts'])
  assert.equal(
    result.merged.hotFiles.find(file => file.relativePath === 'shared.ts')?.writeCount,
    6
  )
  assert.equal(result.summary.newFilesFromTheirs, 1)
  assert.equal(result.summary.newFilesFromOurs, 1)
  assert.equal(result.summary.filesWithSummedCounts, 1)
})

test('mergeMoat unions agents and sums co-access support', () => {
  const base = moat([])
  const ours = moat([
    profile('a.ts', {
      agents: ['cursor'],
      writeCount: 2,
      totalEvents: 2,
      coAccessedWith: [{ path: 'b.ts', support: 2 }]
    })
  ])
  const theirs = moat([
    profile('a.ts', {
      agents: ['claude-code'],
      writeCount: 3,
      totalEvents: 3,
      coAccessedWith: [{ path: 'b.ts', support: 1 }, { path: 'c.ts', support: 2 }]
    })
  ])

  const merged = mergeMoat(base, ours, theirs).merged.hotFiles[0]
  assert.deepEqual(merged.agents, ['claude-code', 'cursor'])
  assert.equal(merged.writeCount, 5)

  const bSupport = merged.coAccessedWith.find(entry => entry.path === 'b.ts')?.support
  const cSupport = merged.coAccessedWith.find(entry => entry.path === 'c.ts')?.support
  assert.equal(bSupport, 3)
  assert.equal(cSupport, 2)
})

test('mergeMoat unions promptWindows by id and warns on duplicate id', () => {
  const base = moat([], [])
  const ours = moat([], [window('win-1', { files: ['a.ts'] })])
  const theirs = moat([], [
    window('win-2', { files: ['b.ts'] }),
    window('win-1', { files: ['c.ts'], windowQuality: 'meta' })
  ])

  const result = mergeMoat(base, ours, theirs)

  assert.equal(result.merged.promptWindows.length, 2)
  assert.equal(result.summary.newPromptWindowsFromTheirs, 1)
  assert.match(result.summary.warnings[0], /duplicate prompt window id win-1/)
  assert.deepEqual(
    result.merged.promptWindows.find(w => w.id === 'win-1')?.files,
    ['a.ts']
  )
})

test('mergeMoat detects POSSIBLE_RENAME, POSSIBLE_DELETION, and COUNT_REGRESSION', () => {
  const base = moat([
    profile('distiller.ts', { writeCount: 12, totalEvents: 12 }),
    profile('watcher.ts', { writeCount: 2, totalEvents: 2 })
  ])
  const ours = moat([
    profile('distiller.ts', { writeCount: 1, totalEvents: 1 }),
    profile('event-distiller.ts', {
      writeCount: 4,
      totalEvents: 4,
      coAccessedWith: [{ path: 'types.ts', support: 2 }]
    })
  ])
  const theirs = moat([
    profile('watcher.ts', {
      writeCount: 1,
      readCount: 1,
      totalEvents: 2,
      coAccessedWith: [{ path: 'types.ts', support: 2 }]
    })
  ])

  const result = mergeMoat(base, ours, theirs)
  const types = result.conflicts.map(conflict => conflict.type)

  assert.ok(types.includes('COUNT_REGRESSION'))
  assert.ok(types.includes('POSSIBLE_DELETION'))
})

test('autoResolveQualityConflicts resolves quality conflicts', () => {
  const base = moat([], [])
  const ours = moat([], [window('dup', { windowQuality: 'high' })])
  const theirs = moat([], [window('dup', { windowQuality: 'meta' })])

  const initial = mergeMoat(base, ours, theirs)
  assert.ok(initial.conflicts.some(conflict => conflict.type === 'QUALITY_CONFLICT'))

  const resolved = autoResolveQualityConflicts(initial)
  assert.equal(
    resolved.merged.promptWindows.find(windowEntry => windowEntry.id === 'dup')?.windowQuality,
    'high'
  )
  assert.equal(
    resolved.conflicts.filter(conflict => conflict.type === 'QUALITY_CONFLICT').length,
    0
  )
})

test('applyMergeDecisions can drop a possibly-deleted file from theirs', () => {
  const base = moat([profile('watcher.ts', { writeCount: 2, totalEvents: 2 })])
  const ours = moat([])
  const theirs = moat([profile('watcher.ts', { writeCount: 1, totalEvents: 1 })])

  const initial = mergeMoat(base, ours, theirs)
  const deletion = initial.conflicts.find(conflict => conflict.type === 'POSSIBLE_DELETION')
  assert.ok(deletion)

  const resolved = applyMergeDecisions(initial, [
    { id: deletion!.id, action: 'drop_theirs_path' }
  ])

  assert.equal(resolved.merged.hotFiles.length, 0)
  assert.equal(resolved.conflicts.length, 0)
})

test('no-conflict merge produces expected merged output', () => {
  const base = moat([])
  const ours = moat([profile('a.ts', { writeCount: 4, totalEvents: 4 })])
  const theirs = moat([profile('b.ts', { writeCount: 10, totalEvents: 10 })])

  const result = mergeMoat(base, ours, theirs)

  assert.equal(result.conflicts.length, 0)
  assert.equal(result.merged.hotFiles.length, 2)
  assert.equal(result.merged.hotFiles.find(file => file.relativePath === 'a.ts')?.writeCount, 4)
  assert.equal(result.merged.hotFiles.find(file => file.relativePath === 'b.ts')?.writeCount, 10)
})

test('branch-only file included without conflict when not in base', () => {
  const base = moat([profile('src/index.ts', { writeCount: 2, totalEvents: 2 })])
  const ours = moat([profile('src/index.ts', { writeCount: 2, totalEvents: 2 })])
  const theirs = moat([
    profile('src/index.ts', { writeCount: 2, totalEvents: 2 }),
    profile('src/merge-marker.ts', { writeCount: 1, totalEvents: 1 })
  ])

  const result = mergeMoat(base, ours, theirs)

  assert.equal(result.conflicts.filter(conflict => conflict.type === 'POSSIBLE_DELETION').length, 0)
  assert.ok(result.merged.hotFiles.some(file => file.relativePath === 'src/merge-marker.ts'))
})

test('ours-only file included without conflict when not in base', () => {
  const base = moat([profile('shared.ts', { writeCount: 2, totalEvents: 2 })])
  const ours = moat([
    profile('shared.ts', { writeCount: 2, totalEvents: 2 }),
    profile('ours-new.ts', { writeCount: 1, totalEvents: 1 })
  ])
  const theirs = moat([profile('shared.ts', { writeCount: 2, totalEvents: 2 })])

  const result = mergeMoat(base, ours, theirs)

  assert.equal(result.conflicts.filter(conflict => conflict.type === 'POSSIBLE_DELETION').length, 0)
  assert.ok(result.merged.hotFiles.some(file => file.relativePath === 'ours-new.ts'))
})

test('applyMergeDecisions keep_theirs restores theirs file after keep_ours removed it', () => {
  const base = moat([profile('legacy.ts', { writeCount: 3, totalEvents: 3 })])
  const ours = moat([])
  const theirs = moat([profile('legacy.ts', { writeCount: 1, totalEvents: 1 })])

  const initial = mergeMoat(base, ours, theirs)
  const deletion = initial.conflicts.find(conflict => conflict.type === 'POSSIBLE_DELETION')
  assert.ok(deletion)

  const stripped = applyMergeDecisions(initial, [{ id: deletion!.id, action: 'keep_ours' }])
  assert.equal(stripped.merged.hotFiles.length, 0)

  const restored = applyMergeDecisions(initial, [{ id: deletion!.id, action: 'keep_theirs' }])
  assert.ok(restored.merged.hotFiles.some(file => file.relativePath === 'legacy.ts'))
  assert.equal(restored.merged.hotFiles[0].writeCount, 1)
})
