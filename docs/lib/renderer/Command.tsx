'use client'

import { useState } from 'react'
import type { CommandNode } from '../types'
import type { RendererComponentProps } from './types'

export function Command({ node }: RendererComponentProps<CommandNode>) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(node.command)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div>
      <div className="doc-command">
        <pre className="doc-command-text">
          <code>{node.command}</code>
        </pre>
        <button
          type="button"
          className="doc-command-copy"
          onClick={copy}
          aria-label="Copy command"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {node.description ? (
        <p className="doc-command-note">{node.description}</p>
      ) : null}
    </div>
  )
}
