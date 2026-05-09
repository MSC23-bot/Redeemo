import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'

const RELAX = process.env.RATE_LIMIT_RELAX === 'true' && process.env.NODE_ENV !== 'production'

const TIERS = {
  login:          { prod: { max: 5,  timeWindow: '1 minute' }, dev: { max: 50,  timeWindow: '1 minute' } },
  forgotPassword: { prod: { max: 3,  timeWindow: '1 hour' },   dev: { max: 10,  timeWindow: '1 minute' } },
  // Refresh tier — generous so it cannot false-positive on legitimate
  // active sessions. A single device refreshes ~once per 15 minutes;
  // 30/min/IP comfortably covers concurrent requests, retry behaviour,
  // and shared-IP scenarios (corporate NAT, residential CGNAT). The
  // primary purpose is to slow brute-force enumeration of refresh
  // tokens at scale, not to throttle real users. Locked 2026-05-08,
  // deferred-followups §AC8 / §AD4.
  refresh:        { prod: { max: 30, timeWindow: '1 minute' }, dev: { max: 100, timeWindow: '1 minute' } },
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
} as const

const GLOBAL = { prod: { max: 100, timeWindow: '1 minute' }, dev: { max: 100, timeWindow: '1 minute' } }

export function routeRateLimit(tier: keyof typeof TIERS) {
  return RELAX ? TIERS[tier].dev : TIERS[tier].prod
}

async function rateLimitPlugin(app: FastifyInstance) {
  const g = RELAX ? GLOBAL.dev : GLOBAL.prod
  await app.register(rateLimit, {
    global: true,
    max: g.max,
    timeWindow: g.timeWindow,
    keyGenerator: (req) => req.ip,
  })

  if (RELAX) {
    app.log.warn(
      `[rate-limit] RATE_LIMIT_RELAX=true — dev limits active: login ${TIERS.login.dev.max}/min, forgot-password ${TIERS.forgotPassword.dev.max}/min, refresh ${TIERS.refresh.dev.max}/min, global ${GLOBAL.dev.max}/min. NEVER enable in production.`,
    )
  }
}

export default fp(rateLimitPlugin, { name: 'rate-limit' })
