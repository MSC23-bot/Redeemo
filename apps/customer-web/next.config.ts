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
      {
        protocol: 'https',
        hostname: '**.r2.dev',
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
          // Staged ramp: short default to verify, raise once every subdomain is HTTPS-only.
          hstsMaxAge: Number(process.env.HSTS_MAX_AGE) || 604800,
        }),
      },
    ]
  },
}

export default nextConfig
