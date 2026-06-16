export function HeroVisual() {
  return (
    <div className="landing-hero-visual" aria-hidden="true">
      <div className="landing-hero-panels">
        <div className="landing-hero-panel landing-hero-panel--agent">
          <div className="landing-hero-panel-header">
            <div className="landing-hero-panel-title">
              <span className="landing-hero-panel-pill">agent</span>
            </div>
          </div>
          <div className="landing-hero-panel-screen landing-hero-panel-screen--agent">
            <p className="landing-hero-line landing-hero-line--muted">... 14 earlier events</p>
            <p className="landing-hero-line">
              <span className="landing-hero-prompt">&gt;</span> prompt{' '}
              <span className="landing-hero-quote">&quot;add .moatlogignore support&quot;</span>
            </p>
            <p className="landing-hero-line">
              <span className="landing-hero-prompt">&gt;</span> checking moat{' '}
              <span className="landing-hero-accent">get_task_context</span>
              <span className="landing-hero-dim">(&quot;moatlogignore&quot;)</span>
            </p>
            <p className="landing-hero-line">
              <span className="landing-hero-prompt">&gt;</span>{' '}
              <span className="landing-hero-dim">↳</span>{' '}
              <span className="landing-hero-accent">match found</span>
            </p>
          </div>
        </div>

        <div className="landing-hero-panel landing-hero-panel--moat">
          <div className="landing-hero-panel-header">
            <div className="landing-hero-panel-title">
              <span className="landing-hero-panel-pill landing-hero-panel-pill--moat">moat.json</span>
            </div>

          </div>
          <div className="landing-hero-panel-screen landing-hero-panel-screen--moat">
            <p className="landing-hero-line landing-hero-line--moat">$ get_task_context</p>
            <p className="landing-hero-line landing-hero-line--moat">
              <span className="landing-hero-quote">&quot;add .moatlogignore support&quot;</span>
            </p>
            <p className="landing-hero-line landing-hero-line--moat landing-hero-line--indent">
              - 1 session ago
            </p>
            <p className="landing-hero-line landing-hero-line--moat">files:</p>
            <p className="landing-hero-line landing-hero-line--moat landing-hero-line--file">
              <span className="landing-hero-prompt">&gt;</span> packages/core/src/ignore.ts
              <span className="landing-hero-cursor" />
            </p>
            <p className="landing-hero-line landing-hero-line--moat landing-hero-line--indent">
              packages/cli/src/init.ts
            </p>
            <p className="landing-hero-line landing-hero-line--moat landing-hero-line--indent">
              packages/core/src/profiler.ts
            </p>
            <p className="landing-hero-line landing-hero-line--moat landing-hero-line--confidence">
              confidence: high
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
