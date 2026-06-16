import fs from 'fs'
import path from 'path'
import type { DocPage } from './types'

const CONTENT_DIR = path.join(process.cwd(), 'content')

/** Sidebar order — unlisted slugs sort alphabetically after these. */
const NAV_ORDER = [
  'overview',
  'getting-started',
  'hooks',
  'mcp',
  'moat-json',
  'cli',
  'merge',
]

function navSortIndex(slug: string): number {
  const index = NAV_ORDER.indexOf(slug)
  return index === -1 ? NAV_ORDER.length : index
}

export function getAllDocs(): DocPage[] {
  if (!fs.existsSync(CONTENT_DIR)) return []

  return fs
    .readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf-8')
      return JSON.parse(raw) as DocPage
    })
    .sort((a, b) => {
      const order = navSortIndex(a.slug) - navSortIndex(b.slug)
      if (order !== 0) return order
      return a.title.localeCompare(b.title)
    })
}

export function getDocBySlug(slug: string): DocPage | null {
  return getAllDocs().find((doc) => doc.slug === slug) ?? null
}

export function getAllSlugs(): string[] {
  return getAllDocs().map((doc) => doc.slug)
}

export function getAdjacentDocs(slug: string): {
  prev: DocPage | null
  next: DocPage | null
} {
  const docs = getAllDocs()
  const index = docs.findIndex((doc) => doc.slug === slug)
  if (index === -1) return { prev: null, next: null }
  return {
    prev: index > 0 ? docs[index - 1] : null,
    next: index < docs.length - 1 ? docs[index + 1] : null,
  }
}
