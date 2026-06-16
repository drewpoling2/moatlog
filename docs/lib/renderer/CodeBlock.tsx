'use client'

import { useMemo, useState } from 'react'
import type { CodeNode } from '../types'
import type { RendererComponentProps } from './types'
import { highlightCode, isShellLanguage } from '../syntax-highlight'
import { Button } from '@/app/docs/Button'

export function CodeBlock({ node }: RendererComponentProps<CodeNode>) {
  const [copied, setCopied] = useState(false)
  const language = node.language ?? 'text'
  const highlighted = useMemo(
    () => highlightCode(node.code, language),
    [node.code, language]
  )
  const shellBlock = isShellLanguage(language)

  async function copy() {
    try {
      await navigator.clipboard.writeText(node.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <figure className={`doc-code${shellBlock ? ' doc-code--shell' : ''}`}>
      <div className="doc-code-header">
        <span className="doc-code-lang">{language}</span>
        <Button
          variant="ghost"
          size="sm"
          className="doc-code-copy btn--lowercase"
          onClick={copy}
          aria-label="Copy code"
        >
          {copied ? 'copied' : 'copy'}
        </Button>
      </div>
      <div className="doc-code-body">
        <pre>
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        </pre>
      </div>
    </figure>
  )
}
