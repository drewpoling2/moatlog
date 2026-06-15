import * as fs from 'fs'
import * as path from 'path'

export const DEFAULT_MOATLOGIGNORE_PATTERNS = [
  '.env*',
  '*.pem',
  '*.key',
  'id_rsa*',
  '*credentials*',
  '.npmrc'
] as const

function escapeRegexChar(char: string): string {
  return /[\\^$+?.()|{}[\]]/.test(char) ? `\\${char}` : char
}

/** Convert a gitignore-style glob to a RegExp (no leading anchor on path segments). */
export function globToRegExp(glob: string): RegExp {
  let regex = '^'
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]

    if (char === '*') {
      if (glob[i + 1] === '*') {
        regex += '.*'
        i++
      } else {
        regex += '[^/]*'
      }
      continue
    }

    if (char === '?') {
      regex += '[^/]'
      continue
    }

    regex += escapeRegexChar(char)
  }

  regex += '$'
  return new RegExp(regex)
}

export function matchesMoatlogIgnorePattern(
  relativePath: string,
  pattern: string
): boolean {
  const normalized = relativePath.replace(/\\/g, '/')
  const basename = normalized.split('/').pop() ?? normalized
  const regex = globToRegExp(pattern)

  if (pattern.includes('/')) {
    return regex.test(normalized)
  }

  return regex.test(basename) || regex.test(normalized)
}

export function readMoatlogignorePatterns(projectRoot: string): string[] {
  const patterns: string[] = [...DEFAULT_MOATLOGIGNORE_PATTERNS]
  const ignorePath = path.join(projectRoot, '.moatlogignore')

  if (!fs.existsSync(ignorePath)) {
    return patterns
  }

  const lines = fs.readFileSync(ignorePath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.replace(/#.*$/, '').trim()
    if (!trimmed) continue
    patterns.push(trimmed)
  }

  return patterns
}

export function isMoatlogIgnoredPath(
  relativePath: string,
  projectRoot: string
): boolean {
  const patterns = readMoatlogignorePatterns(projectRoot)
  return patterns.some(pattern =>
    matchesMoatlogIgnorePattern(relativePath, pattern)
  )
}
