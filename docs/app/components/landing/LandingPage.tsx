import { HeroActions } from './HeroActions'
import { HeroVisual } from './HeroVisual'
import { INSTALL_COMMAND, InstallCopyBar } from './InstallCopyBar'
import { LivePreviewSection } from './LivePreviewSection'
import { SessionReplay } from './SessionReplay'
import { LandingHeader } from './LandingHeader'
import { LandingFooter } from '@/app/components/SiteFooter'
import { ClaudeIcon, CursorIcon, DevinIcon } from './AgentIcons'
import { buildLiveCommandScripts, buildMoatStatusView, getMoatJsonGithubUrl, getMoatPreview } from '@/lib/moat-preview'
import { getChangelogEntries, getReleaseTagUrl } from '@/lib/changelog'
import { site } from '@/lib/site'
import { ArrowLeftRight, GitCommit, GitMerge, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { LandingCtaArrow } from './LandingCtaArrow'

type AgentIcon = ComponentType<SVGProps<SVGSVGElement>>

const AGENTS: Array<{
  id: string
  label: string
  active: boolean
  Icon?: AgentIcon
  logoClassName?: string
}> = [
    { id: 'cursor', label: 'Cursor', active: true, Icon: CursorIcon, logoClassName: 'landing-agent-logo--wordmark' },
    { id: 'claude', label: 'Claude', active: false, Icon: ClaudeIcon, logoClassName: 'landing-agent-logo--wordmark-wide' },
    { id: 'devin', label: 'Devin', active: false, Icon: DevinIcon, logoClassName: 'landing-agent-logo--wordmark-wide' }
  ]

const FEATURES: Array<{
  title: string
  body: ReactNode
  href: string
  linkLabel: string
  Icon: LucideIcon
}> = [
    {
      title: 'Commits with your code',
      body: (
        <>
          moat.json lives in your repo alongside your code. Diff it, review it in PRs, share it with your team
          without replaying session history.
        </>
      ),
      href: '/docs/moat-json',
      linkLabel: 'moat.json reference',
      Icon: GitCommit
    },
    {
      title: 'Works across agents',
      body: (
        <>
          Cursor and Claude Code write to the same event log and read from the same moat. Switch agents
          mid-project — context comes with you.
        </>
      ),
      href: '/docs/hooks',
      linkLabel: 'Hooks reference',
      Icon: ArrowLeftRight
    },
    {
      title: 'Merges like any other file',
      body: (
        <>
          <code className="landing-feature-code">moatlog merge</code> resolves conflicts. One moat, many contributors.
        </>
      ),
      href: '/docs/cli',
      linkLabel: 'CLI reference',
      Icon: GitMerge
    }
  ]

export async function LandingPage() {
  const moatPreview = getMoatPreview()
  const moatGithubUrl = getMoatJsonGithubUrl(site.githubRepo)

  const statusView = buildMoatStatusView(moatPreview)
  const liveCommands = buildLiveCommandScripts()
  const changelogEntries = await getChangelogEntries()

  return (
    <div className="landing">
      <LandingHeader />

      <main>
        {/* Hero */}
        <section className="landing-section landing-hero">
          <div className="landing-container landing-hero-stack">
            <div className="landing-hero-intro">
              <h1 className="landing-headline">
                Moatlog is shared memory for your AI, so it can pick up where other agents left off.
              </h1>
              <HeroActions />
            </div>
            <HeroVisual />
          </div>
        </section>

        {/* Agents */}
        <section className="landing-section landing-agents">
          <div className="landing-container">
            <p className="landing-agents-label">Works with the agents you already use</p>
            <ul className="landing-agents-grid">
              {AGENTS.map(agent => (
                <li
                  key={agent.id}
                  className={`landing-agent-card${agent.active ? ' landing-agent-card--active' : ''}`}
                >

                  {agent.Icon ? (
                    <agent.Icon
                      className={`landing-agent-logo ${agent.logoClassName ?? 'landing-agent-logo--wordmark'}`}
                      role="img"
                      aria-label={agent.label}
                    />
                  ) : (
                    <span className="landing-agent-name">{agent.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Mechanism */}
        <section className="landing-section landing-split">
          <div className="landing-container">
            <div className="landing-split-surface">
              <div className="landing-split-grid landing-split-grid--device">
                <div className="landing-split-copy">
                  <h2 className="landing-title">
                    Agent works and Moatlog watches.{' '}
                    <span className="landing-muted-text">
                      Every action becomes part of the memory your agent uses next time.
                    </span>
                  </h2>
                  <Link href="/docs/getting-started" className="landing-split-cta">
                    Get started
                    <LandingCtaArrow />
                  </Link>
                </div>
                <div className="landing-split-visual">
                  <SessionReplay />
                </div>
              </div>
            </div>
          </div>

          {/* Features */}
          <section className="landing-section landing-features">
            <div className="landing-container-narrow">
              <header className="landing-features-header">
                <h2 className="landing-features-heading">What&apos;s in Moatlog?<span className="landing-muted-text">&nbsp;Cross-agent memory, and automatic sync.</span></h2>
              </header>
              <ul className="landing-features-grid">
                {FEATURES.map(feature => (
                  <li key={feature.href}>
                    <Link href={feature.href} className="landing-feature-card">
                      <feature.Icon className="landing-feature-icon" aria-hidden="true" strokeWidth={2} />
                      <h2 className="landing-feature-title">{feature.title}</h2>
                      <p className="landing-feature-body">{feature.body}</p>

                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <LivePreviewSection moatGithubUrl={moatGithubUrl} commands={liveCommands} statusView={statusView} />

        </section>

        {/* Changelog + final CTA */}
        <section className="landing-section landing-closer" id="changelog">
          <div className="landing-container">
            <h2 className="landing-closer-kicker">Changelog</h2>
            <ul className="landing-changelog-grid">
              {changelogEntries.map(entry => {
                const href = getReleaseTagUrl(entry.tag)

                return (
                  <li key={entry.tag} className="landing-changelog-card">
                    {href ? (
                      <a
                        href={href}
                        className="landing-changelog-card-link"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <time className="landing-changelog-date" dateTime={entry.dateIso}>
                          {entry.date}
                        </time>
                        <p className="landing-changelog-title">{entry.title}</p>
                      </a>
                    ) : (
                      <>
                        <time className="landing-changelog-date" dateTime={entry.dateIso}>
                          {entry.date}
                        </time>
                        <p className="landing-changelog-title">{entry.title}</p>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="landing-closer-divider" aria-hidden="true" />

          <div className="landing-container">
            <div className="landing-final-cta">
              <h2 className="landing-final-headline">Try Moatlog now.</h2>
              <InstallCopyBar command={INSTALL_COMMAND} className="landing-final-install" />
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  )
}
