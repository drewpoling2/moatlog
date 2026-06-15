import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { test } from 'node:test'
import { detectInstalledAgents } from './agents.js'
import {
  buildAgentsMdSkillsSection,
  hasAgentsMdSkillsSection,
  MOATLOG_SKILLS_END,
  MOATLOG_SKILLS_START,
  updateAgentsMdContent
} from './agents-md.js'
import type { Skill } from './skills.js'
import {
  countGeneratedCursorSkills,
  generateAndWriteSkills,
  generateSkills,
  getExistingSkillFiles,
  LLM_SKILL_MARKER,
  NEW_SESSIONS_AUTO_REGEN_THRESHOLD,
  shouldAutoRegenSkills,
  skillsAreStale,
  skillToMdc,
  writeCursorSkills
} from './skills.js'
import type { Moat } from './types.js'

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

const sampleSkill: Skill = {
  name: 'docs-landing-visual',
  description: 'Landing page visual updates',
  triggerDescription: 'When editing docs/app/components/landing/LandingPage.tsx',
  coreFiles: [{ path: 'docs/app/components/landing/LandingPage.tsx', pct: 100 }],
  coAccessPairs: [],
  guidance: 'Update component and CSS together.',
  exampleTasks: ['update landing hero'],
  occurrences: 4
}

const landingLlmResponse = JSON.stringify({
  skills: [
    {
      id: 1,
      name: 'docs-landing-visual',
      description: 'Landing page visual updates',
      triggerDescription: 'When editing docs/app/components/landing/LandingPage.tsx or docs/styles/marketing/landing.css',
      guidance: 'Update component and CSS together.',
      coreFiles: [
        'docs/app/components/landing/LandingPage.tsx',
        'docs/styles/marketing/landing.css'
      ]
    }
  ]
})

const docsPairLlmResponse = JSON.stringify({
  skills: [
    {
      id: 1,
      name: 'docs-pair-edits',
      description: 'Edit docs files together',
      triggerDescription: 'When editing docs/a.ts or docs/b.ts',
      guidance: 'These files change together.',
      coreFiles: ['docs/a.ts', 'docs/b.ts']
    }
  ]
})

test('detectInstalledAgents returns correct agents based on hook dirs', () => {
  const root = tempDir('moatlog-agents-')

  try {
    assert.deepEqual(detectInstalledAgents(root), [])

    fs.mkdirSync(path.join(root, '.cursor', 'hooks'), { recursive: true })
    assert.deepEqual(detectInstalledAgents(root), ['cursor'])

    fs.mkdirSync(path.join(root, '.claude', 'hooks'), { recursive: true })
    assert.deepEqual(detectInstalledAgents(root), ['cursor', 'claude-code'])

    fs.rmSync(path.join(root, '.cursor', 'hooks'), { recursive: true, force: true })
    assert.deepEqual(detectInstalledAgents(root), ['claude-code'])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('updateAgentsMdContent replaces section between markers and preserves outside content', () => {
  const existing = `# Project notes

Keep this intro.

${MOATLOG_SKILLS_START}
## Behavioral Skills
### old-skill
stale
${MOATLOG_SKILLS_END}

## Footer
Do not remove.
`

  const updated = updateAgentsMdContent(existing, [sampleSkill])

  assert.match(updated, /# Project notes/)
  assert.match(updated, /## Footer/)
  assert.match(updated, /### docs-landing-visual/)
  assert.doesNotMatch(updated, /### old-skill/)
})

test('updateAgentsMdContent appends section when markers are missing', () => {
  const existing = '# Custom AGENTS\n\nExisting guidance.\n'
  const updated = updateAgentsMdContent(existing, [sampleSkill])

  assert.match(updated, /Existing guidance\./)
  assert.match(updated, /## Behavioral Skills/)
  assert.match(updated, /### docs-landing-visual/)
})

test('hasAgentsMdSkillsSection detects populated moatlog section', () => {
  const empty = `${MOATLOG_SKILLS_START}\n${MOATLOG_SKILLS_END}`
  const populated = buildAgentsMdSkillsSection([sampleSkill])

  assert.equal(hasAgentsMdSkillsSection(empty), false)
  assert.equal(hasAgentsMdSkillsSection(populated), true)
})

function minimalMoat(promptWindows: Moat['promptWindows']): Moat {
  return {
    _generated: 'test',
    _version: '1.5.0',
    scope: 'root',
    projectName: 'test',
    generatedAt: new Date().toISOString(),
    generatedFrom: 'test',
    totalEvents: 10,
    totalSessions: 3,
    dataHealth: { readsCaptured: true, windowCounts: { high: promptWindows.length, low: 0, meta: 0 } },
    hotFiles: [],
    sessions: [],
    extensionBreakdown: {},
    promptWindows,
    taskFileSets: []
  }
}

test('generateSkills returns null when LLM unavailable', async () => {
  const moat = minimalMoat([
    {
      id: 'w1',
      timestamp: '2026-06-15T00:00:00.000Z',
      sessionId: 's1',
      agent: 'cursor',
      files: ['docs/a.ts', 'docs/b.ts'],
      windowQuality: 'high',
      taskExcerpt: 'update docs files together'
    },
    {
      id: 'w2',
      timestamp: '2026-06-15T01:00:00.000Z',
      sessionId: 's2',
      agent: 'cursor',
      files: ['docs/a.ts', 'docs/b.ts'],
      windowQuality: 'high',
      taskExcerpt: 'edit docs pair again'
    },
    {
      id: 'w3',
      timestamp: '2026-06-15T02:00:00.000Z',
      sessionId: 's3',
      agent: 'cursor',
      files: ['docs/a.ts', 'docs/b.ts'],
      windowQuality: 'high',
      taskExcerpt: 'third docs pair task'
    }
  ])

  const result = await generateSkills(moat, {
    specContent: 'spec',
    llmRunner: async () => null
  })
  assert.equal(result, null)
})

test('generateAndWriteSkills writes to correct agent locations', async () => {
  const root = tempDir('moatlog-skills-write-')

  try {
    fs.mkdirSync(path.join(root, '.cursor', 'hooks'), { recursive: true })
    fs.mkdirSync(path.join(root, '.claude', 'hooks'), { recursive: true })

    const moat = minimalMoat([
      {
        id: 'w1',
        timestamp: '2026-06-15T00:00:00.000Z',
        sessionId: 's1',
        agent: 'cursor',
        files: ['docs/app/components/landing/LandingPage.tsx', 'docs/styles/marketing/landing.css'],
        windowQuality: 'high',
        taskExcerpt: 'update landing page visuals'
      },
      {
        id: 'w2',
        timestamp: '2026-06-15T01:00:00.000Z',
        sessionId: 's2',
        agent: 'cursor',
        files: ['docs/app/components/landing/LandingPage.tsx', 'docs/styles/marketing/landing.css'],
        windowQuality: 'high',
        taskExcerpt: 'make cards clickable on landing'
      },
      {
        id: 'w3',
        timestamp: '2026-06-15T02:00:00.000Z',
        sessionId: 's3',
        agent: 'cursor',
        files: ['docs/app/components/landing/LandingPage.tsx', 'docs/styles/marketing/landing.css'],
        windowQuality: 'high',
        taskExcerpt: 'replace icons on landing page'
      }
    ])

    const result = await generateAndWriteSkills(moat, root, {
      specContent: 'spec',
      llmRunner: async () => landingLlmResponse
    })

    assert.ok(result)
    assert.ok(result!.count > 0)
    assert.deepEqual(result!.agents, ['cursor', 'claude-code'])
    assert.ok(countGeneratedCursorSkills(root) > 0)
    assert.ok(fs.existsSync(path.join(root, 'AGENTS.md')))
    assert.equal(hasAgentsMdSkillsSection(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf-8')), true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('generateAndWriteSkills writes only cursor location when claude hooks missing', async () => {
  const root = tempDir('moatlog-skills-cursor-')

  try {
    fs.mkdirSync(path.join(root, '.cursor', 'hooks'), { recursive: true })

    const moat = minimalMoat([
      {
        id: 'w1',
        timestamp: '2026-06-15T00:00:00.000Z',
        sessionId: 's1',
        agent: 'cursor',
        files: ['docs/a.ts', 'docs/b.ts'],
        windowQuality: 'high',
        taskExcerpt: 'update docs files together'
      },
      {
        id: 'w2',
        timestamp: '2026-06-15T01:00:00.000Z',
        sessionId: 's2',
        agent: 'cursor',
        files: ['docs/a.ts', 'docs/b.ts'],
        windowQuality: 'high',
        taskExcerpt: 'edit docs pair again'
      },
      {
        id: 'w3',
        timestamp: '2026-06-15T02:00:00.000Z',
        sessionId: 's3',
        agent: 'cursor',
        files: ['docs/a.ts', 'docs/b.ts'],
        windowQuality: 'high',
        taskExcerpt: 'third docs pair task'
      }
    ])

    const result = await generateAndWriteSkills(moat, root, {
      specContent: 'spec',
      llmRunner: async () => docsPairLlmResponse
    })

    assert.ok(result)
    assert.ok(result!.count > 0)
    assert.deepEqual(result!.agents, ['cursor'])
    assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('writeCursorSkills preserves moatlog-skills-spec.mdc', () => {
  const root = tempDir('moatlog-skills-spec-preserve-')

  try {
    const rulesDir = path.join(root, '.cursor', 'rules')
    fs.mkdirSync(rulesDir, { recursive: true })
    fs.writeFileSync(path.join(rulesDir, 'moatlog-skills-spec.mdc'), 'spec')
    fs.writeFileSync(path.join(rulesDir, 'moatlog-old.mdc'), 'old')

    writeCursorSkills(root, [sampleSkill])

    assert.ok(fs.existsSync(path.join(rulesDir, 'moatlog-skills-spec.mdc')))
    assert.equal(fs.existsSync(path.join(rulesDir, 'moatlog-old.mdc')), false)
    assert.ok(fs.existsSync(path.join(rulesDir, 'moatlog-docs-landing-visual.mdc')))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('skillsAreStale returns true when no skill files exist', () => {
  const root = tempDir('moatlog-stale-empty-')
  const moat = minimalMoat([])

  try {
    assert.equal(skillsAreStale(root, moat), true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('skillsAreStale returns false when LLM skills are newer than moat.json', () => {
  const root = tempDir('moatlog-stale-current-')

  try {
    const rulesDir = path.join(root, '.cursor', 'rules')
    fs.mkdirSync(rulesDir, { recursive: true })
    fs.writeFileSync(
      path.join(rulesDir, 'moatlog-docs-landing-visual.mdc'),
      skillToMdc(sampleSkill)
    )

    const moat = minimalMoat([])
    moat.generatedAt = new Date(Date.now() - 60_000).toISOString()

    assert.equal(skillsAreStale(root, moat), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('shouldAutoRegenSkills returns false when no LLM available', () => {
  const root = tempDir('moatlog-regen-no-llm-')

  try {
    assert.equal(shouldAutoRegenSkills(root, minimalMoat([]), { llmAvailable: false }), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('shouldAutoRegenSkills respects LLM marker when few new sessions', () => {
  const root = tempDir('moatlog-regen-llm-')

  try {
    const rulesDir = path.join(root, '.cursor', 'rules')
    fs.mkdirSync(rulesDir, { recursive: true })
    const skillPath = path.join(rulesDir, 'moatlog-docs-landing-visual.mdc')
    fs.writeFileSync(skillPath, skillToMdc(sampleSkill))

    const now = Date.now()
    const moat = minimalMoat(
      Array.from({ length: NEW_SESSIONS_AUTO_REGEN_THRESHOLD - 1 }, (_, i) => ({
        id: `w${i}`,
        timestamp: new Date(now + (i + 1) * 1000).toISOString(),
        sessionId: `s${i}`,
        agent: 'cursor' as const,
        files: ['docs/a.ts', 'docs/b.ts'],
        windowQuality: 'high' as const,
        taskExcerpt: 'recent task'
      }))
    )

    assert.equal(shouldAutoRegenSkills(root, moat, { llmAvailable: true }), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('shouldAutoRegenSkills regenerates when more than threshold new sessions', () => {
  const root = tempDir('moatlog-regen-stale-')

  try {
    const rulesDir = path.join(root, '.cursor', 'rules')
    fs.mkdirSync(rulesDir, { recursive: true })
    const skillPath = path.join(rulesDir, 'moatlog-docs-landing-visual.mdc')
    fs.writeFileSync(skillPath, skillToMdc(sampleSkill))

    const past = Date.now() - 86_400_000
    fs.utimesSync(skillPath, past / 1000, past / 1000)

    const moat = minimalMoat(
      Array.from({ length: NEW_SESSIONS_AUTO_REGEN_THRESHOLD }, (_, i) => ({
        id: `w${i}`,
        timestamp: new Date(Date.now() - 1000 + i).toISOString(),
        sessionId: `s${i}`,
        agent: 'cursor' as const,
        files: ['docs/a.ts', 'docs/b.ts'],
        windowQuality: 'high' as const,
        taskExcerpt: 'recent task'
      }))
    )

    assert.equal(getExistingSkillFiles(root).length, 1)
    assert.match(fs.readFileSync(skillPath, 'utf-8'), new RegExp(LLM_SKILL_MARKER))
    assert.equal(shouldAutoRegenSkills(root, moat, { llmAvailable: true }), true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('skillToMdc includes LLM marker', () => {
  const content = skillToMdc(sampleSkill)
  assert.match(content, new RegExp(LLM_SKILL_MARKER))
})
