import { isMarketplaceLive } from './seoRoutes'

/**
 * Pre-launch vs launched presentation is one site in two states, keyed off the
 * existing marketplace gate: pre-launch the marketing pages teach the product and
 * point at the waitlist; flipping NEXT_PUBLIC_MARKETPLACE_LIVE restores the
 * browse/register conversion paths without a redesign.
 */
export { isMarketplaceLive }

/**
 * Lead capture (consumer waitlist + merchant interest forms) stays dark until the
 * owner approves the persistence contract (ConsumerWaitlist/MerchantLead backend
 * slice; decision D1 in docs/superpowers/plans/2026-07-06-prelaunch-website-conversion-rebaseline.md).
 * Build-time inlined like the marketplace flag.
 */
export function isLeadCaptureLive(): boolean {
  return process.env.NEXT_PUBLIC_LEAD_CAPTURE_LIVE === 'true'
}

/**
 * Merchant portal registration URL. Merchants register in merchant-web (its own
 * app, served under /register), not this consumer site. NEXT_PUBLIC_MERCHANT_PORTAL_URL
 * must be set in production to the portal's own domain; the localhost:3003 fallback
 * matches the dev port for merchant-web.
 */
export function merchantPortalRegisterUrl(): string {
  const base = process.env.NEXT_PUBLIC_MERCHANT_PORTAL_URL ?? 'http://localhost:3003'
  return `${base.replace(/\/$/, '')}/register`
}

/** Merchant portal login URL (same base as registration). */
export function merchantPortalLoginUrl(): string {
  const base = process.env.NEXT_PUBLIC_MERCHANT_PORTAL_URL ?? 'http://localhost:3003'
  return `${base.replace(/\/$/, '')}/login`
}
