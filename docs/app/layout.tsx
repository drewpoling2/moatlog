import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'moatlog docs',
  description: 'Behavioral memory layer for AI coding agents',
}

const themeScript = `(function(){try{var k='moatlog-theme';var t=localStorage.getItem(k);var theme=t==='light'||t==='dark'?t:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',theme);document.documentElement.classList.toggle('dark',theme==='dark');}catch(e){}})();`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
