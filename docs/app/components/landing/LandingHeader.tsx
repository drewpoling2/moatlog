import Link from 'next/link'
import { SiteLogo } from '@/app/components/SiteLogo'
import { getFeedbackUrl, site } from '@/lib/site'
import { Button } from '@/app/docs/Button'

export function LandingHeader() {
  const feedbackUrl = getFeedbackUrl()

  return (
    <header className="landing-header">
      <div className="landing-header-inner">
        <SiteLogo />

        <nav className="landing-header-nav" aria-label="Site">
          <Link href="/docs/overview" className="landing-header-link">
            Docs
          </Link>

          {site.githubRepo ? (
            <a
              href={site.githubRepo}
              className="landing-header-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          ) : null}

          {feedbackUrl ? (
            <a
              href={feedbackUrl}
              className="landing-header-link"
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
