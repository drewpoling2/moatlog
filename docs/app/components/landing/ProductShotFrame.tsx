import type { ReactNode } from 'react'

interface ProductShotFrameProps {
  url?: string
  children?: ReactNode
  className?: string
}

export function ProductShotFrame({
  url = 'your-project',
  children,
  className
}: ProductShotFrameProps) {
  return (
    <div className={`landing-shot ${className ?? ''}`.trim()}>
      <div className="landing-shot-browser">
        <div className="landing-shot-chrome">
          <div className="landing-shot-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="landing-shot-url">{url}</div>
          <div className="landing-shot-chrome-spacer" aria-hidden="true" />
        </div>
        <div className="landing-shot-screen">
          {children ?? (
            <div className="landing-shot-placeholder" aria-hidden="true">
              <span>Product shot</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
