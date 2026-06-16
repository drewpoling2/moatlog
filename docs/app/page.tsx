import type { Metadata } from 'next'
import { LandingPage } from '@/app/components/landing/LandingPage'

export const metadata: Metadata = {
  title: 'moatlog — behavioral memory for AI coding agents',
  description:
    'Moatlog hooks into Cursor and Claude Code to capture agent behavior, distill it into moat.json, and serve it back through MCP so every session starts warm.',
}

export default async function HomePage() {
  return <LandingPage />
}
