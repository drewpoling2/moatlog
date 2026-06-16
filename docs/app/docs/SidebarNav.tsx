'use client'

import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type DocNavItem = { title: string; slug: string }

export function SidebarNav({
  docs,
  variant = 'sidebar',
  onNavigate,
}: {
  docs: DocNavItem[]
  variant?: 'sidebar' | 'mobile'
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const listClassName = variant === 'mobile' ? 'site-mobile-nav-docs-list' : 'docs-nav'

  return (
    <ul className={listClassName}>
      {docs.map(doc => {
        const href = `/docs/${doc.slug}`
        const active = pathname === href
        return (
          <li key={doc.slug}>
            <Link
              href={href}
              className={active ? 'active' : undefined}
              onClick={onNavigate}
            >
              <span className="docs-nav-marker" aria-hidden="true">
                <ChevronRight strokeWidth={2} size={14} />
              </span>
              {doc.title}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
