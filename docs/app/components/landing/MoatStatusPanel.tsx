'use client'

import { useEffect, useState } from 'react'
import type { MoatStatusView } from '@/lib/moat-preview'

interface MoatStatusPanelProps {
  status: MoatStatusView
  animate?: boolean
}

const TYPE_MS = 18
const BAR_MS = 700

function TypeText({
  text,
  active,
  delay = 0,
}: {
  text: string
  active: boolean
  delay?: number
}) {
  const [count, setCount] = useState(0)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    setCount(0)
    setStarted(false)
    if (!active) return

    const startTimer = window.setTimeout(() => setStarted(true), delay)
    return () => window.clearTimeout(startTimer)
  }, [active, delay, text])

  useEffect(() => {
    if (!started || count >= text.length) return
    const timer = window.setTimeout(() => setCount(count + 1), TYPE_MS)
    return () => window.clearTimeout(timer)
  }, [started, count, text])

  const visible = active && started ? text.slice(0, count) : ''

  return (
    <span className="moat-status-type">
      <span className="moat-status-type-ruler" aria-hidden="true">
        {text}
      </span>
      <span className="moat-status-type-value">{visible}</span>
    </span>
  )
}

function StatusBar({
  percent,
  active,
  delay = 0,
}: {
  percent: number
  active: boolean
  delay?: number
}) {
  const [fill, setFill] = useState(false)

  useEffect(() => {
    setFill(false)
    if (!active) return

    const timer = window.setTimeout(() => setFill(true), delay)
    return () => window.clearTimeout(timer)
  }, [active, delay, percent])

  return (
    <div className="moat-status-bar" aria-hidden="true">
      <span
        className={`moat-status-bar-fill${fill ? ' moat-status-bar-fill--active' : ''}`}
        style={
          {
            '--fill-width': `${percent}%`,
            transitionDuration: `${BAR_MS}ms`,
          } as React.CSSProperties
        }
      />
    </div>
  )
}

export function MoatStatusPanel({ status, animate = false }: MoatStatusPanelProps) {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    setStage(0)
    if (!animate) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      setStage(4)
      return
    }

    const timers = [
      window.setTimeout(() => setStage(1), 120),
      window.setTimeout(() => setStage(2), 420),
      window.setTimeout(() => setStage(3), 900),
      window.setTimeout(() => setStage(4), 1350),
    ]
    return () => timers.forEach(window.clearTimeout)
  }, [status, animate])

  const fieldValues = [
    status.hooksActive ? 'active' : 'inactive',
    status.moatStrength,
    status.lastDistill,
    String(status.sessions),
  ]

  const footerText = `${status.eventHash} · ${status.moatHash} · session #${status.sessions}`

  return (
    <div className="moat-status">
      <div className={`moat-status-header moat-status-reveal${stage >= 1 ? ' moat-status-reveal--in' : ''}`}>
        <span className="moat-status-title">moatlog</span>
        <StatusBar percent={status.coveragePercent} active={stage >= 1} />
        <span className="moat-status-coverage">
          <TypeText text={`${status.coveragePercent}% coverage`} active={stage >= 1} delay={BAR_MS * 0.35} />
        </span>
      </div>

      <dl className={`moat-status-fields moat-status-reveal${stage >= 2 ? ' moat-status-reveal--in' : ''}`}>
        <div className="moat-status-field">
          <dt>hooks:</dt>
          <dd className={status.hooksActive ? 'moat-status-value--active' : undefined}>
            <TypeText text={fieldValues[0]} active={stage >= 2} />
          </dd>
        </div>
        <div className="moat-status-field">
          <dt>moat strength:</dt>
          <dd>
            <TypeText text={fieldValues[1]} active={stage >= 2} delay={120} />
          </dd>
        </div>
        <div className="moat-status-field">
          <dt>last distill:</dt>
          <dd>
            <TypeText text={fieldValues[2]} active={stage >= 2} delay={240} />
          </dd>
        </div>
        <div className="moat-status-field">
          <dt>sessions:</dt>
          <dd>
            <TypeText text={fieldValues[3]} active={stage >= 2} delay={360} />
          </dd>
        </div>
      </dl>

      <div className="moat-status-spacer" aria-hidden="true" />

      <div className={`moat-status-metrics moat-status-reveal${stage >= 3 ? ' moat-status-reveal--in' : ''}`}>
        {status.metrics.map((metric, index) => (
          <div key={metric.label} className="moat-status-metric">
            <span className="moat-status-metric-label">{metric.label}</span>
            <StatusBar
              percent={metric.percent}
              active={stage >= 3}
              delay={index * 90}
            />
            <span className="moat-status-metric-value">
              <TypeText
                text={`${metric.percent}%`}
                active={stage >= 3}
                delay={index * 90 + BAR_MS * 0.4}
              />
            </span>
          </div>
        ))}
      </div>

      <div className={`moat-status-footer moat-status-reveal${stage >= 4 ? ' moat-status-reveal--in' : ''}`}>
        <TypeText text={footerText} active={stage >= 4} />
      </div>
    </div>
  )
}
