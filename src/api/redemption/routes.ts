import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  createRedemption,
  verifyRedemption,
  listMyRedemptions,
  getMyRedemption,
  listBranchRedemptions,
  VerifyActor,
} from './service'
import { RedisKey } from '../shared/redis-keys'
import { AppError } from '../shared/errors'

const prefix = '/api/v1'

export async function customerRedemptionRoutes(app: FastifyInstance) {
  // POST /api/v1/redemption — initiate redemption (customer)
  app.post(`${prefix}/redemption`, async (req: FastifyRequest, reply) => {
    const body = z.object({
      voucherId: z.string().min(1),
      branchId:  z.string().min(1),
      pin:       z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 numeric digits'),
    }).parse(req.body)

    const redemption = await createRedemption(
      app.prisma,
      app.redis,
      req.user.sub,
      body,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '' }
    )

    return reply.status(201).send(redemption)
  })

  // GET /api/v1/redemption/my — list my redemptions (customer)
  app.get(`${prefix}/redemption/my`, async (req: FastifyRequest, reply) => {
    const query = z.object({
      limit:  z.coerce.number().int().min(1).max(100).default(10),
      offset: z.coerce.number().int().min(0).default(0),
    }).parse(req.query)

    const result = await listMyRedemptions(app.prisma, req.user.sub, query)
    return reply.send(result)
  })

  // GET /api/v1/redemption/my/:id — get a specific redemption (customer)
  app.get(`${prefix}/redemption/my/:id`, async (req: FastifyRequest, reply) => {
    const { id } = (req.params as { id: string })

    const redemption = await getMyRedemption(app.prisma, req.user.sub, id)
    return reply.send(redemption)
  })
}

export async function staffRedemptionRoutes(app: FastifyInstance) {
  // POST /api/v1/redemption/verify — verify a redemption code (branch staff OR merchant admin)
  app.post(`${prefix}/redemption/verify`, async (req: FastifyRequest, reply) => {
    const body = z.object({
      code:   z.string().min(1),
      method: z.enum(['QR_SCAN', 'MANUAL']),
    }).parse(req.body)

    // Try branch session first
    let actor: VerifyActor | null = null

    const jwtAny = app.jwt as any

    // Attempt branch token verification
    try {
      await (req as any).branchVerify()
      const actorId = req.user.sub
      const raw = await app.redis.get(RedisKey.authBranch(actorId))
      if (!raw) throw new AppError('BRANCH_ACCESS_DENIED')

      const session = JSON.parse(raw) as { branchId: string; merchantId: string }
      actor = { role: 'branch', branchId: session.branchId, merchantId: session.merchantId, actorId }
    } catch (branchErr) {
      if (branchErr instanceof AppError) throw branchErr

      // Attempt merchant token verification
      try {
        await (req as any).merchantVerify()
        const actorId = req.user.sub
        const raw = await app.redis.get(RedisKey.authMerchant(actorId))
        if (!raw) throw new AppError('BRANCH_ACCESS_DENIED')

        const session = JSON.parse(raw) as { merchantId: string }
        actor = { role: 'merchant', branchId: null, merchantId: session.merchantId, actorId }
      } catch (merchantErr) {
        if (merchantErr instanceof AppError) throw merchantErr
        throw new AppError('BRANCH_ACCESS_DENIED')
      }
    }

    const result = await verifyRedemption(
      app.prisma,
      body.code,
      body.method,
      actor,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '' }
    )

    return reply.send(result)
  })

  // GET /api/v1/branch/:branchId/redemptions — list branch redemptions (branch staff OR merchant admin)
  app.get(`${prefix}/branch/:branchId/redemptions`, async (req: FastifyRequest, reply) => {
    const { branchId } = req.params as { branchId: string }

    const query = z.object({
      limit:  z.coerce.number().int().min(1).max(100).default(10),
      offset: z.coerce.number().int().min(0).default(0),
      from:   z.string().datetime({ offset: true }).optional(),
      to:     z.string().datetime({ offset: true }).optional(),
    }).parse(req.query)

    // Try branch session first
    let resolved = false

    try {
      await (req as any).branchVerify()
      const actorId = req.user.sub
      const raw = await app.redis.get(RedisKey.authBranch(actorId))
      if (!raw) throw new AppError('BRANCH_ACCESS_DENIED')

      const session = JSON.parse(raw) as { branchId: string; merchantId: string }
      if (session.branchId !== branchId) throw new AppError('BRANCH_ACCESS_DENIED')

      resolved = true
    } catch (branchErr) {
      if (branchErr instanceof AppError) throw branchErr

      // Attempt merchant token verification — merchant admin can access any branch in their merchant
      try {
        await (req as any).merchantVerify()
        // Merchant admin can access any branch — no additional restriction needed
        resolved = true
      } catch {
        // neither token worked
      }
    }

    if (!resolved) throw new AppError('BRANCH_ACCESS_DENIED')

    const result = await listBranchRedemptions(app.prisma, branchId, {
      limit:  query.limit,
      offset: query.offset,
      from:   query.from   ? new Date(query.from)  : undefined,
      to:     query.to     ? new Date(query.to)    : undefined,
    })

    return reply.send(result)
  })
}
