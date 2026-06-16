'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const EVENT_LINES = [
  { action: 'read', target: 'packages/core/src/distiller.ts' },
  { action: 'read', target: 'packages/core/src/prompt-windows.ts' },
  { action: 'read', target: 'packages/core/src/task-context.ts' },
  { action: 'prompt', target: '"wire agent_stop to close prompt windows"' },
  { action: 'write', target: 'packages/core/src/distiller.ts' }
] as const

const AGENT_LINES = [
  {
    kind: 'status' as const,
    text: 'Implementing window attribution fix'
  },
  {
    kind: 'action' as const,
    verb: 'read',
    file: 'packages/core/src/distiller.ts',
    note: 'agent_stop handler calls closeActiveWindow()',
    eventIndex: 0
  },
  {
    kind: 'action' as const,
    verb: 'read',
    file: 'packages/core/src/prompt-windows.ts',
    note: 'windows close on agent_stop — not the next prompt_start',
    eventIndex: 1
  },
  {
    kind: 'action' as const,
    verb: 'read',
    file: 'packages/core/src/task-context.ts',
    note: 'TaskContext.close() wired into distill pipeline',
    eventIndex: 2
  },
  {
    kind: 'action' as const,
    verb: 'edit',
    file: 'packages/core/src/distiller.ts',
    note: 'route agent_stop through closeActiveWindow()',
    eventIndex: 4
  },
  {
    kind: 'action' as const,
    verb: 'edit',
    file: 'packages/core/src/prompt-windows.ts',
    note: 'close window when agent_stop fires'
  }
] as const

const PROMPT_EVENT_INDEX = 3

type EventsView = 'events' | 'clearing' | 'summary'

const SUMMARY_LINES = [
  { kind: 'key' as const, text: 'hotFiles:' },
  {
    kind: 'row' as const,
    path: 'packages/core/src/distiller.ts',
    delta: 'writeCount 16'
  },
  {
    kind: 'row' as const,
    path: 'packages/core/src/task-context.ts',
    delta: 'writeCount 9'
  },
  { kind: 'key-spaced' as const, text: 'promptWindows:' },
  { kind: 'task' as const, text: '"wire agent_stop to close prompt windows"' },
  { kind: 'detail' as const, text: 'files: distiller.ts, prompt-windows.ts, task-context.ts' },
  { kind: 'detail' as const, text: 'quality: high · agent: cursor' }
]

type ReplayVisibility = {
  status: boolean
  thinking: boolean
  agentActions: Set<number>
  agentNotes: Set<number>
  events: Set<number>
}

const EMPTY_VISIBILITY: ReplayVisibility = {
  status: false,
  thinking: false,
  agentActions: new Set(),
  agentNotes: new Set(),
  events: new Set()
}

const FULL_VISIBILITY: ReplayVisibility = {
  status: true,
  thinking: false,
  agentActions: new Set(AGENT_LINES.map((_, index) => index).filter(index => AGENT_LINES[index].kind === 'action')),
  agentNotes: new Set(AGENT_LINES.map((_, index) => index).filter(index => AGENT_LINES[index].kind === 'action')),
  events: new Set(EVENT_LINES.map((_, index) => index))
}

type SequenceOp =
  | { type: 'status' }
  | { type: 'agent-action'; index: number }
  | { type: 'agent-note'; index: number }
  | { type: 'thinking' }
  | { type: 'event'; index: number }

const SEQUENCE: Array<{ op: SequenceOp; delay: number }> = [
  { op: { type: 'status' }, delay: 0 },
  { op: { type: 'agent-action', index: 1 }, delay: 1500 },
  { op: { type: 'agent-note', index: 1 }, delay: 2100 },
  { op: { type: 'event', index: 0 }, delay: 3300 },
  { op: { type: 'agent-action', index: 2 }, delay: 4000 },
  { op: { type: 'agent-note', index: 2 }, delay: 4600 },
  { op: { type: 'event', index: 1 }, delay: 5800 },
  { op: { type: 'agent-action', index: 3 }, delay: 6500 },
  { op: { type: 'agent-note', index: 3 }, delay: 7100 },
  { op: { type: 'event', index: 2 }, delay: 8300 },
  { op: { type: 'thinking' }, delay: 9000 },
  { op: { type: 'event', index: PROMPT_EVENT_INDEX }, delay: 10200 },
  { op: { type: 'agent-action', index: 4 }, delay: 11000 },
  { op: { type: 'agent-note', index: 4 }, delay: 11600 },
  { op: { type: 'event', index: 4 }, delay: 12800 },
  { op: { type: 'agent-action', index: 5 }, delay: 13500 },
  { op: { type: 'agent-note', index: 5 }, delay: 14100 }
]

const TRANSFORM_PAUSE_MS = 1000
const CLEAR_DURATION_MS = 700
const EMPTY_PAUSE_MS = 450
const SUMMARY_LINE_INTERVAL_MS = 300
const SUMMARY_HOLD_MS = 3500
const LOOP_DELAY_MS = 2000
const SEQUENCE_COMPLETE_MS = 14100
const CLEAR_START_MS = SEQUENCE_COMPLETE_MS + TRANSFORM_PAUSE_MS
const SUMMARY_START_MS = CLEAR_START_MS + CLEAR_DURATION_MS + EMPTY_PAUSE_MS
const SUMMARY_COMPLETE_MS = SUMMARY_START_MS + SUMMARY_LINES.length * SUMMARY_LINE_INTERVAL_MS + 400
const LOOP_RESTART_MS = SUMMARY_COMPLETE_MS + SUMMARY_HOLD_MS

function cloneVisibility(visibility: ReplayVisibility): ReplayVisibility {
  return {
    status: visibility.status,
    thinking: visibility.thinking,
    agentActions: new Set(visibility.agentActions),
    agentNotes: new Set(visibility.agentNotes),
    events: new Set(visibility.events)
  }
}

function applyOp(visibility: ReplayVisibility, op: SequenceOp): ReplayVisibility {
  const next = cloneVisibility(visibility)

  switch (op.type) {
    case 'status':
      next.status = true
      break
    case 'agent-action':
      next.agentActions.add(op.index)
      next.thinking = false
      break
    case 'agent-note':
      next.agentNotes.add(op.index)
      break
    case 'thinking':
      next.thinking = true
      break
    case 'event':
      next.events.add(op.index)
      next.thinking = false
      break
  }

  return next
}

function ConnectorIcon() {
  return (
    <svg
      className="landing-replay-connector-icon"
      width="10"
      height="12"
      viewBox="0 0 10 12"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M10 6 0 0v12L10 6Z" />
    </svg>
  )
}

function MoatSummary({
  lineCount,
  showCursor
}: {
  lineCount: number
  showCursor: boolean
}) {
  const lines = SUMMARY_LINES.slice(0, lineCount)

  return (
    <div className="landing-replay-summary">
      {lines.map((line, index) => {
        const isLast = index === lines.length - 1

        if (line.kind === 'key') {
          return (
            <p key={line.text} className="landing-replay-summary-key landing-replay-reveal">
              {line.text}
              {showCursor && isLast ? <span className="landing-replay-events-cursor" aria-hidden="true" /> : null}
            </p>
          )
        }

        if (line.kind === 'key-spaced') {
          return (
            <p
              key={line.text}
              className="landing-replay-summary-key landing-replay-summary-key--spaced landing-replay-reveal"
            >
              {line.text}
              {showCursor && isLast ? <span className="landing-replay-events-cursor" aria-hidden="true" /> : null}
            </p>
          )
        }

        if (line.kind === 'row') {
          return (
            <div key={line.path} className="landing-replay-summary-row landing-replay-reveal">
              <span className="landing-replay-summary-path">{line.path}</span>
              <span className="landing-replay-summary-delta">{line.delta}</span>
              {showCursor && isLast ? <span className="landing-replay-events-cursor" aria-hidden="true" /> : null}
            </div>
          )
        }

        if (line.kind === 'task') {
          return (
            <p key={line.text} className="landing-replay-summary-task landing-replay-reveal">
              {line.text}
              {showCursor && isLast ? <span className="landing-replay-events-cursor" aria-hidden="true" /> : null}
            </p>
          )
        }

        return (
          <p key={line.text} className="landing-replay-summary-detail landing-replay-reveal">
            {line.text}
            {showCursor && isLast ? <span className="landing-replay-events-cursor" aria-hidden="true" /> : null}
          </p>
        )
      })}
    </div>
  )
}

export function SessionReplay() {
  const rootRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const eventsScrollRef = useRef<HTMLDivElement>(null)
  const agentScrollRef = useRef<HTMLDivElement>(null)
  const eventRefs = useRef<Array<HTMLLIElement | null>>([])
  const agentRefs = useRef<Array<HTMLElement | null>>([])

  const [reducedMotion, setReducedMotion] = useState(false)
  const [inView, setInView] = useState(false)
  const [visibility, setVisibility] = useState<ReplayVisibility>(EMPTY_VISIBILITY)
  const [eventsView, setEventsView] = useState<EventsView>('events')
  const [summaryLineCount, setSummaryLineCount] = useState(0)
  const [connectorTop, setConnectorTop] = useState<number | null>(null)
  const [runId, setRunId] = useState(0)

  const syncScrollFade = useCallback((element: HTMLDivElement | null) => {
    if (!element) return
    element.classList.toggle('landing-replay-scroll--fade-top', element.scrollTop > 4)
  }, [])

  const syncAllScrollFades = useCallback(() => {
    syncScrollFade(eventsScrollRef.current)
    syncScrollFade(agentScrollRef.current)
  }, [syncScrollFade])

  const restart = useCallback(() => {
    if (reducedMotion) {
      setVisibility(FULL_VISIBILITY)
      setEventsView('summary')
      setSummaryLineCount(SUMMARY_LINES.length)
      return
    }

    setVisibility(EMPTY_VISIBILITY)
    setEventsView('events')
    setSummaryLineCount(0)
    setConnectorTop(null)
    eventsScrollRef.current?.scrollTo({ top: 0 })
    agentScrollRef.current?.scrollTo({ top: 0 })
    setRunId(id => id + 1)
  }, [reducedMotion])

  const scrollPanelsToBottom = useCallback(() => {
    const behavior: ScrollBehavior = reducedMotion ? 'auto' : 'smooth'

    for (const element of [eventsScrollRef.current, agentScrollRef.current]) {
      if (!element) continue
      element.scrollTo({ top: element.scrollHeight, behavior })
    }
  }, [reducedMotion])

  useEffect(() => {
    const eventsEl = eventsScrollRef.current
    const agentEl = agentScrollRef.current

    const onScroll = () => syncAllScrollFades()

    eventsEl?.addEventListener('scroll', onScroll, { passive: true })
    agentEl?.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      eventsEl?.removeEventListener('scroll', onScroll)
      agentEl?.removeEventListener('scroll', onScroll)
    }
  }, [syncAllScrollFades])

  useEffect(() => {
    const behavior: ScrollBehavior = reducedMotion ? 'auto' : 'smooth'

    if (eventsView === 'clearing') {
      eventsScrollRef.current?.scrollTo({ top: 0, behavior })
      syncAllScrollFades()
      return
    }

    if (eventsView === 'summary') {
      eventsScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })
      syncAllScrollFades()
      return
    }

    scrollPanelsToBottom()
    syncAllScrollFades()
    const timeout = window.setTimeout(() => {
      scrollPanelsToBottom()
      syncAllScrollFades()
    }, 360)
    return () => window.clearTimeout(timeout)
  }, [
    visibility,
    eventsView,
    summaryLineCount,
    scrollPanelsToBottom,
    syncAllScrollFades,
    reducedMotion
  ])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')

    const syncMotion = () => {
      const prefersReduced = media.matches
      setReducedMotion(prefersReduced)
      if (prefersReduced) {
        setVisibility(FULL_VISIBILITY)
        setEventsView('summary')
        setSummaryLineCount(SUMMARY_LINES.length)
      }
    }

    syncMotion()
    media.addEventListener('change', syncMotion)
    return () => media.removeEventListener('change', syncMotion)
  }, [])

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

  useEffect(() => {
    if (reducedMotion || !inView) return

    setVisibility(EMPTY_VISIBILITY)
    setEventsView('events')
    setSummaryLineCount(0)
    setConnectorTop(null)
    eventsScrollRef.current?.scrollTo({ top: 0 })
    agentScrollRef.current?.scrollTo({ top: 0 })

    const timeouts: Array<ReturnType<typeof setTimeout>> = []

    SEQUENCE.forEach(({ op, delay }) => {
      timeouts.push(
        setTimeout(() => {
          setVisibility(current => applyOp(current, op))
        }, delay)
      )
    })

    timeouts.push(setTimeout(() => setEventsView('clearing'), CLEAR_START_MS))
    timeouts.push(
      setTimeout(() => {
        setEventsView('summary')
        setSummaryLineCount(0)
        eventsScrollRef.current?.scrollTo({ top: 0 })
      }, CLEAR_START_MS + CLEAR_DURATION_MS)
    )

    SUMMARY_LINES.forEach((_, index) => {
      timeouts.push(
        setTimeout(() => {
          setSummaryLineCount(index + 1)
        }, SUMMARY_START_MS + index * SUMMARY_LINE_INTERVAL_MS)
      )
    })

    timeouts.push(
      setTimeout(() => {
        setRunId(id => id + 1)
      }, LOOP_RESTART_MS + LOOP_DELAY_MS)
    )

    return () => {
      timeouts.forEach(timeout => clearTimeout(timeout))
    }
  }, [inView, reducedMotion, runId])

  const lastEventIndex = EVENT_LINES.reduce<number | null>((latest, _, index) => {
    return visibility.events.has(index) ? index : latest
  }, null)

  const lastAgentIndex = AGENT_LINES.reduce<number | null>((latest, line, index) => {
    if (line.kind !== 'action') return latest
    if (!visibility.agentActions.has(index)) return latest
    return index
  }, null)

  useEffect(() => {
    if (reducedMotion || eventsView !== 'events') return

    const body = bodyRef.current
    if (!body) return

    const measure = () => {
      const bodyRect = body.getBoundingClientRect()
      const points: number[] = []

      if (lastEventIndex !== null) {
        const eventEl = eventRefs.current[lastEventIndex]
        if (eventEl) {
          const rect = eventEl.getBoundingClientRect()
          points.push(rect.top + rect.height / 2 - bodyRect.top)
        }
      }

      if (lastAgentIndex !== null) {
        const agentEl = agentRefs.current[lastAgentIndex]
        if (agentEl) {
          const rect = agentEl.getBoundingClientRect()
          points.push(rect.top + rect.height / 2 - bodyRect.top)
        }
      }

      if (visibility.thinking) {
        const thinkingEl = agentRefs.current[3]
        if (thinkingEl) {
          const rect = thinkingEl.getBoundingClientRect()
          points.push(rect.bottom - bodyRect.top + 12)
        }
      }

      if (points.length === 0) {
        setConnectorTop(null)
        return
      }

      const average = points.reduce((sum, value) => sum + value, 0) / points.length
      setConnectorTop(average)
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(body)
    window.addEventListener('resize', measure)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [visibility, lastEventIndex, lastAgentIndex, reducedMotion, eventsView])

  const showConnector = connectorTop !== null && !reducedMotion && eventsView === 'events'
  const showEventsLayer = eventsView === 'events' || eventsView === 'clearing'
  const showEventsIdle = eventsView === 'events' && visibility.events.size === 0
  const showSummary = eventsView === 'summary' && summaryLineCount > 0
  const summaryWriting = eventsView === 'summary' && summaryLineCount < SUMMARY_LINES.length

  return (
    <div className="landing-replay" ref={rootRef}>
      <div className="landing-replay-body" ref={bodyRef}>
        <div className="landing-replay-panel landing-replay-panel--events">


          <div className="landing-replay-panel-screen landing-replay-events-screen landing-live-terminal-screen">
            <div ref={eventsScrollRef} className="landing-replay-scroll">
              <div className="landing-replay-events-stack">
                {showEventsIdle ? (
                  <p className="landing-replay-events-idle">
                    Listening for events...
                    <span className="landing-replay-events-cursor" aria-hidden="true" />
                  </p>
                ) : null}

                {showEventsLayer && !showEventsIdle ? (
                  <ul
                    className={`landing-replay-events-list landing-replay-events-layer${eventsView === 'clearing' ? ' landing-replay-events-layer--exit' : ''}`}
                  >
                    {EVENT_LINES.map((line, index) => {
                      const visible = visibility.events.has(index)
                      if (!visible) return null

                      return (
                        <li
                          key={`${line.action}-${line.target}`}
                          ref={element => {
                            eventRefs.current[index] = element
                          }}
                          className="landing-replay-event landing-replay-reveal"
                        >
                          <span className="landing-replay-event-action">{line.action}</span>
                          <span className="landing-replay-event-target">{line.target}</span>
                          {eventsView === 'events' && index === lastEventIndex ? (
                            <span className="landing-replay-events-cursor" aria-hidden="true" />
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                ) : null}

                {showSummary ? (
                  <MoatSummary lineCount={summaryLineCount} showCursor={summaryWriting} />
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {showConnector ? (
          <div
            className="landing-replay-connector"
            style={{ top: `${connectorTop}px` }}
            aria-hidden="true"
          >
            <ConnectorIcon />
          </div>
        ) : null}

        <div className="landing-replay-panel landing-replay-panel--agent">


          <div className="landing-replay-panel-screen landing-replay-agent-screen">
            <div ref={agentScrollRef} className="landing-replay-scroll landing-replay-agent-content">
              {AGENT_LINES.map((line, index) => {
                if (line.kind === 'status') {
                  if (!visibility.status) return null

                  return (
                    <p key={line.text} className="landing-replay-agent-status landing-replay-reveal">
                      {line.text}
                    </p>
                  )
                }

                const actionVisible = visibility.agentActions.has(index)
                const noteVisible = visibility.agentNotes.has(index)
                if (!actionVisible && !noteVisible) return null

                return (
                  <div
                    key={`${line.verb}-${line.file}`}
                    ref={element => {
                      agentRefs.current[index] = element
                    }}
                    className="landing-replay-agent-step"
                  >
                    {actionVisible ? (
                      <p className="landing-replay-agent-action landing-replay-reveal">
                        <span className="landing-replay-agent-prompt">&gt;</span>{' '}
                        <code className="landing-replay-agent-verb">{line.verb}</code>{' '}
                        {line.file}
                      </p>
                    ) : null}
                    {noteVisible ? (
                      <p className="landing-replay-agent-note landing-replay-reveal">
                        {line.note}
                      </p>
                    ) : null}
                  </div>
                )
              })}

              {visibility.thinking ? (
                <p className="landing-replay-agent-thinking landing-replay-reveal">···</p>
              ) : null}
            </div>

            <button
              type="button"
              className="landing-replay-footer"
              onClick={restart}
              aria-label="Replay session"
            >
              <span aria-hidden="true">↺</span> replay
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
