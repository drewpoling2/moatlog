import type { Metadata } from 'next'
import { GoogleAnalytics } from '@next/third-parties/google'
import { ScrollToTop } from '@/app/components/ScrollToTop'
import './globals.css'

export const metadata: Metadata = {
  title: 'moatlog docs',
  description: 'Behavioral memory layer for AI coding agents',
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
