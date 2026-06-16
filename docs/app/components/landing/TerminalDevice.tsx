import type { ReactNode } from 'react'

interface TerminalDeviceProps {
  label?: string
  badge?: ReactNode
  children: ReactNode
  className?: string
}

export function TerminalDevice({
  label = 'JSON',
  badge,
  children,
  className
}: TerminalDeviceProps) {
  return (
    <div className={`doc-code landing-terminal ${className ?? ''}`.trim()}>
      <div className="doc-code-header">
        <span className="doc-code-lang">{label}</span>
        {badge}
      </div>
      <div className="doc-code-screen">{children}</div>
    </div>
  )
}
