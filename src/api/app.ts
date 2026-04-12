import Fastify, { FastifyInstance, FastifyError } from 'fastify'
import helmet from '@fastify/helmet'
import { ZodError } from 'zod'
import prismaPlugin from './plugins/prisma'
import redisPlugin from './plugins/redis'
import corsPlugin from './plugins/cors'
import rateLimitPlugin from './plugins/rate-limit'
import { AppError } from './shared/errors'
import customerAuthPlugin from './auth/customer/plugin'
import { customerAuthRoutes } from './auth/customer/routes'
import merchantAuthPlugin from './auth/merchant/plugin'
import { merchantAuthRoutes } from './auth/merchant/routes'
import { branchUserMgmtRoutes } from './auth/merchant/branch-user.routes'
import branchAuthPlugin from './auth/branch/plugin'
import { branchAuthRoutes } from './auth/branch/routes'
import adminAuthPlugin from './auth/admin/plugin'
import { adminAuthRoutes } from './auth/admin/routes'
import merchantManagementPlugin from './merchant/plugin'
import subscriptionPlugin from './subscription/plugin'
import { webhookRoutes } from './subscription/webhook'
import redemptionPlugin from './redemption/plugin'
import customerPlugin from './customer/plugin'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  })

  // Security headers
  await app.register(helmet)

  // Infrastructure plugins
  if (process.env.NODE_ENV !== 'test') {
    await app.register(prismaPlugin)
    await app.register(redisPlugin)
  }
  await app.register(corsPlugin)
  await app.register(rateLimitPlugin)

  // Global error handler — must be set before route plugins so it covers their scope
  app.setErrorHandler((error: FastifyError | AppError | Error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message ?? 'Validation failed.', statusCode: 400 },
      })
    }
    if (error instanceof AppError || error.name === 'AppError') {
      const appErr = error as AppError
      return reply.status(appErr.statusCode).send(appErr.toJSON())
    }
    // Rate limit error from @fastify/rate-limit
    if ('statusCode' in error && error.statusCode === 429) {
      return reply.status(429).send({
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.', statusCode: 429 },
      })
    }
    app.log.error(error)
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', statusCode: 500 },
    })
  })

  await app.register(customerAuthPlugin)
  await app.register(customerAuthRoutes)

  await app.register(merchantAuthPlugin)
  await app.register(merchantAuthRoutes)
  await app.register(branchUserMgmtRoutes)

  await app.register(branchAuthPlugin)
  await app.register(branchAuthRoutes)

  await app.register(adminAuthPlugin)
  await app.register(adminAuthRoutes)

  await app.register(merchantManagementPlugin)
  await app.register(subscriptionPlugin)
  await app.register(webhookRoutes)
  await app.register(redemptionPlugin)
  await app.register(customerPlugin)

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}
