export type SyntaxToken =
  | 'base'
  | 'comment'
  | 'string'
  | 'key'
  | 'keyword'
  | 'function'
  | 'number'
  | 'type'
  | 'variable'
  | 'operator'
  | 'punctuation'
  | 'tag'
  | 'attr'
  | 'shell-bullet'
  | 'shell-meta'

const TS_KEYWORDS = new Set([
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'import',
  'in',
  'interface',
  'let',
  'new',
  'null',
  'of',
  'return',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'type',
  'typeof',
  'undefined',
  'var',
  'void',
  'while',
  'as'
])

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function wrap(type: SyntaxToken, value: string): string {
  if (type === 'base') return escapeHtml(value)
  return `<span class="syn-${type}">${escapeHtml(value)}</span>`
}

function normalizeLanguage(language: string): string {
  return language.trim().toLowerCase()
}

function isJsonKey(code: string, stringEndIndex: number): boolean {
  for (let index = stringEndIndex; index < code.length; index++) {
    const char = code[index]
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') continue
    return char === ':'
  }
  return false
}

function highlightJson(code: string): string {
  const pattern =
    /("(?:\\.|[^"\\])*")|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],:]/g

  let result = ''
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(code)) !== null) {
    result += wrap('base', code.slice(lastIndex, match.index))

    const token = match[0]
    if (token.startsWith('"')) {
      const stringEndIndex = match.index + token.length
      result += wrap(
        isJsonKey(code, stringEndIndex) ? 'key' : 'string',
        token
      )
    } else if (/^(true|false|null)$/.test(token)) {
      result += wrap('keyword', token)
    } else if (/^-?\d/.test(token)) {
      result += wrap('number', token)
    } else {
      result += wrap('punctuation', token)
    }

    lastIndex = match.index + token.length
  }

  result += wrap('base', code.slice(lastIndex))
  return result
}

function highlightTypeScript(code: string): string {
  return code
    .split('\n')
    .map(line => highlightTypeScriptLine(line))
    .join('\n')
}

function highlightTypeScriptLine(line: string): string {
  const commentMatch = /^(\s*)(\/\/.*)$/.exec(line)
  if (commentMatch) {
    return wrap('base', commentMatch[1]) + wrap('comment', commentMatch[2])
  }

  const chunks: Array<{ type: SyntaxToken; value: string }> = []
  const pattern =
    /(\/\/.*$)|('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)|\b(?:async|await|break|case|catch|class|const|continue|default|delete|do|else|export|extends|false|finally|for|from|function|if|import|in|interface|let|new|null|of|return|switch|this|throw|true|try|type|typeof|undefined|var|void|while|as)\b|\b[A-Z][A-Za-z0-9_]*\b|\b[a-z_$][A-Za-z0-9_$]*(?=\s*\()|\b[a-z_$][A-Za-z0-9_$]*\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\]();:,=<>!&|+\-*/.?]+|\s+/g

  let match: RegExpExecArray | null
  let lastIndex = 0

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      chunks.push({ type: 'base', value: line.slice(lastIndex, match.index) })
    }

    const token = match[0]
    let type: SyntaxToken = 'base'

    if (/^\/\//.test(token)) {
      type = 'comment'
    } else if (/^['"`]/.test(token)) {
      type = 'string'
    } else if (TS_KEYWORDS.has(token)) {
      type = 'keyword'
    } else if (/^[A-Z]/.test(token)) {
      type = 'type'
    } else if (/^[a-z_$]/.test(token) && line[match.index + token.length] === '(') {
      type = 'function'
    } else if (/^[a-z_$]/.test(token)) {
      type = 'variable'
    } else if (/^-?\d/.test(token)) {
      type = 'number'
    } else if (/^[{}[\]();:,]$/.test(token)) {
      type = 'punctuation'
    } else if (/^[=<>!&|+\-*/.?]+$/.test(token)) {
      type = 'operator'
    }

    chunks.push({ type, value: token })
    lastIndex = match.index + token.length
  }

  if (lastIndex < line.length) {
    chunks.push({ type: 'base', value: line.slice(lastIndex) })
  }

  return chunks.map(chunk => wrap(chunk.type, chunk.value)).join('')
}

function highlightShellLine(line: string): string {
  const promptMatch = /^(\$\s+)(.+)$/.exec(line)
  if (promptMatch) {
    return wrap('operator', promptMatch[1]) + wrap('function', promptMatch[2])
  }

  const labelMatch = /^([a-z][a-z\s]+:\s+)(.+)$/.exec(line)
  if (labelMatch) {
    return wrap('variable', labelMatch[1]) + wrap('string', labelMatch[2])
  }

  if (line.startsWith('●')) {
    const statusMatch = /^(●\s+)([^(]+)(\s*\([^)]*\))?$/.exec(line)
    if (statusMatch) {
      return (
        wrap('shell-bullet', statusMatch[1]) +
        wrap('string', statusMatch[2]) +
        (statusMatch[3] ? wrap('shell-meta', statusMatch[3]) : '')
      )
    }
  }

  return wrap('base', line)
}

function highlightShell(code: string): string {
  return code.split('\n').map(highlightShellLine).join('\n')
}

export function highlightCode(code: string, language: string): string {
  const lang = normalizeLanguage(language)

  if (lang === 'json' || lang === 'jsonl') {
    return highlightJson(code)
  }

  if (lang === 'shell' || lang === 'bash' || lang === 'sh' || lang === 'terminal') {
    return highlightShell(code)
  }

  if (
    lang === 'typescript' ||
    lang === 'ts' ||
    lang === 'javascript' ||
    lang === 'js' ||
    lang === 'tsx' ||
    lang === 'jsx'
  ) {
    return highlightTypeScript(code)
  }

  return wrap('base', code)
}

export function isShellLanguage(language: string): boolean {
  const lang = normalizeLanguage(language)
  return lang === 'shell' || lang === 'bash' || lang === 'sh' || lang === 'terminal'
}
