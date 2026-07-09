import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'

const RELAX = process.env.RATE_LIMIT_RELAX === 'true' && process.env.NODE_ENV !== 'production'

const TIERS = {
  login:          { prod: { max: 5,  timeWindow: '1 minute' }, dev: { max: 50,  timeWindow: '1 minute' } },
  forgotPassword: { prod: { max: 3,  timeWindow: '1 hour' },   dev: { max: 10,  timeWindow: '1 minute' } },
  // Admin OTP-verify tier (M0). Per-IP, slightly STRICTER than login: an OTP
  // guess is a credential attempt, and the service already caps a single
  // challenge at 5 wrong tries — this edge throttle backstops repeated POSTs
  // across many challenges (e.g. re-login spam to farm fresh codes).
  otpVerify:      { prod: { max: 5,  timeWindow: '1 minute' }, dev: { max: 50,  timeWindow: '1 minute' } },
  // Merchant draft-owner claim (set-password via emailed token). Per-IP; the
  // 32-byte token is the primary defence — this just caps abuse + allows retries.
  claim:          { prod: { max: 5,  timeWindow: '1 minute' }, dev: { max: 50,  timeWindow: '1 minute' } },
  // Self-serve merchant registration (M1 Slice R). Per-IP; account creation is
  // expensive + spam-prone, so a strict 5/hour prod window (mirrors the
  // forgotPassword '1 hour' precedent). The Turnstile captcha is the primary
  // human check; this edge throttle backstops automated signup floods. NOTE: the
  // dev/test relaxed window only applies when RATE_LIMIT_RELAX=true (NOT keyed on
  // NODE_ENV), so unit tests run under the 5/hour prod limit; keep register
  // tests under 5 POSTs per IP, or vary the source IP.
  register:       { prod: { max: 5,  timeWindow: '1 hour' },   dev: { max: 50,  timeWindow: '1 minute' } },
  // Refresh tier — generous so it cannot false-positive on legitimate
  // active sessions. A single device refreshes ~once per 15 minutes;
  // 30/min/IP comfortably covers concurrent requests, retry behaviour,
  // and shared-IP scenarios (corporate NAT, residential CGNAT). The
  // primary purpose is to slow brute-force enumeration of refresh
  // tokens at scale, not to throttle real users. Locked 2026-05-08,
  // deferred-followups §AC8 / §AD4.
  refresh:        { prod: { max: 30, timeWindow: '1 minute' }, dev: { max: 100, timeWindow: '1 minute' } },
  // Merchant logout tier (backend logout-durability design 2026-07-06, §3.3
  // F5). The merchant /logout route is deliberately NOT authenticateMerchant-
  // gated (an already-expired token must still authorize a logout), so it is
  // reachable without a live bearer. A legitimate logout is a single request;
  // this generous per-IP ceiling (mirrors the `refresh` tier) bounds raw
  // request volume from a forged/bogus-token flood without false-positiving
  // on real users signing out from a shared merchant device.
  merchantLogout: { prod: { max: 30, timeWindow: '1 minute' }, dev: { max: 100, timeWindow: '1 minute' } },
  // Redemption polling tier — protects GET /api/v1/redemption/me/:code,
  // the Show-to-Staff polling endpoint hit every 5 seconds for up to a
  // 15-minute budget per open ShowToStaff session. Legitimate cadence
  // is ~12 req/min; 30/min in prod is 2.5× the legitimate rate so
  // retries / jitter / brief reconnects don't false-positive. Keyed
  // per CUSTOMER (req.user.sub via the route's keyGenerator override
  // — see redemption/routes.ts) so shared-Wi-Fi / NAT environments
  // don't collectively punish multiple customers. Locked 2026-05-09,
  // deferred-followups §AG1 (post-PR-#49 pre-public-launch hardening).
  redemptionPolling: { prod: { max: 30, timeWindow: '1 minute' }, dev: { max: 100, timeWindow: '1 minute' } },
  // Postcode-preview tier — protects GET /api/v1/customer/postcode/preview,
  // the OPEN-SCOPE read-only endpoint hit during PC2 debounced typing.
  // Legitimate cadence is ~5-10 req over 2-3 seconds (one per debounced
  // keystroke as the user finishes their postcode); 30/min/IP comfortably
  // covers that + retry behaviour without (a) exposing Redeemo as a free
  // postcode-lookup proxy or (b) letting an attacker burn through our
  // postcodes.io budget (their published 3000 req/min ceiling). Keyed by
  // req.ip — no req.user.sub available on an open-scope endpoint. Locked
  // 2026-05-14 from PR #81 review (Codex + self-review converged on this
  // as a must-fix-before-prod alongside the resolver AbortSignal timeout).
  postcodePreview:   { prod: { max: 30, timeWindow: '1 minute' }, dev: { max: 100, timeWindow: '1 minute' } },
} as const

// Global backstop sizing (2026-07-09, Savings "Couldn't load <month>" fix).
// 100/min/IP was reproducibly exceeded by ONE legitimate active customer:
// React Query focus-invalidation fan-outs (['discovery'] refetches Home/Map/
// Search/Category together), favourite-toggle invalidation storms, and Map
// pan fetches all share the budget, so a browsing burst left 0 headroom and
// the next Savings month-tap got 429s (client retries land inside the same
// 60s window → hard error card). Repro: 110 concurrent GETs → 10×429, then
// every monthly-detail call 429'd. 300/min (5 rps) still bounds abuse floods:
// every sensitive endpoint keeps its own strict tier above, and this ceiling
// also stops NAT/CGNAT-shared IPs collectively starving each other. If a
// legit single user can hit 300/min, fix the client's chattiness first
// (invalidation fan-outs), not this number.
const GLOBAL = { prod: { max: 300, timeWindow: '1 minute' }, dev: { max: 600, timeWindow: '1 minute' } }

export function routeRateLimit(tier: keyof typeof TIERS) {
  return RELAX ? TIERS[tier].dev : TIERS[tier].prod
}

async function rateLimitPlugin(app: FastifyInstance) {
  const g = RELAX ? GLOBAL.dev : GLOBAL.prod

  // F2 (SEC): back the edge rate-limit store with the SHARED Redis client so the
  // limits are shared across API instances and survive restarts/deploys. The
  // @fastify/rate-limit default is an in-process store — per-instance and reset
  // on every restart — which multiplies the effective limit by the instance
  // count and wipes counters on deploy (weakening login/abuse protection).
  //
  // Fall back to the in-memory store when app.redis is absent — notably under
  // NODE_ENV=test, where redisPlugin is not registered (see app.ts) — so the
  // test suite needs no Redis.
  //
  // skipOnError: true — FAIL OPEN on a Redis outage. This limiter is global:true,
  // so failing closed would error EVERY request and take the entire API down
  // whenever Redis blips. We accept a brief un-throttled window over a full
  // outage; auth/session flows are already Redis-dependent (logins can't complete
  // without it), so fail-open here exposes little the outage isn't already
  // causing. The durable per-account login lockout (F7 / SEC-M5) is the intended
  // backstop for that window.
  const store = app.hasDecorator('redis')
    ? { redis: app.redis, skipOnError: true }
    : {}

  await app.register(rateLimit, {
    global: true,
    max: g.max,
    timeWindow: g.timeWindow,
    keyGenerator: (req) => req.ip,
    ...store,
  })

  if (RELAX) {
    app.log.warn(
      `[rate-limit] RATE_LIMIT_RELAX=true — dev limits active: login ${TIERS.login.dev.max}/min, forgot-password ${TIERS.forgotPassword.dev.max}/min, refresh ${TIERS.refresh.dev.max}/min, global ${GLOBAL.dev.max}/min. NEVER enable in production.`,
    )
  }
}

export default fp(rateLimitPlugin, { name: 'rate-limit' })
