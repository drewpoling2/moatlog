'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

interface TypingTerminalProps {
  command: string
  lines: string[]
  animate?: boolean
}

const CHAR_MS = 16
const LINE_MS = 60

export function TypingTerminal({ command, lines, animate = false }: TypingTerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const script = useMemo(() => [`$ ${command}`, ...lines], [command, lines])
  const [lineIndex, setLineIndex] = useState(0)
  const [charIndex, setCharIndex] = useState(0)
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    setLineIndex(0)
    setCharIndex(0)
    setFinished(false)
  }, [command, lines])

  useEffect(() => {
    if (!animate) return

    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (media.matches) {
      setLineIndex(script.length - 1)
      setCharIndex(script[script.length - 1]?.length ?? 0)
      setFinished(true)
    }
  }, [animate, script])

  useEffect(() => {
    if (!animate || finished) return

    const currentLine = script[lineIndex]
    if (currentLine === undefined) {
      setFinished(true)
      return
    }

    if (currentLine.length === 0) {
      if (lineIndex < script.length - 1) {
        const timer = window.setTimeout(() => {
          setLineIndex(lineIndex + 1)
          setCharIndex(0)
        }, LINE_MS)
        return () => window.clearTimeout(timer)
      }
      setFinished(true)
      return
    }

    if (charIndex < currentLine.length) {
      const timer = window.setTimeout(() => setCharIndex(charIndex + 1), CHAR_MS)
      return () => window.clearTimeout(timer)
    }

    if (lineIndex < script.length - 1) {
      const timer = window.setTimeout(() => {
        setLineIndex(lineIndex + 1)
        setCharIndex(0)
      }, LINE_MS)
      return () => window.clearTimeout(timer)
    }

    setFinished(true)
  }, [animate, charIndex, finished, lineIndex, script])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    if (element.scrollHeight > element.clientHeight + 1) {
      element.scrollTop = element.scrollHeight
    }
  }, [lineIndex, charIndex, finished, command])

  const visible = script.slice(0, lineIndex)
  const activeLine = script[lineIndex]?.slice(0, charIndex) ?? ''

  return (
    <div ref={scrollRef} className="landing-live-terminal-scroll">
      <pre className="landing-live-terminal-output" aria-live="polite">
        {visible.map((line, index) => (
          <span key={`${command}-line-${index}`} className="landing-live-terminal-line">
            {line}
            {'\n'}
          </span>
        ))}
        <span className="landing-live-terminal-line landing-live-terminal-line--active">
          {activeLine}
          {!finished ? <span className="landing-live-terminal-cursor" aria-hidden="true" /> : null}
        </span>
      </pre>
    </div>
  )
}
