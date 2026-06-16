import { Button } from '@/app/docs/Button'
import { InstallCopyBar } from './InstallCopyBar'

export function HeroActions() {
  return (
    <div className="landing-hero-actions">
      <Button href="/docs/getting-started" className="landing-hero-btn landing-hero-btn--primary">
        Get Started
      </Button>
      <InstallCopyBar />
    </div>
  )
}
