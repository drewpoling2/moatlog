import type { MetadataRoute } from 'next'
import { getAllSlugs } from '@/lib/docs'

const siteUrl = process.env.NEXT_PUBLIC_DOCS_URL ?? 'https://moatlog.dev'

export default function sitemap(): MetadataRoute.Sitemap {
  const slugs = getAllSlugs()

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...slugs.map(slug => ({
      url: `${siteUrl}/docs/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ]
}
