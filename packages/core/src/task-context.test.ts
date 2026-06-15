import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyWindowQuality } from './task-context.js'
import type { PromptWindow } from './types.js'

type WindowInput = Pick<
  PromptWindow,
  'task' | 'taskExcerpt' | 'taskProvenance' | 'files'
>

function classify(input: WindowInput) {
  return classifyWindowQuality(input)
}

test('classifyWindowQuality: implementation spec quoting meta patterns is high', () => {
  const task =
    '1. Read capture (highest priority)\nAdd a beforeReadFile hook in .cursor/hooks.json alongside the existing afterFileEdit hook. Have it log file_path and timestamp to the same event stream/store that writes currently go to, tagged with conversation_id/session and prompt-window context. Return { "permission": "allow" }.\nUpdate the distiller (distiller.ts) to:\n\nTrack readCount per file (currently always 0)\nCompute a readBeforeEdit sequence per file/session — i.e., for files that are both read and edited in the same session, record which reads preceded which edits\nFeed this into typicallyAccessedBefore so retrieval can surface "files usually read before editing X"\n\nDo not capture beforeTabFileRead (Tab autocomplete) — only beforeReadFile (Agent reads), to avoid noise from routine editor activity.\n\n2. Meta-query filtering (quick parallel win)\nIn the retrieval/query layer, detect meta queries (patterns like "do you have access", "is this helping", "is moat working", "what\'s your feedback", questions about the tool itself rather than the codebase) and either exclude windowQuality: meta windows from retrieval results entirely, or down-rank them heavily. Add a small test set of known meta phrasings from this session\'s transcripts to validate the filter.'

  assert.equal(
    classify({
      task,
      taskProvenance: 'user',
      taskExcerpt:
        '1. Read capture (highest priority) Add a beforeReadFile hook in .cursor/hooks.json alongside the existing afterFileEdit hook. Have it log file_path and timestamp to the same event stream/store that…',
      files: [
        'packages/cli/templates/moatlog-event.sh',
        '.cursor/hooks/moatlog-event.sh',
        'packages/core/src/meta-query.ts',
        'packages/core/src/task-context.ts',
        'packages/core/src/profiler.ts',
        'packages/core/src/index.ts',
        'packages/core/src/meta-query.test.ts',
        'packages/core/src/profiler.test.ts',
        'packages/mcp/src/server.ts',
        'packages/cli/src/commands/status.ts',
        'packages/cli/src/bin.ts',
        'packages/cli/src/commands/doctor.ts',
        'packages/cli/src/theme.ts',
        'packages/cli/src/commands/init.ts'
      ]
    }),
    'high'
  )
})

test('classifyWindowQuality: short meta follow-up with no files stays meta', () => {
  assert.equal(
    classify({
      task: 'you done?',
      taskProvenance: 'user',
      taskExcerpt: 'you done?',
      files: []
    }),
    'meta'
  )
})

test('classifyWindowQuality: meta-shaped head with many attributed files is low', () => {
  assert.equal(
    classify({
      task: 'you done?',
      taskProvenance: 'user',
      taskExcerpt: 'you done?',
      files: ['a.ts', 'b.ts', 'c.ts']
    }),
    'low'
  )
})

test('classifyWindowQuality: meta content pattern only in tail of long task is not meta', () => {
  const task =
    'Fix classifyWindowQuality in packages/core/src/task-context.ts. ' +
    'Detect meta queries (patterns like "do you have access", "is moat working") ' +
    'but only at the start of the task text, not when quoted as examples mid-spec.'

  assert.equal(
    classify({
      task,
      taskProvenance: 'user',
      files: ['packages/core/src/task-context.ts', 'packages/core/src/distiller.ts']
    }),
    'high'
  )
})

test('classifyWindowQuality: pasted Claude windows use trailing instruction and file count', () => {
  const pastedWindows: Array<{ label: string; input: WindowInput; expected: string }> = [
    {
      label: '6eb22449 sidebar fixes',
      input: {
        task:
          'Claude responded: This is solid. Clean, readable, the three-step flow is clear.\nSend these fixes to Cursor — sidebar cleanup, rename Watch→Capture, add the init command block prominently, fix inline code on MCP tool names, remove Dashboard and Search.',
        taskProvenance: 'mixed',
        taskExcerpt:
          'Send these fixes to Cursor — sidebar cleanup, rename Watch→Capture, add the init command block prominently, fix inline code on MCP tool names, remove Dashboard and Search.',
        files: [
          'docs/content/index.json',
          'docs/app/docs/DocsHeader.tsx',
          'docs/app/globals.css'
        ]
      },
      expected: 'high'
    },
    {
      label: '23390b9e init prompt',
      input: {
        task:
          '6:12 PM Claude responded: This is valuable honest feedback from the agent itself.\nWant to build moatlog init now?',
        taskProvenance: 'mixed',
        taskExcerpt:
          'The design system and docs are in great shape. The product setup flow is the blocker. Want to build moatlog init now?',
        files: [
          'packages/cli/templates/moatlog-event.sh',
          'packages/cli/templates/moatlog-distill.sh',
          'packages/cli/templates/moatlog.mdc',
          'packages/cli/src/commands/init.ts',
          'packages/cli/src/bin.ts'
        ]
      },
      expected: 'high'
    },
    {
      label: 'e8552aa0 status alignment note',
      input: {
        task:
          "3:32 PM Claude responded: That's a clean root-cause trace — and the fix is exactly the kind of cheap, high-value relabeling work.",
        taskProvenance: 'mixed',
        taskExcerpt:
          "3:32 PM Claude responded: That's a clean root-cause trace — and the fix is exactly the kind of cheap, high-value relabeling/alignment work that's been the recurring theme: not a logic b…That's a…",
        files: ['packages/cli/src/commands/status.ts']
      },
      expected: 'low'
    },
    {
      label: 'bdf11ad3 llms.txt script',
      input: {
        task:
          "Here's a prompt you can hand to Cursor:\n\nCreate a script scripts/generate-llms-txt.ts …\nRun the script once to confirm it generates correctly, and show me the output.",
        taskProvenance: 'mixed',
        taskExcerpt:
          'Run the script once to confirm it generates correctly, and show me the output.',
        files: [
          'docs/lib/excerpt.ts',
          'docs/lib/site.ts',
          'docs/scripts/generate-llms-txt.ts',
          'docs/public/llms.txt'
        ]
      },
      expected: 'high'
    }
  ]

  for (const { label, input, expected } of pastedWindows) {
    assert.equal(classify(input), expected, label)
  }
})

test('classifyWindowQuality: genuine meta query at task start is meta', () => {
  assert.equal(
    classify({
      task: 'how is the mcp moat working? is it helping or hurting?',
      taskProvenance: 'user',
      taskExcerpt: 'how is the mcp moat working? is it helping or hurting?',
      files: []
    }),
    'meta'
  )
})
