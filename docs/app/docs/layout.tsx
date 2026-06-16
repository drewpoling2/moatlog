import { getAllDocs } from '@/lib/docs'
import { DocsHeader } from './DocsHeader'
import { DocsFooter } from '@/app/components/SiteFooter'
import { SidebarNav } from './SidebarNav'

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const docs = getAllDocs()

  return (
    <div className="docs-app">
      <DocsHeader />
      <div className="docs-shell">
        <aside className="docs-sidebar">
          <nav aria-label="Documentation">
            <SidebarNav docs={docs.map((d) => ({ title: d.title, slug: d.slug }))} />
          </nav>
        </aside>
        {children}
      </div>
      <DocsFooter />
    </div>
  )
}
