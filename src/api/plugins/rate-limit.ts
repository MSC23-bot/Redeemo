import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'

const RELAX = process.env.RATE_LIMIT_RELAX === 'true' && process.env.NODE_ENV !== 'production'

const TIERS = {
  login:          { prod: { max: 5, timeWindow: '1 minute' }, dev: { max: 50, timeWindow: '1 minute' } },
  forgotPassword: { prod: { max: 3, timeWindow: '1 hour' },   dev: { max: 10, timeWindow: '1 minute' } },
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
      `[rate-limit] RATE_LIMIT_RELAX=true — dev limits active: login ${TIERS.login.dev.max}/min, forgot-password ${TIERS.forgotPassword.dev.max}/min, global ${GLOBAL.dev.max}/min. NEVER enable in production.`,
    )
  }
}

export default fp(rateLimitPlugin, { name: 'rate-limit' })
