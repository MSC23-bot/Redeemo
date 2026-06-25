import type { NextConfig } from 'next'
import path from 'path'
import { buildSecurityHeaders } from './lib/securityHeaders'

const nextConfig: NextConfig = {
  // Pin Next's file-tracing root to the MONOREPO ROOT (the folder holding apps/ +
  // package-lock.json) so Next does not walk up and index the home folder.
  // Must be '../../' (the repo root), NOT '../../../': one level too high resolves
  // ABOVE the repo and breaks Vercel's monorepo packaging (doubled path ->
  // ENOENT .next/routes-manifest.json). Vercel expects the repo root here.
  outputFileTracingRoot: path.join(__dirname, '../../'),
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
