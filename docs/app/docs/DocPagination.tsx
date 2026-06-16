import Link from 'next/link'

interface DocPaginationProps {
  prev: { slug: string; title: string } | null
  next: { slug: string; title: string } | null
}

export function DocPagination({ prev, next }: DocPaginationProps) {
  if (!prev && !next) return null

  return (
    <nav className="doc-pagination" aria-label="Page navigation">
      {prev ? (
        <Link href={`/docs/${prev.slug}`} className="doc-pagination-link doc-pagination-prev">
          <span className="doc-pagination-label">Previous</span>
          <span className="doc-pagination-title">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={`/docs/${next.slug}`} className="doc-pagination-link doc-pagination-next">
          <span className="doc-pagination-label">Next</span>
          <span className="doc-pagination-title">{next.title}</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}
