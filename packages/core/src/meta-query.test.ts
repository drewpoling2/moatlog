import assert from 'node:assert/strict'
import test from 'node:test'
import { isMetaQuery, META_QUERY_FIXTURES } from './meta-query.js'

test('isMetaQuery matches known session meta phrasings', () => {
  for (const query of META_QUERY_FIXTURES) {
    assert.equal(
      isMetaQuery(query),
      true,
      `expected meta query: ${query.slice(0, 80)}`
    )
  }
})

test('isMetaQuery does not match normal codebase tasks', () => {
  const codebaseTasks = [
    'Make base 1rem and adjust the typography scale in tokens.css',
    'Add beforeReadFile hook and update distiller readCount',
    'Replace the header logo with light and dark SVGs',
    'Fix the docs layout grid in layout.css'
  ]

  for (const query of codebaseTasks) {
    assert.equal(isMetaQuery(query), false, `expected codebase task: ${query}`)
  }
})
