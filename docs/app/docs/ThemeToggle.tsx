'use client'

import { useEffect, useState } from 'react'
import { applyTheme, resolveTheme, type Theme } from '@/lib/theme'

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    setTheme(resolveTheme())
  }, [])

  function select(next: Theme) {
    if (next === theme) return
    setTheme(next)
    applyTheme(next)
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      <button
        type="button"
        className={`theme-toggle-option${theme === 'light' ? ' theme-toggle-option--active' : ''}`}
        onClick={() => select('light')}
        aria-pressed={theme === 'light'}
      >
        light
      </button>
      <button
        type="button"
        className={`theme-toggle-option${theme === 'dark' ? ' theme-toggle-option--active' : ''}`}
        onClick={() => select('dark')}
        aria-pressed={theme === 'dark'}
      >
        dark
      </button>
    </div>
  )
}
