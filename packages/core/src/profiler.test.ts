import assert from 'node:assert/strict'
import test from 'node:test'
import { Profiler, buildCoAccessedFromWindows } from './profiler.js'
import type { AgentEvent, PromptWindow } from './types.js'

function event(
  partial: Pick<AgentEvent, 'action' | 'relativePath' | 'timestamp'> &
    Partial<AgentEvent>
): AgentEvent {
  return {
    id: partial.id ?? crypto.randomUUID(),
    sessionId: partial.sessionId ?? 'session-1',
    agent: 'cursor',
    projectName: 'test',
    ...partial
  }
}

test('Profiler counts reads and builds read-before-edit patterns', () => {
  const events: AgentEvent[] = [
    event({
      action: 'prompt_start',
      task: 'Update tokens.css typography scale for docs site',
      timestamp: '2026-06-11T10:00:00.000Z'
    }),
    event({
      action: 'read',
      relativePath: 'docs/styles/tokens.css',
      timestamp: '2026-06-11T10:01:00.000Z'
    }),
    event({
      action: 'read',
      relativePath: 'docs/styles/base.css',
      timestamp: '2026-06-11T10:02:00.000Z'
    }),
    event({
      action: 'write',
      relativePath: 'docs/styles/tokens.css',
      timestamp: '2026-06-11T10:03:00.000Z'
    }),
    event({
      action: 'read',
      relativePath: 'docs/styles/content.css',
      timestamp: '2026-06-11T10:04:00.000Z'
    }),
    event({
      action: 'write',
      relativePath: 'docs/styles/content.css',
      timestamp: '2026-06-11T10:05:00.000Z'
    })
  ]

  const profiler = new Profiler(events)
  const tokensProfile = profiler.getFileProfile('docs/styles/tokens.css')
  const contentProfile = profiler.getFileProfile('docs/styles/content.css')

  assert.ok(tokensProfile)
  assert.equal(tokensProfile!.readCount, 1)
  assert.equal(tokensProfile!.writeCount, 1)
  assert.deepEqual(tokensProfile!.typicallyAccessedBefore, ['docs/styles/base.css'])

  assert.ok(contentProfile)
  assert.equal(contentProfile!.readCount, 1)
  assert.equal(contentProfile!.writeCount, 1)
  assert.ok(contentProfile!.typicallyAccessedBefore?.includes('docs/styles/tokens.css'))
})

test('Profiler collects deduplicated agents per file profile', () => {
  const events: AgentEvent[] = [
    event({
      action: 'prompt_start',
      task: 'Cursor change',
      timestamp: '2026-06-11T10:00:00.000Z',
      agent: 'cursor'
    }),
    event({
      action: 'write',
      relativePath: 'packages/core/src/distiller.ts',
      timestamp: '2026-06-11T10:01:00.000Z',
      agent: 'cursor'
    }),
    event({
      action: 'prompt_start',
      task: 'Claude follow-up',
      timestamp: '2026-06-12T10:00:00.000Z',
      agent: 'claude-code',
      sessionId: 'session-2'
    }),
    event({
      action: 'write',
      relativePath: 'packages/core/src/distiller.ts',
      timestamp: '2026-06-12T10:01:00.000Z',
      agent: 'claude-code',
      sessionId: 'session-2'
    }),
    event({
      action: 'write',
      relativePath: 'docs/app/globals.css',
      timestamp: '2026-06-12T10:02:00.000Z',
      agent: 'claude-code',
      sessionId: 'session-2'
    })
  ]

  const profiler = new Profiler(events)
  const distillerProfile = profiler.getFileProfile('packages/core/src/distiller.ts')
  const globalsProfile = profiler.getFileProfile('docs/app/globals.css')

  assert.deepEqual(distillerProfile?.agents, ['claude-code', 'cursor'])
  assert.deepEqual(globalsProfile?.agents, ['claude-code'])
})

test('buildCoAccessedFromWindows counts distinct windows and suppresses support < 2', () => {
  const windows: Pick<PromptWindow, 'id' | 'files'>[] = [
    {
      id: 'w-css',
      files: ['docs/styles/tokens.css', 'docs/styles/base.css']
    },
    {
      id: 'w-mcp',
      files: ['packages/mcp/src/server.ts', 'packages/core/src/types.ts']
    },
    {
      id: 'w-css-2',
      files: ['docs/styles/tokens.css', 'docs/app/globals.css']
    }
  ]

  const tokensCoAccess = buildCoAccessedFromWindows('docs/styles/tokens.css', windows)
  assert.equal(tokensCoAccess.length, 0)

  const serverCoAccess = buildCoAccessedFromWindows('packages/mcp/src/server.ts', windows)
  assert.equal(serverCoAccess.length, 0)
  assert.equal(
    serverCoAccess.some(entry => entry.path === 'docs/styles/tokens.css'),
    false
  )
})

test('buildCoAccessedFromWindows keeps pairs with support >= 2', () => {
  const windows: Pick<PromptWindow, 'id' | 'files'>[] = [
    { id: 'w1', files: ['a.ts', 'b.ts', 'c.ts'] },
    { id: 'w2', files: ['a.ts', 'b.ts'] },
    { id: 'w3', files: ['a.ts', 'c.ts'] }
  ]

  const coAccess = buildCoAccessedFromWindows('a.ts', windows)
  assert.deepEqual(coAccess, [
    { path: 'b.ts', support: 2 },
    { path: 'c.ts', support: 2 }
  ])
})
