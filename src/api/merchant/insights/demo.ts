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
// LOCKED invariants (spec 2.6, plan A10; finding #8 staging-identity update):
//   - SERVER-OWNED ONLY. The only input is the merchantId the route already
//     resolved server-side (via resolveMerchantContext) plus the server-owned
//     process-config reads. Nothing in a request header / body / query / cookie can
//     flip it: there is no caller-supplied flag, and the merchantId passed is the
//     authz'd tenant id, not a client-chosen value.
//   - STAGING-IDENTITY HARD GATE (finding #8). The demo path requires EXACTLY
//     process.env.REDEEMO_DEPLOY_ENV === 'staging'. This is an explicit, app-owned
//     deploy identity, NOT NODE_ENV: Railway staging runs NODE_ENV=production, so a
//     NODE_ENV gate would (wrongly) kill the demo on the very environment it is
//     meant for. Unset / empty / 'local' / 'test' / 'production' / unknown all FAIL
//     CLOSED. Future production uses REDEEMO_DEPLOY_ENV='production' and can NEVER
//     permit the demo path. We do NOT fall back to RAILWAY_ENVIRONMENT_NAME and do
//     NOT infer staging from URLs, DB names, NODE_ENV, request data, or a feature
//     flag alone.
//   - DEFAULT OFF. With no INSIGHTS_DEMO_INCLUDE flag set, => undefined.
//   - MERCHANT ALLOWLIST. Returns the merchantId ONLY when it equals the server-
//     owned INSIGHTS_DEMO_MERCHANT_ID. A normal merchant (even with the flag set and
//     a DIFFERENT allowlisted id configured) => undefined => it never sees any test
//     rows. Combined with buildEligibilityWhereSql's same-merchant guard, the
//     carve-out can only ever lift cleanliness for the one allowlisted demo merchant.
//
// IMPORTANT: enabling this is an explicit staging-only operation. This code only
// reads the config; it does not authorise it. The staging-identity hard gate means
// a misconfigured flag can never affect production analytics (production deploys set
// REDEEMO_DEPLOY_ENV='production', which fails the gate).

/**
 * The app-owned deploy-identity env var (finding #8). EXACTLY 'staging' enables the
 * staging-only demo paths; everything else fails closed. NODE_ENV is intentionally
 * NOT consulted - Railway staging runs NODE_ENV=production.
 */
const DEPLOY_ENV_VAR = 'REDEEMO_DEPLOY_ENV'

/** The only value of REDEEMO_DEPLOY_ENV that identifies a staging deploy. */
const DEPLOY_ENV_STAGING = 'staging'

/** The server-owned flag that opens the demo include-path. */
const DEMO_INCLUDE_ENV_VAR = 'INSIGHTS_DEMO_INCLUDE'

/** The only value that opens the include-path (an explicit allow-list, not any truthy string). */
const DEMO_INCLUDE_AFFIRMATIVE = '1'

/** The server-owned allowlisted demo merchant id. */
const DEMO_MERCHANT_ID_ENV_VAR = 'INSIGHTS_DEMO_MERCHANT_ID'

/**
 * isStagingDeploy: the single server-owned staging-identity signal (finding #8).
 * true IFF process.env.REDEEMO_DEPLOY_ENV === 'staging' (EXACT match). Everything
 * else - unset / empty / different casing / surrounding whitespace / 'local' /
 * 'test' / 'production' / unknown - FAILS CLOSED. Takes no arguments by design; no
 * caller (request/header/body/query/cookie) can influence it. NODE_ENV is NOT read
 * (Railway staging runs NODE_ENV=production). Reused by both the runtime demo
 * resolver below AND the fixture seed guard (assertInsightsDemoFixtureAllowed).
 *
 * Future production: set REDEEMO_DEPLOY_ENV='production' so this returns false and
 * the demo path is dead.
 */
export function isStagingDeploy(): boolean {
  return process.env[DEPLOY_ENV_VAR] === DEPLOY_ENV_STAGING
}

/**
 * Resolve whether the demo isTestData carve-out should apply for `merchantId`.
 *
 * Returns `merchantId` (to be passed as `includeTestDataForMerchantId`) IFF ALL of:
 *   - isStagingDeploy()  (REDEEMO_DEPLOY_ENV === 'staging'; finding #8 hard gate,
 *     production / unset / unknown all fail closed), AND
 *   - process.env.INSIGHTS_DEMO_INCLUDE === '1'  (server-owned default-off flag), AND
 *   - merchantId === process.env.INSIGHTS_DEMO_MERCHANT_ID  (server-owned allowlist).
 * Otherwise returns undefined (the default; the canonical eligible rule applies).
 *
 * @param merchantId the authz'd tenant id the route already resolved. NOT request-
 *   derived as a free value: it is the merchant the caller is scoped to. No other
 *   caller input is read.
 */
export function demoIncludeMerchantId(merchantId: string): string | undefined {
  // Staging-identity hard gate FIRST (finding #8). Any non-staging deploy (including
  // production, unset, and unknown) is dead for the demo path regardless of any flag
  // or id match.
  if (!isStagingDeploy()) return undefined

  // Default-off flag.
  if (process.env[DEMO_INCLUDE_ENV_VAR] !== DEMO_INCLUDE_AFFIRMATIVE) return undefined

  // Merchant allowlist: only the single server-owned demo merchant id qualifies. A
  // missing/empty configured id never matches a real merchant id.
  const allowlisted = process.env[DEMO_MERCHANT_ID_ENV_VAR]
  if (typeof allowlisted !== 'string' || allowlisted.length === 0) return undefined
  if (merchantId !== allowlisted) return undefined

  return merchantId
}
