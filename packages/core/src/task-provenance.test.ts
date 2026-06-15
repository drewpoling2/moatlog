import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildTaskExcerpt,
  detectTaskProvenance,
  enrichTaskProvenance,
  extractMatchingTaskText,
  extractTaskKeywords
} from './task-provenance.js'

const PASTED_DOCS_FEEDBACK = `Claude responded: This is solid.This is solid. Clean, readable, the three-step flow is clear.

Remove from sidebar:
"Structured Rendering" — internal dev page

Send these fixes to Cursor — sidebar cleanup, rename Watch→Capture, add the init command block prominently`

test('detectTaskProvenance flags pasted Claude responses', () => {
  assert.equal(detectTaskProvenance('Claude responded: This is solid.'), 'mixed')
  assert.equal(
    detectTaskProvenance('6:12 PMClaude responded: valuable feedback'),
    'mixed'
  )
  assert.equal(
    detectTaskProvenance("Here's a prompt you can hand to Cursor: fix hooks"),
    'mixed'
  )
  assert.equal(
    detectTaskProvenance('\uE000\uE001Claude responded: pasted analysis'),
    'mixed'
  )
  assert.equal(
    detectTaskProvenance('Add beforeReadFile hook to packages/cli/templates'),
    'user'
  )
})

test('extractMatchingTaskText prefers trailing instruction for mixed prompts', () => {
  const matching = extractMatchingTaskText(PASTED_DOCS_FEEDBACK, 'mixed')
  assert.match(matching, /Send these fixes to Cursor/i)
  assert.doesNotMatch(matching, /^Claude responded/i)
})

test('extractMatchingTaskText finds trailing Send line in single-block pasted tasks', () => {
  const singleBlock = `Claude responded: Analysis paragraph one.
Content fixes: stale heading called Watch.
Send these fixes to Cursor — sidebar cleanup, rename Watch→Capture.`
  const matching = extractMatchingTaskText(singleBlock, 'mixed')
  assert.match(matching, /Send these fixes to Cursor/i)
})

test('enrichTaskProvenance builds excerpt and keywords from trimmed text', () => {
  const enriched = enrichTaskProvenance(PASTED_DOCS_FEEDBACK)

  assert.equal(enriched.taskProvenance, 'mixed')
  assert.ok(enriched.taskExcerpt.length <= 201)
  assert.match(enriched.taskExcerpt, /Send these fixes/i)
  assert.ok(enriched.taskKeywords.includes('cursor'))
  assert.ok(!enriched.taskKeywords.includes('claude'))
})

test('buildTaskExcerpt truncates long text at word boundary', () => {
  const excerpt = buildTaskExcerpt('alpha '.repeat(80), 40)
  assert.ok(excerpt.length <= 41)
  assert.match(excerpt, /…$/)
})

test('extractTaskKeywords drops stop words', () => {
  const keywords = extractTaskKeywords('Update the moatlog distiller for prompt windows')
  assert.ok(keywords.includes('moatlog'))
  assert.ok(keywords.includes('distiller'))
  assert.ok(!keywords.includes('the'))
})
