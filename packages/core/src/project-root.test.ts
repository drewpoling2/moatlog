import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import test from 'node:test'
import { findProjectRoot, isMoatlogProjectRoot } from './project-root.js'

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

test('findProjectRoot walks up from nested cwd to moatlog project', () => {
  const root = tempDir('moatlog-root-')
  const nested = path.join(root, 'packages', 'cli')

  try {
    fs.mkdirSync(path.join(root, '.moatlog'), { recursive: true })
    fs.writeFileSync(path.join(root, '.moatlog', 'moat.json'), '{}')
    fs.mkdirSync(nested, { recursive: true })

    assert.equal(isMoatlogProjectRoot(root), true)
    assert.equal(isMoatlogProjectRoot(nested), false)
    assert.equal(findProjectRoot(nested), root)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('findProjectRoot prefers repo root over nested hooks-only init', () => {
  const root = tempDir('moatlog-root-')
  const nested = path.join(root, 'packages', 'cli')

  try {
    fs.mkdirSync(path.join(root, '.moatlog'), { recursive: true })
    fs.writeFileSync(path.join(root, '.moatlog', 'moat.json'), '{}')
    fs.mkdirSync(path.join(nested, '.cursor', 'hooks'), { recursive: true })
    fs.writeFileSync(
      path.join(nested, '.cursor', 'hooks.json'),
      JSON.stringify({
        version: 1,
        hooks: { beforeReadFile: [{ command: '.cursor/hooks/moatlog-event.sh' }] }
      })
    )

    assert.equal(findProjectRoot(nested), root)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('findProjectRoot ignores empty nested .moatlog without moat data', () => {
  const root = tempDir('moatlog-root-')
  const nested = path.join(root, 'packages', 'cli')

  try {
    fs.mkdirSync(path.join(root, '.moatlog'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.moatlog', 'events-2026-06-11.jsonl'),
      '{"id":"1","timestamp":"2026-06-11T00:00:00.000Z","sessionId":"s","agent":"cursor","action":"write","relativePath":"a.ts","projectName":"x"}\n'
    )
    fs.mkdirSync(path.join(nested, '.moatlog'), { recursive: true })
    fs.writeFileSync(path.join(nested, '.moatlog', 'events-2026-06-11.jsonl'), '')

    assert.equal(findProjectRoot(nested), root)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
