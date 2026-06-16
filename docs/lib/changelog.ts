import { site } from './site'

export type ChangelogEntry = {
  tag: string
  date: string
  dateIso: string
  title: string
}

const HARDCODED_FALLBACK: ChangelogEntry[] = [
  {
    tag: 'v0.1.0',
    date: 'Jun 15, 2026',
    dateIso: '2026-06-15',
    title: 'Initial release — hooks, merge, eval, skills'
  }
]

function releasesApiUrl(): string {
  const repo = site.githubRepo?.replace(/^https:\/\/github\.com\//, '') ?? 'drewpoling2/moatlog'
  return `https://api.github.com/repos/${repo}/releases?per_page=6`
}

export async function getChangelogEntries(): Promise<ChangelogEntry[]> {
  try {
    const res = await fetch(releasesApiUrl(), {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      cache: 'force-cache'
    })

    if (!res.ok) return HARDCODED_FALLBACK

    const releases = await res.json()
    if (!Array.isArray(releases) || releases.length === 0) {
      return HARDCODED_FALLBACK
    }

    return releases.map((r: { tag_name: string; published_at: string; name: string }) => ({
      tag: r.tag_name,
      date: new Date(r.published_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      dateIso: r.published_at.slice(0, 10),
      title: r.name || r.tag_name
    }))
  } catch {
    return HARDCODED_FALLBACK
  }
}

export function getReleaseTagUrl(tag: string): string | null {
  if (!site.githubRepo) return null
  return `${site.githubRepo}/releases/tag/${tag}`
}
