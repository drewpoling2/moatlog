import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getAdjacentDocs, getAllSlugs, getDocBySlug } from '@/lib/docs'
import { DocPagination } from '../DocPagination'
import { extractHeadings } from '@/lib/extractHeadings'
import { StructuredRenderer } from '@/lib/renderer/StructuredRenderer'
import { componentMap } from '@/lib/renderer/components'
import { TableOfContents } from '../TableOfContents'

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const doc = getDocBySlug(slug)

  if (!doc) {
    return {}
  }

  return {
    title: doc.title,
    description: doc.description ?? `${doc.title} — moatlog documentation`,
  }
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const doc = getDocBySlug(slug)

  if (!doc) notFound()

  const headings = extractHeadings(doc.content)
  const { prev, next } = getAdjacentDocs(slug)

  return (
    <>
      <main className="docs-main">
        <article>
          <StructuredRenderer nodes={doc.content} components={componentMap} />
          <DocPagination
            prev={prev ? { slug: prev.slug, title: prev.title } : null}
            next={next ? { slug: next.slug, title: next.title } : null}
          />
        </article>
      </main>
      <TableOfContents slug={slug} headings={headings} />
    </>
  )
}
