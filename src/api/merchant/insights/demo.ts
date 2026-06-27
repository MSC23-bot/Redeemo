// Insights PR-A Task A10: the server-owned demo include-path RESOLVER (spec 2.6,
// plan 6/A10).
//
// The demo fixture (prisma/insights-demo-fixture.ts) seeds a coherent demo dataset
// as isTestData=true rows on a single dedicated, allowlisted demo merchant. The
// canonical eligible rule (eligibility.ts -> buildEligibilityWhereSql) ALWAYS
// excludes isTestData=true, so by default those rows are invisible to every read
// path (production cleanliness, spec 2.1). For QA to actually SEE the demo dataset
// through the normal authz'd Insights routes, the service must - for the demo
// merchant ONLY, and ONLY in a non-production environment with the explicit demo
// flag set - relax the isTestData filter via buildEligibilityWhereSql's
// `includeTestDataForMerchantId` carve-out.
//
// `demoIncludeMerchantId` is that decision, expressed exactly like behaviouralGateOpen
// (gate.ts): SERVER-OWNED, DEFAULT-OFF, PRODUCTION FAIL-CLOSED, ARITY-CONTROLLED.
//
// LOCKED invariants (spec 2.6, plan A10):
//   - SERVER-OWNED ONLY. The only input is the merchantId the route already
//     resolved server-side (via resolveMerchantContext) plus three server-owned
//     process-config reads. Nothing in a request header / body / query / cookie can
//     flip it: there is no caller-supplied flag, and the merchantId passed is the
//     authz'd tenant id, not a client-chosen value.
//   - PRODUCTION HARD GATE. NODE_ENV === 'production' => ALWAYS undefined, even with
//     the flag set and the id matching. The demo path is dead in production.
//   - DEFAULT OFF. With no INSIGHTS_DEMO_INCLUDE flag set, => undefined.
//   - MERCHANT ALLOWLIST. Returns the merchantId ONLY when it equals the server-
//     owned INSIGHTS_DEMO_MERCHANT_ID. A normal merchant (even with the flag set and
//     a DIFFERENT allowlisted id configured) => undefined => it never sees any test
//     rows. Combined with buildEligibilityWhereSql's same-merchant guard, the
//     carve-out can only ever lift cleanliness for the one allowlisted demo merchant.
//
// IMPORTANT: enabling this in a deploy environment is an explicit staging-only
// operation. This code only reads the config; it does not authorise it. The
// production hard gate means a misconfigured staging flag can never affect
// production analytics.

/** The server-owned flag that opens the demo include-path. */
const DEMO_INCLUDE_ENV_VAR = 'INSIGHTS_DEMO_INCLUDE'

/** The only value that opens the include-path (an explicit allow-list, not any truthy string). */
const DEMO_INCLUDE_AFFIRMATIVE = '1'

/** The server-owned allowlisted demo merchant id. */
const DEMO_MERCHANT_ID_ENV_VAR = 'INSIGHTS_DEMO_MERCHANT_ID'

/**
 * Resolve whether the demo isTestData carve-out should apply for `merchantId`.
 *
 * Returns `merchantId` (to be passed as `includeTestDataForMerchantId`) IFF ALL of:
 *   - NODE_ENV !== 'production'  (hard gate; production ALWAYS returns undefined), AND
 *   - process.env.INSIGHTS_DEMO_INCLUDE === '1'  (server-owned default-off flag), AND
 *   - merchantId === process.env.INSIGHTS_DEMO_MERCHANT_ID  (server-owned allowlist).
 * Otherwise returns undefined (the default; the canonical eligible rule applies).
 *
 * @param merchantId the authz'd tenant id the route already resolved. NOT request-
 *   derived as a free value: it is the merchant the caller is scoped to. No other
 *   caller input is read.
 */
export function demoIncludeMerchantId(merchantId: string): string | undefined {
  // Hard production gate FIRST. Production is dead for the demo path regardless of
  // any flag or id match.
  if (process.env.NODE_ENV === 'production') return undefined

  // Default-off flag.
  if (process.env[DEMO_INCLUDE_ENV_VAR] !== DEMO_INCLUDE_AFFIRMATIVE) return undefined

  // Merchant allowlist: only the single server-owned demo merchant id qualifies. A
  // missing/empty configured id never matches a real merchant id.
  const allowlisted = process.env[DEMO_MERCHANT_ID_ENV_VAR]
  if (typeof allowlisted !== 'string' || allowlisted.length === 0) return undefined
  if (merchantId !== allowlisted) return undefined

  return merchantId
}
