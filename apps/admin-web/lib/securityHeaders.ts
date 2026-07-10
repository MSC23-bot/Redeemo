// apps/admin-web/lib/securityHeaders.ts
//
// Self-contained security response headers for the Redeemo admin console.
//
// Kept deliberately separate from customer-web/lib/securityHeaders.ts: the admin
// surface has a smaller, stricter allowlist (no Stripe, no third-party image
// hosts) so the policy is its own small module rather than a shared import.
//
// CSP notes:
//   - script-src 'unsafe-inline' is required by the Next.js App Router (inline
//     bootstrap/hydration scripts with no nonce). It still blocks loading
//     external scripts. 'unsafe-eval' is dev-only (React Fast Refresh).
//   - style-src 'unsafe-inline' is unavoidable with Tailwind/runtime style attrs.
//   - connect-src is scoped to self + the backend API origin (NEXT_PUBLIC_API_URL),
//     so admin data fetches reach the API and nothing else.
//   - frame-ancestors 'none' + X-Frame-Options DENY: the admin console is never
//     embedded in a frame (clickjacking guard).

export interface SecurityHeaderOptions {
  /** NEXT_PUBLIC_API_URL — its origin is allowed in connect-src. */
  apiUrl: string
  /** NODE_ENV === 'production'. Dev relaxations (unsafe-eval, ws:) keep HMR working. */
  isProduction: boolean
}

export interface ResponseHeader {
  key: string
  value: string
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export function buildContentSecurityPolicy(opts: SecurityHeaderOptions): string {
  const api = originOf(opts.apiUrl)

  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    ...(opts.isProduction ? [] : ["'unsafe-eval'"]), // dev: React Fast Refresh
  ]
  const styleSrc = ["'self'", "'unsafe-inline'"]
  const imgSrc = [
    "'self'",
    'data:',
    'blob:',
    'https://*.r2.cloudflarestorage.com', // R2 — merchant/profile images (prod)
    'https://*.amazonaws.com', // S3 — merchant/profile images (prod)
    'https://*.r2.dev', // R2 public bucket: merchant logoUrl/bannerUrl public URLs, rendered via raw <img> in MerchantWorkspaceHeader (PR #437 two-bucket split)
  ]
  const connectSrc = [
    "'self'",
    ...(api ? [api] : []), // backend API (NEXT_PUBLIC_API_URL)
    ...(opts.isProduction ? [] : ['ws:']), // dev: Next.js HMR websocket
  ]

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `script-src ${scriptSrc.join(' ')}`,
    `style-src ${styleSrc.join(' ')}`,
    `img-src ${imgSrc.join(' ')}`,
    "font-src 'self'",
    `connect-src ${connectSrc.join(' ')}`,
  ].join('; ')
}

export function buildSecurityHeaders(opts: SecurityHeaderOptions): ResponseHeader[] {
  return [
    { key: 'Content-Security-Policy', value: buildContentSecurityPolicy(opts) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  ]
}
