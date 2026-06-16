import Link from 'next/link'

const LOGO_WIDTH = 150
const LOGO_HEIGHT = 41

interface SiteLogoProps {
  href?: string
  className?: string
}

export function SiteLogo({ href = '/', className = 'docs-logo' }: SiteLogoProps) {
  return (
    <Link href={href} className={className} aria-label="moatlog home">
      <img
        src="/logo-light.svg"
        alt=""
        className="docs-logo-img docs-logo-img--light"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
      />
      <img
        src="/logo-dark.svg"
        alt=""
        className="docs-logo-img docs-logo-img--dark"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
      />
    </Link>
  )
}
