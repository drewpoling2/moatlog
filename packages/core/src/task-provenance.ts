import type { TaskProvenance } from './types.js'

const MIXED_TASK_PATTERNS: RegExp[] = [
  /^claude responded/i,
  /^\d{1,2}:\d{2}\s*(?:AM|PM)?\s*claude responded/i,
  /^here'?s a prompt you can hand to/i
]

const MIXED_MARKER_SEARCH = [
  'claude responded',
  "here's a prompt you can hand to",
  'here\'s a prompt you can hand to'
]

const MIXED_MARKER_MAX_OFFSET = 80

const KEYWORD_STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'your', 'you', 'are',
  'was', 'were', 'have', 'has', 'had', 'not', 'but', 'can', 'will', 'just',
  'into', 'about', 'what', 'when', 'where', 'which', 'they', 'them', 'their',
  'than', 'then', 'also', 'only', 'more', 'most', 'some', 'such', 'like',
  'how', 'why', 'all', 'any', 'our', 'out', 'its', 'it', 'is', 'in', 'on',
  'at', 'to', 'of', 'or', 'as', 'be', 'by', 'an', 'a', 'do', 'does', 'did'
])

function stripLeadingNoise(task: string): string {
  return task
    .trim()
    .replace(/^[\s\p{So}\p{Sk}\p{M}\u200B-\u200D\uFEFF]+/u, '')
    .replace(/^\d{1,2}:\d{2}\s*(?:AM|PM)?\s*/i, '')
}

function findMixedMarkerOffset(task: string): number {
  const lower = task.toLowerCase()
  let earliest = -1

  for (const marker of MIXED_MARKER_SEARCH) {
    const index = lower.indexOf(marker)
    if (index >= 0 && (earliest < 0 || index < earliest)) {
      earliest = index
    }
  }

  return earliest
}

export function detectTaskProvenance(task: string): TaskProvenance {
  const stripped = stripLeadingNoise(task)
  if (MIXED_TASK_PATTERNS.some(pattern => pattern.test(stripped))) {
    return 'mixed'
  }

  const markerOffset = findMixedMarkerOffset(task)
  return markerOffset >= 0 && markerOffset <= MIXED_MARKER_MAX_OFFSET
    ? 'mixed'
    : 'user'
}

/** Text used for keyword/path extraction — trailing paragraphs when pasted assistant content. */
export function extractMatchingTaskText(
  task: string,
  provenance: TaskProvenance
): string {
  const trimmed = task.trim()
  if (provenance === 'user') return trimmed

  const lines = trimmed.split('\n').map(line => line.trim()).filter(Boolean)
  const instructionLines = lines.filter(line => {
    if (/\bto cursor\b/i.test(line)) return true
    return /^(send|fix|add|update|implement|run|create|please)\b/i.test(line) && line.length >= 30
  })
  if (instructionLines.length > 0) {
    return instructionLines[instructionLines.length - 1]
  }

  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)

  const nonPastedParagraphs = paragraphs.filter(
    paragraph => !/^claude responded/i.test(stripLeadingNoise(paragraph))
  )

  if (nonPastedParagraphs.length > 0) {
    const last = nonPastedParagraphs[nonPastedParagraphs.length - 1]
    if (last.length >= 40) return last
    return nonPastedParagraphs.slice(-2).join('\n\n')
  }

  if (paragraphs.length > 1) {
    const last = paragraphs[paragraphs.length - 1]
    if (last.length >= 80) return last
    return paragraphs.slice(-2).join('\n\n')
  }

  const nonPastedLines = lines.filter(
    line => !/^claude responded/i.test(stripLeadingNoise(line))
  )
  if (nonPastedLines.length >= 2) {
    return nonPastedLines.slice(-2).join('\n')
  }
  if (lines.length >= 2) return lines.slice(-2).join('\n')

  return trimmed
}

export function buildTaskExcerpt(text: string, maxLength = 200): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized

  const truncated = normalized.slice(0, maxLength - 1)
  const lastSpace = truncated.lastIndexOf(' ')
  return `${lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated}…`
}

export function extractTaskKeywords(text: string, limit = 12): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9_./-]+/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2)
    .filter(word => !KEYWORD_STOP_WORDS.has(word))

  const seen = new Set<string>()
  const keywords: string[] = []

  for (const word of words) {
    if (seen.has(word)) continue
    seen.add(word)
    keywords.push(word)
    if (keywords.length >= limit) break
  }

  return keywords
}

export interface TaskProvenanceFields {
  taskProvenance: TaskProvenance
  taskExcerpt: string
  taskKeywords: string[]
}

export function enrichTaskProvenance(task: string): TaskProvenanceFields {
  const taskProvenance = detectTaskProvenance(task)
  const matchingText = extractMatchingTaskText(task, taskProvenance)
  const taskExcerpt = buildTaskExcerpt(matchingText)
  const taskKeywords = extractTaskKeywords(matchingText)

  return { taskProvenance, taskExcerpt, taskKeywords }
}
