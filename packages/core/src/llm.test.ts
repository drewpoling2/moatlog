import assert from 'node:assert/strict'
import test from 'node:test'
import { parseJsonFromLlmResponse } from './llm.js'

test('parseJsonFromLlmResponse strips markdown json fences', () => {
  const raw = `Here is the result:

\`\`\`json
{
  "skills": [
    { "id": 1, "name": "docs-landing-visual" }
  ]
}
\`\`\`

Done.`

  const parsed = parseJsonFromLlmResponse<{ skills: Array<{ name: string }> }>(raw)
  assert.ok(parsed)
  assert.equal(parsed.skills[0]?.name, 'docs-landing-visual')
})

test('parseJsonFromLlmResponse ignores prose after fenced JSON', () => {
  const raw = `\`\`\`json
{"skills":[{"id":1,"name":"core-distiller-pipeline"}]}
\`\`\`

Name derivations use {domain}-{outcome} format.`

  const parsed = parseJsonFromLlmResponse<{ skills: Array<{ name: string }> }>(raw)
  assert.ok(parsed)
  assert.equal(parsed.skills[0]?.name, 'core-distiller-pipeline')
})
