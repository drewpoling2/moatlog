'use client'

import { useState } from 'react'

interface CopyCommandProps {
  command: string
  note?: string
  className?: string
}

export function CopyCommand({ command, note, className }: CopyCommandProps) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className={className}>
      <div className="doc-command landing-install">
        <pre className="doc-command-text">
          <code>{command}</code>
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
      {note ? <p className="doc-command-note">{note}</p> : null}
    </div>
  )
}
