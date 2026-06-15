import assert from 'node:assert/strict'
import test from 'node:test'
import { MOAT_GENERATED_NOTICE } from './distiller.js'
import { MOAT_SCHEMA_VERSION } from './moat-schema.js'
import {
  computeRetrievalMetrics,
  getQualifyingWindows,
  runRetrievalEval
} from './eval.js'
import { baselineTopFiles, moatWithoutWindow, retrievalFromMoat } from './retrieval.js'
import type { FileProfile, Moat, PromptWindow } from './types.js'

function profile(relativePath: string, totalEvents: number): FileProfile {
  return {
    relativePath,
    agents: ['cursor'],
    writeCount: totalEvents,
    createCount: 0,
    deleteCount: 0,
    totalEvents,
    sessionsAppeared: 1,
    firstSeen: '2026-06-01T00:00:00.000Z',
    lastSeen: '2026-06-01T00:00:00.000Z',
    coAccessedWith: []
  }
}

function window(
  id: string,
  partial: Partial<PromptWindow> & Pick<PromptWindow, 'files'>
): PromptWindow {
  return {
    id,
    timestamp: '2026-06-01T00:00:00.000Z',
    sessionId: 'session-1',
    agent: 'cursor',
    ...partial
  }
}

function moat(
  promptWindows: PromptWindow[],
  hotFiles: FileProfile[] = []
): Moat {
  return {
    _generated: MOAT_GENERATED_NOTICE,
    _version: MOAT_SCHEMA_VERSION,
    scope: 'root',
    projectName: 'test',
    generatedAt: '2026-06-01T00:00:00.000Z',
    generatedFrom: '0 events across 0 sessions',
    totalEvents: 0,
    totalSessions: 0,
    dataHealth: {
      readsCaptured: false,
      windowCounts: { high: 0, low: 0, meta: 0 }
    },
    hotFiles,
    sessions: [],
    extensionBreakdown: {},
    promptWindows,
    taskFileSets: []
  }
}

function highWindow(
  id: string,
  taskExcerpt: string,
  files: string[]
): PromptWindow {
  return window(id, {
    taskExcerpt,
    windowQuality: 'high',
    files,
    pathsInTask: files,
    pathsInTaskNormalized: files
  })
}

test('moatWithoutWindow excludes the target window from promptWindows and taskFileSets', () => {
  const source = moat([
    highWindow('w1', 'update distiller.ts and task-context.ts', [
      'packages/core/src/distiller.ts',
      'packages/core/src/task-context.ts'
    ]),
    highWindow('w2', 'fix window attribution in profiler.ts', [
      'packages/core/src/profiler.ts',
      'packages/core/src/prompt-windows.ts'
    ])
  ])

  const view = moatWithoutWindow(source, 'w1')

  assert.equal(view.promptWindows.length, 1)
  assert.equal(view.promptWindows[0].id, 'w2')
  assert.ok(view.taskFileSets.every(set => !set.windowIds.includes('w1')))
})

test('computeRetrievalMetrics computes hit, precision@5, and recall@5', () => {
  const metrics = computeRetrievalMetrics(
    ['a.ts', 'b.ts', 'c.ts'],
    ['a.ts', 'x.ts', 'b.ts', 'y.ts', 'z.ts']
  )

  assert.equal(metrics.hit, true)
  assert.equal(metrics.precisionAt5, 0.4)
  assert.equal(metrics.recallAt5, 2 / 3)
})

test('baselineTopFiles returns hottest files regardless of task', () => {
  const source = moat([], [
    profile('a.ts', 10),
    profile('b.ts', 50),
    profile('c.ts', 30),
    profile('d.ts', 5),
    profile('e.ts', 40),
    profile('f.ts', 1)
  ])

  assert.deepEqual(baselineTopFiles(source, 3), ['b.ts', 'e.ts', 'c.ts'])
})

test('getQualifyingWindows excludes single-file windows at default threshold', () => {
  const source = moat([
    highWindow('w1', 'single file task', ['only.ts']),
    highWindow('w2', 'multi file task', ['a.ts', 'b.ts']),
    window('w3', {
      taskExcerpt: 'low quality task with enough files',
      windowQuality: 'low',
      files: ['a.ts', 'b.ts']
    }),
    window('w4', {
      windowQuality: 'high',
      files: ['a.ts', 'b.ts']
    })
  ])

  const qualifying = getQualifyingWindows(source, 2)

  assert.equal(qualifying.length, 1)
  assert.equal(qualifying[0].id, 'w2')
})

test('runRetrievalEval reports insufficient data when fewer than 5 qualifying windows', () => {
  const source = moat([
    highWindow('w1', 'task one with two files', ['a.ts', 'b.ts']),
    highWindow('w2', 'task two with two files', ['c.ts', 'd.ts'])
  ])

  const result = runRetrievalEval(source)

  assert.equal(result.insufficientData, true)
  assert.equal(result.qualifyingWindows, 2)
  assert.equal(result.windows.length, 0)
})

test('runRetrievalEval computes baseline metrics when requested', () => {
  const windows = Array.from({ length: 5 }, (_, index) =>
    highWindow(
      `w${index + 1}`,
      `work on file-${index + 1}.ts and shared.ts for feature ${index + 1}`,
      [`packages/file-${index + 1}.ts`, 'packages/shared.ts']
    )
  )

  const source = moat(windows, [
    profile('packages/shared.ts', 100),
    profile('packages/file-1.ts', 80),
    profile('packages/file-2.ts', 70),
    profile('packages/file-3.ts', 60),
    profile('packages/file-4.ts', 50),
    profile('packages/file-5.ts', 40)
  ])

  const enriched = moatWithoutWindow(source, 'missing')
  assert.equal(enriched.promptWindows.length, 5)

  const result = runRetrievalEval(source, { baseline: true, limit: 5 })

  assert.equal(result.insufficientData, false)
  assert.equal(result.evaluatedWindows, 5)
  assert.ok(result.baseline)
  assert.equal(result.windows.length, 5)
  assert.equal(result.windows[0].baselineReturned?.length, 5)
  assert.equal(typeof result.baseline.hitRate, 'number')
  assert.equal(typeof result.baseline.improvementPp, 'number')
})

test('leave-one-out retrieval does not match through the held-out window', () => {
  const heldOut = highWindow(
    'held-out',
    'very specific zebra stripe pattern in zebra-module.ts',
    ['packages/core/src/zebra-module.ts', 'packages/core/src/zebra-util.ts']
  )
  const unrelated = highWindow(
    'other',
    'update sidebar.css and toc.css layout styling',
    ['docs/styles/components/sidebar.css', 'docs/styles/components/toc.css']
  )

  const source = moat([heldOut, unrelated])
  const full = retrievalFromMoat(source, heldOut.taskExcerpt!, 5)
  const heldOutView = retrievalFromMoat(
    moatWithoutWindow(source, 'held-out'),
    heldOut.taskExcerpt!,
    5
  )

  assert.ok(full)
  assert.ok((full.matchedWindows ?? 0) >= 1)
  assert.equal(heldOutView, null)
})

test('runRetrievalEval hit rate reflects overlapping retrieval results', () => {
  const windows = [
    highWindow('w1', 'update eval.ts and retrieval.ts', ['packages/core/src/eval.ts', 'packages/core/src/retrieval.ts']),
    highWindow('w2', 'update sidebar.css and toc.css', ['docs/styles/components/sidebar.css', 'docs/styles/components/toc.css']),
    highWindow('w3', 'update merge.ts and merge command', ['packages/core/src/merge.ts', 'packages/cli/src/commands/merge.ts']),
    highWindow('w4', 'update distiller.ts and profiler.ts', ['packages/core/src/distiller.ts', 'packages/core/src/profiler.ts']),
    highWindow('w5', 'update init.ts and doctor.ts', ['packages/cli/src/commands/init.ts', 'packages/cli/src/commands/doctor.ts'])
  ]

  const source = moat(windows)
  const result = runRetrievalEval(source, { limit: 5 })

  assert.equal(result.insufficientData, false)
  assert.equal(result.evaluatedWindows, 5)
  assert.ok(result.hitRate >= 0 && result.hitRate <= 1)
  assert.equal(result.hitCount, Math.round(result.hitRate * result.evaluatedWindows))
})
