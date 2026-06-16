'use client'

import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

export const INSTALL_COMMAND = 'npm install -g @moatlog/cli'

interface InstallCopyBarProps {
  command?: string
  className?: string
}

export function InstallCopyBar({ command = INSTALL_COMMAND, className }: InstallCopyBarProps) {
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
    <button
      type="button"
      className={['landing-hero-install-bar', className].filter(Boolean).join(' ')}
      onClick={copy}
      aria-label={copied ? 'Copied install command' : `Copy install command: ${command}`}
    >
      <pre className="landing-hero-install-text">
        <code>{command}</code>
      </pre>
      <span className="landing-hero-install-icon" aria-hidden="true">
        {copied ? (
          <Check className="landing-hero-install-copied-icon" strokeWidth={2} size={16} />
        ) : (
          <Copy strokeWidth={2} size={16} />
        )}
      </span>
    </button>
  )
}
