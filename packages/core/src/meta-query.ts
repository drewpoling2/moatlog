/** Detect queries about moatlog/the agent tooling rather than the codebase. */

const META_QUERY_PATTERNS: RegExp[] = [
  /\bdo you have access\b/i,
  /\b(is|are) (?:you|moat|moatlog) (?:connected|working|helping)\b/i,
  /\bis (?:this|moat|moatlog) helping\b/i,
  /\bis moat working\b/i,
  /\bwhat(?:'s| is) your (?:general )?feedback\b/i,
  /\bgeneral feedback on the product\b/i,
  /\bfeedback on the product\b/i,
  /\bcan you see it helping\b/i,
  /\blong[\s-]?term\b.*\b(?:help|helping|product|moat)\b/i,
  /\b(?:help|helping).*\blong[\s-]?term\b/i,
  /\babout (?:the )?(?:product|tool|moatlog)\b/i,
  /\bhow (?:is|are) moat(?:log)?\b/i,
  /\bmoatlog status\b/i,
  /\bget_task_context\b/i
]

/** Known meta phrasings captured from real agent sessions (regression fixtures). */
export const META_QUERY_FIXTURES: string[] = [
  'what is your general feedback on the product? can you see it helping you long term?',
  'is moat helping?',
  'do you have access to the moatlog MCP tools?',
  "what's your feedback on moatlog?",
  'is this helping you or hurting?',
  'is moat working in this project?'
]

export function isMetaQuery(task: string): boolean {
  const normalized = task.trim()
  if (normalized.length === 0) return false

  return META_QUERY_PATTERNS.some(pattern => pattern.test(normalized))
}
