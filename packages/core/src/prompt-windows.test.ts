import assert from 'node:assert/strict'
import test from 'node:test'
import { EVENT_LOG_BOUNDARY_SESSION } from './logger.js'
import { buildPromptWindows, isFollowUpPrompt } from './prompt-windows.js'
import type { AgentEvent } from './types.js'

const TOKENS_PROMPT_ID = '896b93d9-c4de-42d2-bcf5-f3ba64d16b0a'
const YOU_DONE_PROMPT_ID = '22e4e4a9-1c84-456c-815c-577ab0d9624f'
const SESSION_ID = 'df024cd4-6b58-44e9-9e2a-a43b388d429b'

const EXPECTED_TOKEN_MIGRATION_FILES = [
  'docs/styles/tokens.css',
  'docs/app/globals.css',
  'docs/app/layout.tsx',
  'docs/lib/theme.ts',
  'docs/styles/components/code.css',
  'docs/styles/marketing/terminal.css',
  'docs/lib/renderer/Command.tsx',
  'docs/lib/renderer/CodeBlock.tsx',
  'docs/lib/renderer/components.tsx',
  'docs/styles/components/content.css',
  'docs/styles/components/step.css',
  'docs/styles/components/callout.css',
  'docs/styles/components/theme-toggle.css',
  'docs/app/docs/ThemeToggle.tsx',
  'docs/app/docs/DocsHeader.tsx',
  'docs/styles/components/layout.css',
  'docs/styles/components/sidebar.css'
]

function event(
  partial: Pick<AgentEvent, 'action' | 'timestamp' | 'id'> &
    Partial<AgentEvent>
): AgentEvent {
  return {
    sessionId: SESSION_ID,
    agent: 'cursor',
    projectName: 'moatlog',
    ...partial
  }
}

test('isFollowUpPrompt detects short follow-ups like "you done?"', () => {
  assert.equal(isFollowUpPrompt('you done?'), true)
  assert.equal(
    isFollowUpPrompt('Border & Radius Tokens v2 design system migration spec'),
    false
  )
})

test('buildPromptWindows sets agent from prompt_start event', () => {
  const events: AgentEvent[] = [
    event({
      id: 'prompt-cursor',
      action: 'prompt_start',
      timestamp: '2026-06-12T10:00:00.000Z',
      task: 'Cursor task',
      agent: 'cursor'
    }),
    event({
      id: 'prompt-claude',
      action: 'prompt_start',
      timestamp: '2026-06-12T10:05:00.000Z',
      task: 'Claude task',
      agent: 'claude-code'
    })
  ]

  const windows = buildPromptWindows(events, '/tmp/moatlog')

  assert.equal(windows.find(window => window.id === 'prompt-cursor')?.agent, 'cursor')
  assert.equal(
    windows.find(window => window.id === 'prompt-claude')?.agent,
    'claude-code'
  )
})

test('buildPromptWindows attributes late writes to the design-tokens prompt, not "you done?"', () => {
  const events: AgentEvent[] = [
    event({
      id: TOKENS_PROMPT_ID,
      action: 'prompt_start',
      timestamp: '2026-06-12T17:11:46.000Z',
      task: '/* moatlog Border & Radius Tokens v2 — full pasted CSS design spec */'
    }),
    event({
      id: YOU_DONE_PROMPT_ID,
      action: 'prompt_start',
      timestamp: '2026-06-12T17:22:03.000Z',
      task: 'you done?'
    }),
    ...EXPECTED_TOKEN_MIGRATION_FILES.map((relativePath, index) =>
      event({
        id: `write-${index}`,
        action: 'write',
        timestamp: `2026-06-12T17:23:${String(12 + index).padStart(2, '0')}.000Z`,
        relativePath,
        path: `/Users/dev/moatlog/${relativePath}`
      })
    )
  ]

  const windows = buildPromptWindows(events, '/tmp/moatlog')
  const tokensWindow = windows.find(window => window.id === TOKENS_PROMPT_ID)
  const youDoneWindow = windows.find(window => window.id === YOU_DONE_PROMPT_ID)

  assert.ok(tokensWindow)
  assert.ok(youDoneWindow)
  assert.equal(tokensWindow!.files.length, EXPECTED_TOKEN_MIGRATION_FILES.length)
  assert.equal(youDoneWindow!.files.length, 0)

  for (const file of EXPECTED_TOKEN_MIGRATION_FILES) {
    assert.ok(tokensWindow!.files.includes(file), `expected ${file} on tokens window`)
  }
})

test('buildPromptWindows uses generationId when present on file events', () => {
  const events: AgentEvent[] = [
    event({
      id: 'prompt-a',
      action: 'prompt_start',
      timestamp: '2026-06-12T10:00:00.000Z',
      task: 'Implement feature A with packages/core/src/foo.ts',
      generationId: 'gen-a'
    }),
    event({
      id: 'prompt-b',
      action: 'prompt_start',
      timestamp: '2026-06-12T10:05:00.000Z',
      task: 'you done?',
      generationId: 'gen-b'
    }),
    event({
      id: 'write-a',
      action: 'write',
      timestamp: '2026-06-12T10:06:00.000Z',
      relativePath: 'packages/core/src/foo.ts',
      generationId: 'gen-a'
    })
  ]

  const windows = buildPromptWindows(events, '/tmp/moatlog')
  const promptA = windows.find(window => window.id === 'prompt-a')
  const promptB = windows.find(window => window.id === 'prompt-b')

  assert.deepEqual(promptA?.files, ['packages/core/src/foo.ts'])
  assert.deepEqual(promptB?.files, [])
})

test('event_log_boundary closes stale open windows from prior JSONL files', () => {
  const events: AgentEvent[] = [
    event({
      id: 'june11-prompt',
      action: 'prompt_start',
      timestamp: '2026-06-11T20:00:00.000Z',
      task: 'Refactor packages/core/src/project-root.ts'
    }),
    event({
      id: 'june11-write',
      action: 'write',
      timestamp: '2026-06-11T20:01:00.000Z',
      relativePath: 'packages/core/src/project-root.ts',
      path: '/tmp/moatlog/packages/core/src/project-root.ts'
    }),
    event({
      id: 'june11-followup',
      action: 'prompt_start',
      timestamp: '2026-06-11T20:05:00.000Z',
      task: 'you done?'
    }),
    {
      id: 'boundary:events-2026-06-11.jsonl',
      timestamp: '2026-06-11T23:59:59.001Z',
      sessionId: EVENT_LOG_BOUNDARY_SESSION,
      agent: 'cursor',
      action: 'event_log_boundary',
      projectName: 'moatlog'
    },
    event({
      id: TOKENS_PROMPT_ID,
      action: 'prompt_start',
      timestamp: '2026-06-12T17:11:46.000Z',
      task: '/* moatlog Border & Radius Tokens v2 — full pasted CSS design spec */'
    }),
    event({
      id: YOU_DONE_PROMPT_ID,
      action: 'prompt_start',
      timestamp: '2026-06-12T17:22:03.000Z',
      task: 'you done?'
    }),
    ...EXPECTED_TOKEN_MIGRATION_FILES.map((relativePath, index) =>
      event({
        id: `write-${index}`,
        action: 'write',
        timestamp: `2026-06-12T17:23:${String(12 + index).padStart(2, '0')}.000Z`,
        relativePath,
        path: `/tmp/moatlog/${relativePath}`
      })
    )
  ]

  const windows = buildPromptWindows(events, '/tmp/moatlog')
  const tokensWindow = windows.find(window => window.id === TOKENS_PROMPT_ID)
  const youDoneWindow = windows.find(window => window.id === YOU_DONE_PROMPT_ID)
  const june11Prompt = windows.find(window => window.id === 'june11-prompt')

  assert.ok(tokensWindow)
  assert.ok(youDoneWindow)
  assert.ok(june11Prompt)
  assert.equal(june11Prompt!.files.length, 1)
  assert.equal(tokensWindow!.files.length, EXPECTED_TOKEN_MIGRATION_FILES.length)
  assert.equal(youDoneWindow!.files.length, 0)
  assert.ok(
    tokensWindow!.files.every(file => file.startsWith('docs/')),
    'June 12 tokens window should not absorb packages/core files'
  )
})
