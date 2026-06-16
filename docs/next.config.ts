import type { NextConfig } from 'next'
import path from 'path'

const monorepoRoot = path.join(__dirname, '..')

const nextConfig: NextConfig = {
  turbopack: {
    root: monorepoRoot,
  },
  outputFileTracingRoot: monorepoRoot,
  async redirects() {
    return [
      {
        source: '/docs/index',
        destination: '/docs/overview',
        permanent: true,
      },
      {
        source: '/docs/how-it-works',
        destination: '/docs/overview',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
