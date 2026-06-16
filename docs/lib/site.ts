/** External links — env overrides defaults for forks/deploy previews. */

const DEFAULT_GITHUB_REPO = 'https://github.com/drewpoling2/moatlog';

const githubRepo =
  process.env.NEXT_PUBLIC_GITHUB_REPO?.replace(/\/$/, '') ?? DEFAULT_GITHUB_REPO;
const npmPackage = process.env.NEXT_PUBLIC_NPM_PACKAGE ?? null;
const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL?.replace(/\/$/, '') ?? null;
const authorHandle =
  process.env.NEXT_PUBLIC_AUTHOR_HANDLE?.replace(/^@/, '') ?? null;

export const site = {
  tagline: 'Behavioral memory for your AI',
  version: process.env.NEXT_PUBLIC_MOATLOG_VERSION ?? '0.1.0',
  authorHandle,
  docsUrl,
  githubRepo,
  npmPackage,
} as const;

export type FooterLink = {
  label: string;
  href: string;
  external?: boolean;
};

export type HeaderNavLink = FooterLink;

export function getHeaderNavLinks(): HeaderNavLink[] {
  const links: HeaderNavLink[] = [{ label: 'Docs', href: '/docs/overview' }];

  if (site.githubRepo) {
    links.push({ label: 'GitHub', href: site.githubRepo, external: true });
  }

  const feedbackUrl = getFeedbackUrl();
  if (feedbackUrl) {
    links.push({ label: 'Feedback', href: feedbackUrl, external: true });
  }

  return links;
}

export function getFooterSections(): Array<{
  title: string;
  links: FooterLink[];
}> {
  const product: FooterLink[] = [];

  if (site.githubRepo) {
    product.push({ label: 'GitHub', href: site.githubRepo, external: true });
    product.push({
      label: 'Changelog',
      href: getChangelogUrl()!,
      external: true,
    });
  } else {
    product.push({ label: 'Changelog', href: '/#changelog' });
  }

  if (site.githubRepo) {
    product.push({
      label: 'License',
      href: `${site.githubRepo}/blob/main/LICENSE`,
      external: true,
    });
  }

  const docs: FooterLink[] = [
    { label: 'Getting started', href: '/docs/getting-started' },
    { label: 'Hooks', href: '/docs/hooks' },
    { label: 'MCP setup', href: '/docs/mcp' },
    { label: 'moat.json reference', href: '/docs/moat-json' },
    { label: 'CLI reference', href: '/docs/cli' },
  ];

  return [
    { title: 'Product', links: product },
    { title: 'Docs', links: docs },
  ];
}

export function getChangelogUrl(): string | null {
  if (!site.githubRepo) return null;
  return `${site.githubRepo}/releases`;
}

export function getFeedbackUrl(): string | null {
  if (!site.githubRepo) return null;
  return `${site.githubRepo}/issues`;
}

export function getDocEditUrl(slug: string): string | null {
  if (!site.githubRepo) return null;
  return `${site.githubRepo}/blob/main/docs/content/${slug}.json`;
}
