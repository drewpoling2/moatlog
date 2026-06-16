'use client'

import { Menu, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { SidebarNav, type DocNavItem } from '@/app/docs/SidebarNav'
import { Button } from '@/app/docs/Button'
import type { HeaderNavLink } from '@/lib/site'

interface MobileNavMenuProps {
  links: HeaderNavLink[]
  docLinks?: DocNavItem[]
}

export function MobileNavMenu({ links, docLinks }: MobileNavMenuProps) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef(true)

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu({ restoreFocus: true })
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      if (restoreFocusRef.current) {
        toggleRef.current?.focus({ preventScroll: true })
      }
      restoreFocusRef.current = true
    }
  }, [open])

  function closeMenu({ restoreFocus = false }: { restoreFocus?: boolean } = {}) {
    restoreFocusRef.current = restoreFocus
    setOpen(false)
  }

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="site-mobile-nav-toggle"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Open menu"
        onClick={() => setOpen(true)}
      >
        <Menu size={22} strokeWidth={2} aria-hidden="true" />
      </button>

      {open ? (
        <div
          id={menuId}
          className="site-mobile-nav"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div className="site-mobile-nav-bar">
            <button
              ref={closeRef}
              type="button"
              className="site-mobile-nav-close"
              aria-label="Close menu"
              onClick={() => closeMenu({ restoreFocus: true })}
            >
              <X size={22} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          <div className="site-mobile-nav-body">
            <nav className="site-mobile-nav-links" aria-label="Site">
              {links.map(link =>
                link.external ? (
                  <a
                    key={link.href}
                    href={link.href}
                    className="site-mobile-nav-link"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => closeMenu()}
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="site-mobile-nav-link"
                    onClick={() => closeMenu()}
                  >
                    {link.label}
                  </Link>
                )
              )}

              <div onClick={() => closeMenu()}>
                <Button
                  href="/docs/getting-started"
                  variant="outline"
                  className="site-mobile-nav-cta"
                >
                  Get Started
                </Button>
              </div>
            </nav>

            {docLinks?.length ? (
              <nav className="site-mobile-nav-docs" aria-label="Documentation">
                <p className="site-mobile-nav-docs-label">Documentation</p>
                <SidebarNav docs={docLinks} variant="mobile" onNavigate={() => closeMenu()} />
              </nav>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
