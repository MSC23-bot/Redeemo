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
