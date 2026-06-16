'use client'

import { useState, type ReactNode } from 'react'

export interface TabsProps {
  labels: string[]
  panels: ReactNode[]
}

export function Tabs({ labels, panels }: TabsProps) {
  const [active, setActive] = useState(0)

  if (!labels.length || !panels.length) return null

  return (
    <div className="doc-tabs">
      <div className="doc-tabs-list" role="tablist">
        {labels.map((label, i) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={i === active}
            className={`doc-tab ${i === active ? 'doc-tab-active' : ''}`}
            onClick={() => setActive(i)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="doc-tab-panel" role="tabpanel">
        {panels[active]}
      </div>
    </div>
  )
}
