import type { Metadata } from 'next'
import { GoogleAnalytics } from '@next/third-parties/google'
import { ScrollToTop } from '@/app/components/ScrollToTop'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_DOCS_URL ?? 'https://moatlog.dev'),
  title: {
    default: 'moatlog — behavioral memory for AI coding agents',
    template: '%s | moatlog',
  },
  description:
    'moatlog captures what your AI coding agent actually does — files touched, patterns repeated — and turns it into git-native memory your agents can use next time. Works with Cursor, Claude Code, and Devin.',
  openGraph: {
    title: 'moatlog — behavioral memory for AI coding agents',
    description: 'Cross-agent memory that lives in your repo, not the cloud.',
    url: 'https://moatlog.dev',
    siteName: 'moatlog',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'moatlog — behavioral memory for AI coding agents',
    description: 'Cross-agent memory that lives in your repo, not the cloud.',
  },
}

const themeScript = `(function(){try{var k='moatlog-theme';var t=localStorage.getItem(k);var theme=t==='light'||t==='dark'?t:'light';document.documentElement.setAttribute('data-theme',theme);document.documentElement.classList.toggle('dark',theme==='dark');}catch(e){}})();`

const gaId = process.env.NEXT_PUBLIC_GA_ID

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ScrollToTop />
        {children}
        {gaId ? <GoogleAnalytics gaId={gaId} /> : null}
      </body>
    </html>
  )
}
