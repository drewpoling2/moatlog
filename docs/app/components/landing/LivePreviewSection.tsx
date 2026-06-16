'use client'

import { useEffect, useRef, useState } from 'react'
import type { LiveCommandScript, MoatStatusView } from '@/lib/moat-preview'
import { LiveDeviceControls } from './LiveDeviceControls'
import { LandingCtaArrow } from './LandingCtaArrow'
import { MoatStatusPanel } from './MoatStatusPanel'
import { TypingTerminal } from './TypingTerminal'

interface LivePreviewSectionProps {
  moatGithubUrl: string | null
  commands: LiveCommandScript[]
  statusView: MoatStatusView
}

export function LivePreviewSection({ moatGithubUrl, commands, statusView }: LivePreviewSectionProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [activeId, setActiveId] = useState(commands[0]?.id ?? 'status')
  const [inView, setInView] = useState(false)
  const active = commands.find(command => command.id === activeId) ?? commands[0]

  useEffect(() => {
    const node = rootRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setInView(true)
        }
      },
      { threshold: 0.35 }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  if (!active) return null

  return (
    <div ref={rootRef} className="landing-container">
      <div className="landing-split-surface landing-split--reverse">
        <div className="landing-split-grid landing-split-grid--device">
          <div className="landing-split-copy">
            <h2 className="landing-title">Your moat gets smarter the more you work. <span className="landing-muted-text">
              Moatlog tracks what matters in
              your codebase automatically, so your agent knows where to look.
            </span></h2>

            <a
              href="/docs/getting-started"
              className="landing-split-cta"
              target="_blank"
              rel="noopener noreferrer"
            >
              Get started
              <LandingCtaArrow />
            </a>
          </div>

          <div className="landing-split-visual">
            <div className="landing-replay">
              <LiveDeviceControls
                commands={commands}
                activeId={activeId}
                onSelect={setActiveId}
              />

              <div className="landing-live-surface-body">
                <div
                  id="landing-live-terminal-panel"
                  role="tabpanel"
                  aria-labelledby={`landing-live-tab-${activeId}`}
                  className="landing-live-terminal-screen"
                >
                  {active.id === 'status' ? (
                    <MoatStatusPanel key="status" status={statusView} animate={inView} />
                  ) : (
                    <TypingTerminal
                      key={active.command}
                      command={active.command}
                      lines={active.lines}
                      animate={inView}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
