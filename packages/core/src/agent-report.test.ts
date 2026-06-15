import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAgentReportSections } from './agent-report.js'
import type { AgentEvent } from './types.js'

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

test('buildAgentReportSections groups sessions and hot files by agent', () => {
  const events: AgentEvent[] = [
    event({
      action: 'prompt_start',
      task: 'Update distiller',
      timestamp: '2026-06-11T10:00:00.000Z',
      agent: 'cursor',
      sessionId: 'cursor-session-1'
    }),
    event({
      action: 'write',
      relativePath: 'packages/core/src/distiller.ts',
      timestamp: '2026-06-11T10:01:00.000Z',
      agent: 'cursor',
      sessionId: 'cursor-session-1'
    }),
    event({
      action: 'write',
      relativePath: 'packages/core/src/distiller.ts',
      timestamp: '2026-06-11T10:02:00.000Z',
      agent: 'cursor',
      sessionId: 'cursor-session-1'
    }),
    event({
      action: 'prompt_start',
      task: 'Refresh docs globals',
      timestamp: '2026-06-12T10:00:00.000Z',
      agent: 'claude-code',
      sessionId: 'claude-session-1'
    }),
    event({
      action: 'write',
      relativePath: 'docs/app/globals.css',
      timestamp: '2026-06-12T10:01:00.000Z',
      agent: 'claude-code',
      sessionId: 'claude-session-1'
    }),
    event({
      action: 'write',
      relativePath: 'docs/styles/tokens.css',
      timestamp: '2026-06-12T10:02:00.000Z',
      agent: 'claude-code',
      sessionId: 'claude-session-1'
    })
  ]

  const sections = buildAgentReportSections(events)

  assert.equal(sections.length, 2)
  assert.equal(sections[0].agent, 'claude-code')
  assert.equal(sections[0].sessionCount, 1)
  assert.equal(sections[0].hotFiles[0]?.relativePath, 'docs/app/globals.css')

  const cursorSection = sections.find(section => section.agent === 'cursor')
  assert.ok(cursorSection)
  assert.equal(cursorSection!.sessionCount, 1)
  assert.equal(cursorSection!.hotFiles[0]?.relativePath, 'packages/core/src/distiller.ts')
  assert.equal(cursorSection!.hotFiles[0]?.totalEvents, 2)
})
