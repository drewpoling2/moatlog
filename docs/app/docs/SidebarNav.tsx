'use client'

import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function SidebarNav({
  docs,
}: {
  docs: { title: string; slug: string }[]
}) {
  const pathname = usePathname()

  return (
    <ul className="docs-nav">
      {docs.map((doc) => {
        const href = `/docs/${doc.slug}`
        const active = pathname === href
        return (
          <li key={doc.slug}>
            <Link href={href} className={active ? 'active' : undefined}>
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
