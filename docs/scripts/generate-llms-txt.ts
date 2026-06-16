import * as fs from 'fs'
import * as path from 'path'
import { getAllDocs } from '../lib/docs'
import { extractDocDescription } from '../lib/excerpt'
import { site } from '../lib/site'
import type { DocPage } from '../lib/types'

const CATEGORY_ORDER = ['Overview', 'Guides', 'Reference', 'Documentation'] as const

const DOC_META: Record<string, { category: string; order: number }> = {
  overview: { category: 'Overview', order: 0 },
  'getting-started': { category: 'Guides', order: 0 },
  hooks: { category: 'Guides', order: 1 },
  mcp: { category: 'Reference', order: 0 },
  'moat-json': { category: 'Reference', order: 1 },
  cli: { category: 'Reference', order: 2 },
}

interface LlmsEntry {
  title: string
  slug: string
  category: string
  order: number
  description: string
  derived: boolean
}

function resolveDocsBaseUrl(): string {
  if (site.docsUrl) return site.docsUrl

  console.warn(
    'NEXT_PUBLIC_DOCS_URL is not set — using http://localhost:3000 for llms.txt links'
  )
  return 'http://localhost:3000'
}

function docUrl(baseUrl: string, slug: string): string {
  return `${baseUrl}/docs/${slug}`
}

function toLlmsEntry(doc: DocPage): LlmsEntry {
  const meta = DOC_META[doc.slug] ?? {
    category: 'Documentation',
    order: Number.MAX_SAFE_INTEGER,
  }

  const extracted = extractDocDescription(doc.content)
  const derived = extracted !== null

  return {
    title: doc.title,
    slug: doc.slug,
    category: meta.category,
    order: meta.order,
    description: extracted ?? 'No description available.',
    derived,
  }
}

function groupByCategory(entries: LlmsEntry[]): Map<string, LlmsEntry[]> {
  const groups = new Map<string, LlmsEntry[]>()

  for (const entry of entries) {
    const list = groups.get(entry.category) ?? []
    list.push(entry)
    groups.set(entry.category, list)
  }

  for (const list of groups.values()) {
    list.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  }

  return groups
}

function renderLlmsTxt(entries: LlmsEntry[], baseUrl: string): string {
  const groups = groupByCategory(entries)
  const lines: string[] = [
    '# moatlog',
    '',
    `> ${site.tagline}`,
    '',
  ]

  for (const category of CATEGORY_ORDER) {
    const docs = groups.get(category)
    if (!docs?.length) continue

    lines.push(`## ${category}`, '')

    for (const doc of docs) {
      lines.push(
        `- [${doc.title}](${docUrl(baseUrl, doc.slug)}): ${doc.description}`
      )
    }

    lines.push('')
  }

  return `${lines.join('\n').trimEnd()}\n`
}

function main(): void {
  const docs = getAllDocs()
  const entries = docs.map(toLlmsEntry)
  const missing = entries.filter((entry) => !entry.derived)

  if (missing.length > 0) {
    console.warn('Docs missing a derivable description (no opening paragraph):')
    for (const doc of missing) {
      console.warn(`  - ${doc.slug} (${doc.title})`)
    }
  }

  const baseUrl = resolveDocsBaseUrl()
  const output = renderLlmsTxt(entries, baseUrl)
  const outPath = path.join(process.cwd(), 'public', 'llms.txt')

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, output, 'utf-8')

  console.log(`Generated ${outPath} (${entries.length} docs, base URL: ${baseUrl})`)
}

main()
