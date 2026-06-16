import Link from 'next/link'
import { SiteLogo } from '@/app/components/SiteLogo'
import { getFeedbackUrl, site } from '@/lib/site'
import { Button } from '@/app/docs/Button'

export function DocsHeader() {
  const feedbackUrl = getFeedbackUrl()

  return (
    <header className="docs-header">
      <div className="docs-header-inner">
        <SiteLogo />

        <nav className="docs-header-nav" aria-label="Site">
          <Link href="/docs/overview" className="docs-header-link">
            Docs
          </Link>

          {site.githubRepo ? (
            <a
              href={site.githubRepo}
              className="docs-header-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          ) : null}

          {feedbackUrl ? (
            <a
              href={feedbackUrl}
              className="docs-header-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              Feedback
            </a>
          ) : null}

          <Button href="/docs/getting-started" variant="outline">
            Get Started
          </Button>
        </nav>
      </div>
    </header>
  )
}
