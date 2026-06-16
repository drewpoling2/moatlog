import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
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
