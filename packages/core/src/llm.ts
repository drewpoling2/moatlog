import { spawnSync } from 'child_process'

export type AgentCli = 'cursor' | 'claude'

export interface LlmRunOptions {
  noLlm?: boolean
  debug?: boolean
}

function debugLog(debug: boolean | undefined, message: string): void {
  if (debug) {
    console.error(`[moatlog skills] ${message}`)
  }
}

export function resolveCliPath(name: string): string | null {
  const result = spawnSync('command', ['-v', name], {
    shell: true,
    encoding: 'utf-8'
  })
  if (result.status === 0 && result.stdout?.trim()) {
    return result.stdout.trim()
  }
  return null
}

export function detectAgentCli(): AgentCli | null {
  if (resolveCliPath('cursor')) return 'cursor'
  if (resolveCliPath('claude')) return 'claude'
  return null
}

export function isLlmAvailable(): boolean {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return true
  return detectAgentCli() !== null
}

function runCursorPrompt(prompt: string, debug?: boolean): string | null {
  const result = spawnSync(
    'cursor',
    ['-p', '--output-format', 'json', prompt],
    { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
  )

  if (result.status !== 0) {
    debugLog(debug, `cursor exited ${result.status ?? 'unknown'}: ${(result.stderr ?? '').slice(0, 200)}`)
    return null
  }

  const stdout = result.stdout?.trim()
  if (!stdout) return null

  return extractCursorResponseText(stdout, debug)
}

function runClaudePrompt(prompt: string, debug?: boolean): string | null {
  const result = spawnSync('claude', ['-p', prompt], {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe']
  })

  if (result.status !== 0) {
    debugLog(debug, `claude exited ${result.status ?? 'unknown'}: ${(result.stderr ?? '').slice(0, 200)}`)
    return null
  }

  const stdout = result.stdout?.trim()
  if (!stdout) return null

  return stdout
}

function extractCursorResponseText(stdout: string, debug?: boolean): string {
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>
    if (typeof parsed.result === 'string') return parsed.result
    if (typeof parsed.text === 'string') return parsed.text
    if (typeof parsed.response === 'string') return parsed.response
    const message = parsed.message as { content?: Array<{ type?: string; text?: string }> } | undefined
    const textPart = message?.content?.find(part => part.type === 'text' && part.text)
    if (textPart?.text) return textPart.text
  } catch {
    // stdout may already be plain text / markdown JSON
  }

  debugLog(debug, 'cursor response not a known JSON envelope — using raw stdout')
  return stdout
}

/**
 * Run a prompt through the LLM cascade (cursor → claude → null).
 * Tries claude when cursor is missing or fails.
 */
export async function runWithLlm(
  prompt: string,
  options?: LlmRunOptions
): Promise<string | null> {
  if (options?.noLlm) return null

  const cursorPath = resolveCliPath('cursor')
  if (cursorPath) {
    debugLog(options?.debug, `attempting LLM synthesis via cursor`)
    debugLog(options?.debug, `cursor found at: ${cursorPath}`)
    const response = runCursorPrompt(prompt, options?.debug)
    if (response) return response
    debugLog(options?.debug, 'cursor LLM call failed — trying claude')
  } else {
    debugLog(options?.debug, 'cursor not found on PATH')
  }

  const claudePath = resolveCliPath('claude')
  if (claudePath) {
    debugLog(options?.debug, `attempting LLM synthesis via claude`)
    debugLog(options?.debug, `claude found at: ${claudePath}`)
    const response = runClaudePrompt(prompt, options?.debug)
    if (response) return response
    debugLog(options?.debug, 'claude LLM call failed')
  } else {
    debugLog(options?.debug, 'claude not found on PATH')
  }

  debugLog(options?.debug, 'no LLM CLI found — skills require Cursor or Claude Code CLI')
  return null
}

function stripMarkdownJsonFence(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()
  return raw.trim()
}

/**
 * Parse JSON from LLM response, handling markdown fences and prose wrappers.
 */
export function parseJsonFromLlmResponse<T = unknown>(raw: string): T | null {
  const candidates: string[] = []
  const fenced = stripMarkdownJsonFence(raw)
  if (fenced !== raw.trim()) {
    candidates.push(fenced)
  }
  candidates.push(raw.trim())

  for (const candidate of candidates) {
    const trimmed = candidate.trim()
    const jsonStart = trimmed.indexOf('{')
    const jsonEnd = trimmed.lastIndexOf('}')

    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      try {
        return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as T
      } catch {
        // try next candidate
      }
    }

    const arrayStart = trimmed.indexOf('[')
    const arrayEnd = trimmed.lastIndexOf(']')
    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1)) as T
      } catch {
        // try next candidate
      }
    }
  }

  return null
}
