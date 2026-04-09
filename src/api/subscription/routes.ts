import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getActivePlans, getMySubscription, createSetupIntent, createSubscription, cancelSubscription } from './service'

export async function subscriptionRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/subscription'

  app.get(`${prefix}/plans`, async (req: FastifyRequest, reply) => {
    const plans = await getActivePlans(app.prisma)
    return reply.send(plans)
  })

  app.get(`${prefix}/me`, async (req: FastifyRequest, reply) => {
    const sub = await getMySubscription(app.prisma, req.user.sub)
    return reply.send(sub)
  })

  // Step 1: create Stripe customer + SetupIntent; returns clientSecret only
  app.post(`${prefix}/setup-intent`, async (req: FastifyRequest, reply) => {
    const result = await createSetupIntent(app.prisma, app.redis, req.user.sub)
    return reply.send(result)
  })

  // Step 2: subscribe using confirmed paymentMethodId from Stripe SDK
  // stripeCustomerId is resolved server-side from Redis — not accepted from client
  app.post(prefix, async (req: FastifyRequest, reply) => {
    const body = z.object({
      planId:          z.string().min(1),
      paymentMethodId: z.string().min(1),
      promoCode:       z.string().optional(),
    }).parse(req.body)

    const sub = await createSubscription(app.prisma, app.redis, req.user.sub, body, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.status(201).send(sub)
  })

  app.delete(prefix, async (req: FastifyRequest, reply) => {
    const result = await cancelSubscription(app.prisma, req.user.sub, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })
}
