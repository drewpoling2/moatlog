import Link from 'next/link'
import { SiteLogo } from '@/app/components/SiteLogo'
import { ThemeToggle } from '@/app/docs/ThemeToggle'
import { getFooterSections, site, type FooterLink } from '@/lib/site'

function FooterLinkItem({ href, label, external }: FooterLink) {
  const className = 'site-footer-link'

  if (external) {
    return (
      <a href={href} className={className} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    )
  }

  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  )
}

function SiteFooterCard() {
  const sections = getFooterSections()
  const year = new Date().getFullYear()

  return (
    <div className="site-footer-card">
      <div className="site-footer-main">
        <div className="site-footer-brand">
          <SiteLogo />
          <p className="site-footer-tagline">{site.tagline}</p>
        </div>

        <div className="site-footer-nav">
          {sections.map(section => (
            <div key={section.title} className="site-footer-column">
              <h2 className="site-footer-heading">{section.title}</h2>
              <ul className="site-footer-links">
                {section.links.map(link => (
                  <li key={link.href}>
                    <FooterLinkItem {...link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="site-footer-divider" aria-hidden="true" />

      <div className="site-footer-meta">
        <p className="site-footer-meta-copy">
          © {year} moatlog · v{site.version} ·{' '}
          <Link href="/" className="site-footer-meta-link">
            built with moatlog
          </Link>
        </p>

        <div className="site-footer-meta-right">
          <ThemeToggle />
          {site.authorHandle ? (
            <p className="site-footer-meta-credit">
              made by{' '}
              <a
                href={`https://x.com/${site.authorHandle}`}
                className="site-footer-meta-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                @{site.authorHandle}
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function LandingFooter() {
  return (
    <footer className="site-footer site-footer--landing">
      <div className="site-footer-inner">
        <SiteFooterCard />
      </div>
    </footer>
  )
}

export function DocsFooter() {
  return (
    <footer className="site-footer site-footer--docs">
      <div className="site-footer-inner">
        <SiteFooterCard />
      </div>
    </footer>
  )
}
