import type { NextConfig } from 'next'
import path from 'path'
import { buildSecurityHeaders } from './lib/securityHeaders'

const nextConfig: NextConfig = {
  // Prevent Next.js from scanning above the workspace root.
  // Without this it walks up to /Users/shebinchaliyath and indexes the entire home folder.
  outputFileTracingRoot: path.join(__dirname, '../../../'),
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: '**.amazonaws.com',
      },
    ],
  },
  // Blanket security headers on every route, set at the CDN/edge layer via
  // next.config (not middleware, which Phase B will use for the auth gate).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: buildSecurityHeaders({
          apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000',
          isProduction: process.env.NODE_ENV === 'production',
        }),
      },
    ]
  },
}

export default nextConfig
