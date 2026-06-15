import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_MOATLOGIGNORE_PATTERNS,
  isMoatlogIgnoredPath,
  matchesMoatlogIgnorePattern
} from './moatlogignore.js'

test('default patterns ignore env and secret files', () => {
  assert.ok(matchesMoatlogIgnorePattern('docs/.env.local', '.env*'))
  assert.ok(matchesMoatlogIgnorePattern('.env', '.env*'))
  assert.ok(matchesMoatlogIgnorePattern('certs/server.pem', '*.pem'))
  assert.ok(matchesMoatlogIgnorePattern('secrets/api.key', '*.key'))
  assert.ok(matchesMoatlogIgnorePattern('.ssh/id_rsa', 'id_rsa*'))
  assert.ok(matchesMoatlogIgnorePattern('config/credentials.json', '*credentials*'))
  assert.ok(matchesMoatlogIgnorePattern('.npmrc', '.npmrc'))
})

test('default patterns do not ignore normal source files', () => {
  assert.equal(matchesMoatlogIgnorePattern('packages/core/src/distiller.ts', '.env*'), false)
  assert.equal(matchesMoatlogIgnorePattern('docs/styles/tokens.css', '*.pem'), false)
})

test('isMoatlogIgnoredPath uses built-in defaults without a user file', () => {
  assert.ok(isMoatlogIgnoredPath('docs/.env.local', process.cwd()))
  assert.equal(
    isMoatlogIgnoredPath('packages/core/src/distiller.ts', process.cwd()),
    false
  )
})

test('DEFAULT_MOATLOGIGNORE_PATTERNS includes expected entries', () => {
  assert.deepEqual([...DEFAULT_MOATLOGIGNORE_PATTERNS], [
    '.env*',
    '*.pem',
    '*.key',
    'id_rsa*',
    '*credentials*',
    '.npmrc'
  ])
})
