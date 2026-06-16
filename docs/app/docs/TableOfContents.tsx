'use client'

import type { TocHeading } from '@/lib/extractHeadings'
import { getDocEditUrl } from '@/lib/site'

interface TableOfContentsProps {
  slug: string
  headings: TocHeading[]
}

export function TableOfContents({ slug, headings }: TableOfContentsProps) {
  const editUrl = getDocEditUrl(slug)

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <aside className="docs-toc" aria-label="On this page">
      {headings.length > 0 ? (
        <>
          <p className="docs-toc-title">On this page</p>
          <ul className="docs-toc-list">
            {headings.map((heading) => (
              <li
                key={heading.id}
                className={`docs-toc-item docs-toc-level-${heading.level}`}
              >
                <a href={`#${heading.id}`}>{heading.text}</a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <div
        className={`docs-toc-actions${headings.length > 0 ? ' docs-toc-actions--bordered' : ''}`}
      >
        {editUrl ? (
          <a
            href={editUrl}
            className="docs-toc-action"
            target="_blank"
            rel="noopener noreferrer"
          >
            Edit this page on GitHub
          </a>
        ) : null}
        <button type="button" className="docs-toc-action" onClick={scrollToTop}>
          Scroll to top
        </button>
      </div>
    </aside>
  )
}
