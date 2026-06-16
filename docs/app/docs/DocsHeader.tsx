import Link from 'next/link'
import { MobileNavMenu } from '@/app/components/MobileNavMenu'
import { SiteLogo } from '@/app/components/SiteLogo'
import { getAllDocs } from '@/lib/docs'
import { getHeaderNavLinks } from '@/lib/site'
import { Button } from '@/app/docs/Button'

export function DocsHeader() {
  const links = getHeaderNavLinks()
  const docLinks = getAllDocs().map(doc => ({ title: doc.title, slug: doc.slug }))

  return (
    <header className="docs-header">
      <div className="docs-header-inner">
        <SiteLogo />

        <nav className="docs-header-nav" aria-label="Site">
          {links.map(link =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                className="docs-header-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
              </a>
            ) : (
              <Link key={link.href} href={link.href} className="docs-header-link">
                {link.label}
              </Link>
            )
          )}

          <Button href="/docs/getting-started" variant="outline" className="site-header-cta">
            Get Started
          </Button>

          <MobileNavMenu links={links} docLinks={docLinks} />
        </nav>
      </div>
    </header>
  )
}
