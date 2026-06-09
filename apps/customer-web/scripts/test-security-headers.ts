// apps/customer-web/scripts/test-security-headers.ts
//
// SEC-H5 (Gate-PR-6) — config-level assertions for the security-header policy.
// customer-web has no test runner, so this is a standalone tsx script:
//   npx tsx apps/customer-web/scripts/test-security-headers.ts
// It exercises the pure builder in lib/securityHeaders.ts. Exits non-zero on
// any failed assertion (CI-friendly).

import assert from 'node:assert/strict'
import { buildContentSecurityPolicy, buildSecurityHeaders } from '../lib/securityHeaders'

const prod = { apiUrl: 'https://api.redeemo.co.uk', isProduction: true, cspReportOnly: false, enableHsts: false, hstsMaxAge: 604800 }

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

check('prod CSP allowlists Stripe (script + Elements/3DS frames)', () => {
  const csp = buildContentSecurityPolicy(prod)
  assert.match(csp, /script-src[^;]*https:\/\/js\.stripe\.com/)
  assert.match(csp, /frame-src[^;]*https:\/\/js\.stripe\.com[^;]*https:\/\/hooks\.stripe\.com/)
})

check('prod connect-src has the API origin + postcodes.io + Stripe', () => {
  const csp = buildContentSecurityPolicy(prod)
  assert.match(csp, /connect-src[^;]*https:\/\/api\.redeemo\.co\.uk/)
  assert.match(csp, /connect-src[^;]*https:\/\/api\.postcodes\.io/)
  assert.match(csp, /connect-src[^;]*https:\/\/\*\.stripe\.com/)
})

check('Stripe Radar/3DS telemetry (m.stripe.network) allowlisted in connect-src AND frame-src', () => {
  const csp = buildContentSecurityPolicy(prod)
  assert.match(csp, /connect-src[^;]*https:\/\/m\.stripe\.network/)
  assert.match(csp, /frame-src[^;]*https:\/\/m\.stripe\.network/)
})

check('no form-action directive (avoids blocking Stripe redirect-based 3DS)', () => {
  assert.doesNotMatch(buildContentSecurityPolicy(prod), /form-action/)
})

check('connect-src uses the ORIGIN of NEXT_PUBLIC_API_URL (not the full path)', () => {
  const csp = buildContentSecurityPolicy({ ...prod, apiUrl: 'https://api.redeemo.co.uk/api/v1/customer' })
  assert.match(csp, /connect-src[^;]*https:\/\/api\.redeemo\.co\.uk(?:\s|;)/)
  assert.doesNotMatch(csp, /api\.redeemo\.co\.uk\/api\/v1/)
})

check('prod CSP has NO unsafe-eval (dev-only)', () => {
  assert.doesNotMatch(buildContentSecurityPolicy(prod), /unsafe-eval/)
})

check('dev CSP adds unsafe-eval + ws: so Next HMR / Fast Refresh keep working', () => {
  const csp = buildContentSecurityPolicy({ ...prod, isProduction: false })
  assert.match(csp, /script-src[^;]*'unsafe-eval'/)
  assert.match(csp, /connect-src[^;]*ws:/)
})

check('clickjacking: CSP frame-ancestors none + X-Frame-Options DENY', () => {
  assert.match(buildContentSecurityPolicy(prod), /frame-ancestors 'none'/)
  assert.equal(buildSecurityHeaders(prod).find((h) => h.key === 'X-Frame-Options')?.value, 'DENY')
})

check('img-src allows self, data:, blob:, and the R2/S3 avatar hosts', () => {
  const csp = buildContentSecurityPolicy(prod)
  assert.match(csp, /img-src[^;]*data:/)
  assert.match(csp, /img-src[^;]*blob:/)
  assert.match(csp, /img-src[^;]*https:\/\/\*\.r2\.cloudflarestorage\.com/)
  assert.match(csp, /img-src[^;]*https:\/\/\*\.amazonaws\.com/)
})

check('font-src is self only (self-hosted Mustica Pro + Lato)', () => {
  assert.match(buildContentSecurityPolicy(prod), /font-src 'self'/)
})

check('standard hardening headers present', () => {
  const h = buildSecurityHeaders(prod)
  assert.equal(h.find((x) => x.key === 'X-Content-Type-Options')?.value, 'nosniff')
  assert.equal(h.find((x) => x.key === 'Referrer-Policy')?.value, 'strict-origin-when-cross-origin')
  assert.match(h.find((x) => x.key === 'Permissions-Policy')?.value ?? '', /geolocation=\(\)/)
})

check('CSP_REPORT_ONLY flips the header key to -Report-Only (no enforcing CSP)', () => {
  const enforce = buildSecurityHeaders(prod)
  const report = buildSecurityHeaders({ ...prod, cspReportOnly: true })
  assert.ok(enforce.some((x) => x.key === 'Content-Security-Policy'))
  assert.ok(report.some((x) => x.key === 'Content-Security-Policy-Report-Only'))
  assert.ok(!report.some((x) => x.key === 'Content-Security-Policy'))
})

check('HSTS off by default; when enabled, max-age is env-driven, no includeSubDomains/preload', () => {
  assert.ok(!buildSecurityHeaders(prod).some((x) => x.key === 'Strict-Transport-Security'))
  const hsts = buildSecurityHeaders({ ...prod, enableHsts: true, hstsMaxAge: 31536000 }).find((x) => x.key === 'Strict-Transport-Security')
  assert.equal(hsts?.value, 'max-age=31536000')
  assert.doesNotMatch(hsts?.value ?? '', /includeSubDomains|preload/)
})

console.log(`\n✓ ${passed} security-header assertions passed`)
