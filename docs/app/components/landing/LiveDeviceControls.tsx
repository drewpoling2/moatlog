'use client'

import type { LiveCommandScript } from '@/lib/moat-preview'

interface LiveDeviceControlsProps {
  commands: LiveCommandScript[]
  activeId: string
  onSelect: (id: string) => void
}

export function LiveDeviceControls({ commands, activeId, onSelect }: LiveDeviceControlsProps) {
  return (
    <div
      className="landing-live-tabs"
      role="tablist"
      aria-label="moatlog commands"
    >
      {commands.map(command => {
        const selected = activeId === command.id

        return (
          <button
            key={command.id}
            type="button"
            role="tab"
            id={`landing-live-tab-${command.id}`}
            aria-selected={selected}
            aria-controls="landing-live-terminal-panel"
            className={`landing-live-tab${selected ? ' landing-live-tab--active' : ''}`}
            onClick={() => onSelect(command.id)}
          >
            {command.id}
          </button>
        )
      })}
    </div>
  )
}
