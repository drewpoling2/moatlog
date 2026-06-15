import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { isGeneratedSkillFilename, SKILLS_SPEC_FILENAME } from '@moatlog/core'

function templateDir(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../templates'
  )
}

export function readSkillsSpec(projectRoot: string): string {
  const projectSpec = path.join(projectRoot, '.cursor', 'rules', 'moatlog-skills-spec.mdc')
  if (fs.existsSync(projectSpec)) {
    return fs.readFileSync(projectSpec, 'utf-8')
  }

  const templateSpec = path.join(templateDir(), 'cursor', 'rules', 'moatlog-skills-spec.mdc')
  if (fs.existsSync(templateSpec)) {
    return fs.readFileSync(templateSpec, 'utf-8')
  }

  throw new Error('moatlog-skills-spec.mdc not found — run moatlog init')
}

export { SKILLS_SPEC_FILENAME }

export function isGeneratedSkillFile(filename: string): boolean {
  return isGeneratedSkillFilename(filename)
}
