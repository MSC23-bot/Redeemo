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
      code:     z.string().min(1),
      method:   z.enum(['QR_SCAN', 'MANUAL']),
      branchId: z.string().min(1),
    }).parse(req.body)

    // Try branch session first
    let actor: VerifyActor | null = null

    // Attempt branch token verification
    try {
      await (req as any).branchVerify()
      const actorId = req.user.sub
      const raw = await app.redis.get(RedisKey.authBranch(actorId))
      if (!raw) throw new AppError('BRANCH_ACCESS_DENIED')

      const session = JSON.parse(raw) as { branchId: string; merchantId: string; isActive: boolean }
      if (!session.isActive) throw new AppError('BRANCH_ACCESS_DENIED')
      // Branch staff can only verify codes for their own branch
      if (session.branchId !== body.branchId) throw new AppError('BRANCH_ACCESS_DENIED')
      actor = { role: 'branch', branchId: session.branchId, merchantId: session.merchantId, actorId }
    } catch (branchErr) {
      if (branchErr instanceof AppError) throw branchErr

      // Attempt merchant token verification
      try {
        await (req as any).merchantVerify()
        const actorId = req.user.sub
        const raw = await app.redis.get(RedisKey.authMerchant(actorId))
        if (!raw) throw new AppError('BRANCH_ACCESS_DENIED')

        const merchantSession = JSON.parse(raw) as { merchantId: string; isSuspended: boolean; approvalStatus: string }
        if (merchantSession.isSuspended) throw new AppError('MERCHANT_SUSPENDED')

        // Verify that body.branchId belongs to this merchant
        const branch = await app.prisma.branch.findUnique({ where: { id: body.branchId }, select: { merchantId: true } })
        if (!branch || branch.merchantId !== merchantSession.merchantId) throw new AppError('BRANCH_ACCESS_DENIED')

        actor = { role: 'merchant', branchId: body.branchId, merchantId: merchantSession.merchantId, actorId }
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

      const session = JSON.parse(raw) as { branchId: string; merchantId: string; isActive: boolean }
      if (!session.isActive) throw new AppError('BRANCH_ACCESS_DENIED')
      if (session.branchId !== branchId) throw new AppError('BRANCH_ACCESS_DENIED')

      resolved = true
    } catch (branchErr) {
      if (branchErr instanceof AppError) throw branchErr

      // Attempt merchant token verification — merchant admin can only access branches they own
      try {
        await (req as any).merchantVerify()
        const actorId = req.user.sub
        const merchantRaw = await app.redis.get(RedisKey.authMerchant(actorId))
        if (!merchantRaw) throw new AppError('BRANCH_ACCESS_DENIED')

        const merchantSession = JSON.parse(merchantRaw) as { merchantId: string; isSuspended: boolean; approvalStatus: string }
        if (merchantSession.isSuspended) throw new AppError('MERCHANT_SUSPENDED')

        // Verify branch belongs to this merchant
        const branch = await app.prisma.branch.findUnique({ where: { id: branchId }, select: { merchantId: true } })
        if (!branch || branch.merchantId !== merchantSession.merchantId) throw new AppError('BRANCH_ACCESS_DENIED')

        resolved = true
      } catch (merchantErr) {
        if (merchantErr instanceof AppError) throw merchantErr
        // neither token worked — fall through to resolved check
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
