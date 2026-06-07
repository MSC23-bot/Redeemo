// apps/customer-web/lib/securityHeaders.ts
//
// SEC-H5 (Gate-PR-6) — customer-web security response headers.
//
// A pure, env-driven builder consumed by next.config.ts `headers()` and
// asserted by scripts/test-security-headers.ts. It is a separate module so the
// policy is testable WITHOUT a web test runner (customer-web has none).
//
// Scope note: this only adds response headers via next.config. It does NOT
// touch middleware.ts, so the PR-4a marketplace flag-gate + /account auth gate
// are unchanged.
//
// CSP allowlist rationale (audited 2026-06-07):
//   - script-src 'unsafe-inline' is REQUIRED: Next.js App Router injects inline
//     bootstrap/hydration scripts (self.__next_f) with no nonce. It still BLOCKS
//     loading external scripts from non-allowlisted origins, and connect-src
//     blocks exfiltration — meaningful defense-in-depth for the localStorage
//     bearer-token model. 'unsafe-eval' is NOT emitted in production (no eval /
//     new Function in app code; Stripe runs in an iframe); it is added in dev
//     only for React Fast Refresh. Future hardening: nonce + 'strict-dynamic'.
//   - style-src 'unsafe-inline' is unavoidable: 300+ inline style attributes +
//     framer-motion set styles imperatively; nonces do not cover style ATTRs.
//   - Stripe (subscribe flow): js.stripe.com (script + Elements frame),
//     hooks.stripe.com (3DS frame), *.stripe.com (api/telemetry, connect).
//   - Images: self-origin /_next/image plus the raw <img> avatar hosts (R2/S3);
//     unsplash + placehold.co are seed/demo only and can be dropped post-scrub.
//   - connect-src: the backend API origin (NEXT_PUBLIC_API_URL) + api.postcodes.io
//     (registration postcode lookup) + Stripe.
//   - Fonts: self-hosted (Mustica Pro + Lato) → font-src 'self'.

export interface SecurityHeaderOptions {
  /** NEXT_PUBLIC_API_URL — its origin is allowed in connect-src. */
  apiUrl: string
  /** NODE_ENV === 'production'. Dev relaxations (unsafe-eval, ws:) keep HMR working. */
  isProduction: boolean
  /** CSP_REPORT_ONLY === 'true' → emit Content-Security-Policy-Report-Only (no enforcement). */
  cspReportOnly: boolean
  /** ENABLE_HSTS === 'true' → emit a conservative Strict-Transport-Security (staged; default off). */
  enableHsts: boolean
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
    'https://js.stripe.com',
    ...(opts.isProduction ? [] : ["'unsafe-eval'"]), // dev: React Fast Refresh
  ]
  const styleSrc = ["'self'", "'unsafe-inline'"]
  const imgSrc = [
    "'self'",
    'data:',
    'https://*.r2.cloudflarestorage.com', // R2 — merchant/profile images (prod)
    'https://*.amazonaws.com', // S3 — merchant/profile images (prod)
    'https://images.unsplash.com', // seed/demo only — droppable post seed-scrub
    'https://placehold.co', // seed/demo only — droppable post seed-scrub
  ]
  const connectSrc = [
    "'self'",
    ...(api ? [api] : []), // backend API (NEXT_PUBLIC_API_URL)
    'https://api.postcodes.io', // UK postcode lookup (registration)
    'https://*.stripe.com', // Stripe api + telemetry (api/m/r/q.stripe.com)
    ...(opts.isProduction ? [] : ['ws:']), // dev: Next.js HMR websocket
  ]
  const frameSrc = ['https://js.stripe.com', 'https://hooks.stripe.com'] // Stripe Elements + 3DS

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'", // clickjacking — the site is never framed
    "form-action 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    `style-src ${styleSrc.join(' ')}`,
    `img-src ${imgSrc.join(' ')}`,
    "font-src 'self'", // self-hosted Mustica Pro + Lato
    `connect-src ${connectSrc.join(' ')}`,
    `frame-src ${frameSrc.join(' ')}`,
  ].join('; ')
}

export function buildSecurityHeaders(opts: SecurityHeaderOptions): ResponseHeader[] {
  const headers: ResponseHeader[] = [
    {
      key: opts.cspReportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
      value: buildContentSecurityPolicy(opts),
    },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' }, // legacy clickjacking guard (CSP frame-ancestors is the modern one)
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, // protects ?token= reset/verify URLs cross-origin
    // Disable powerful features the app does not use.
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  ]

  if (opts.enableHsts) {
    // Staged rollout (audit-locked): only when ENABLE_HSTS=true, at custom-domain
    // cutover. Conservative — 2y max-age, NO includeSubDomains / NO preload until
    // every subdomain (api/admin/merchant/staging) is confirmed HTTPS-only.
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=63072000' })
  }

  return headers
}
