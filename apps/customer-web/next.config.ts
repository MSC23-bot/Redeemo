import type { NextConfig } from 'next'
import path from 'path'
import { buildSecurityHeaders } from './lib/securityHeaders'

const nextConfig: NextConfig = {
  // Prevent Next.js from scanning above the worktree root.
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
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  // SEC-H5 (Gate-PR-6): blanket security headers on every route, set via
  // next.config (CDN/edge layer, all routes) — NOT middleware, so the PR-4a
  // marketplace flag-gate + /account auth gate in middleware.ts stay untouched.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: buildSecurityHeaders({
          apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000',
          isProduction: process.env.NODE_ENV === 'production',
          cspReportOnly: process.env.CSP_REPORT_ONLY === 'true',
          enableHsts: process.env.ENABLE_HSTS === 'true',
        }),
      },
    ]
  },
}

export default nextConfig
