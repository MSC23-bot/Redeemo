import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  createRedemption,
  verifyRedemption,
  listMyRedemptions,
  getMyRedemption,
  getMyRedemptionByCode,
  flagRedemptionScreenshot,
  listBranchRedemptions,
  VerifyActor,
} from './service'
import { RedisKey } from '../shared/redis-keys'
import { AppError } from '../shared/errors'
import { routeRateLimit } from '../plugins/rate-limit'
import { resolveMerchantContext, assertBranchAllowed, type MerchantContext } from '../merchant/shared'

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

  // GET /api/v1/redemption/me/:code — self-lookup by redemption code, used
  // by the Show-to-Staff polling hook (5s cadence) to detect staff
  // validation transitions. Slim payload by design — see service.
  // Customer JWT is enforced by the redemption plugin's scoped
  // `app.authenticateCustomer` preHandler (plugin.ts:8).
  //
  // Per-customer rate limit (locked 2026-05-09 from deferred-followups
  // §AG1 — post-PR-#49 pre-public-launch hardening). Polling cadence
  // is 5 s × up to 15 min = ~180 hits/session = ~12 req/min legitimate;
  // 30/min/customer in prod (100/min in dev) is 2.5× that and
  // accommodates retries / jitter without false-positives.
  //
  // **`hook: 'preHandler'` is LOAD-BEARING.** `@fastify/rate-limit`
  // defaults to running at the `onRequest` lifecycle hook, which fires
  // BEFORE the `authenticateCustomer` preHandler (installed in
  // plugin.ts:8). Without this override the rate-limit would always
  // see `req.user === undefined` and silently fall back to IP keying,
  // which defeats the per-customer guarantee on shared-NAT / Wi-Fi.
  // Forcing `preHandler` puts the rate-limit AFTER auth so
  // `req.user.sub` is populated. Pinned by a route-config test.
  //
  // The `keyGenerator` keys on `req.user.sub` (populated by auth).
  // Falls back to `req.ip` only as defence-in-depth — should never
  // happen on this auth-gated route now that the hook timing is
  // correct. Other redemption routes (POST /redemption,
  // POST /redemption/:code/screenshot-flag, GET /redemption/my,
  // GET /redemption/my/:id) are NOT covered by this tier — each has
  // different traffic shape and remains on the global IP default.
  app.get(`${prefix}/redemption/me/:code`, {
    config: {
      rateLimit: {
        ...routeRateLimit('redemptionPolling'),
        hook: 'preHandler',
        keyGenerator: (req: FastifyRequest) => req.user?.sub ?? req.ip,
      },
    },
  }, async (req: FastifyRequest, reply) => {
    const { code } = (req.params as { code: string })

    const result = await getMyRedemptionByCode(app.prisma, req.user.sub, code)
    return reply.send(result)
  })

  // POST /api/v1/redemption/:code/screenshot-flag — anti-fraud telemetry
  // for the Show-to-Staff full-screen surface. Best-effort: dedup'd
  // server-side via Redis SETNX (5s TTL) — burst events for the same
  // (userId, code) write exactly one row. Customer JWT enforced by
  // the redemption plugin's scoped preHandler.
  app.post(`${prefix}/redemption/:code/screenshot-flag`, async (req: FastifyRequest, reply) => {
    const { code } = (req.params as { code: string })
    const body = z.object({ platform: z.enum(['ios', 'android']) }).parse(req.body)

    const result = await flagRedemptionScreenshot(
      app.prisma,
      app.redis,
      req.user.sub,
      code,
      body.platform,
    )
    return reply.send(result)
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
    // Staff & Access B6 (§4.3 † SCOPED-WRITE): the resolved MERCHANT-actor context.
    // Populated ONLY in the merchant branch below; the branch-actor path leaves it
    // null so its behaviour is unchanged. Passed into verifyRedemption so the service
    // can enforce branch scope for a scoped non-owner merchant member.
    let merchantCtx: MerchantContext | null = null

    // Attempt branch token verification
    try {
      await (req as any).branchVerify()
      const actorId = req.user.sub
      const raw = await app.redis.get(RedisKey.authBranch(actorId))
      if (!raw) throw new AppError('BRANCH_ACCESS_DENIED')

      const session = JSON.parse(raw) as { branchId: string; merchantId: string; isActive: boolean }
      if (!session.isActive) throw new AppError('BRANCH_ACCESS_DENIED')
      actor = { role: 'branch', branchId: session.branchId, merchantId: session.merchantId, actorId }
    } catch (branchErr) {
      if (branchErr instanceof AppError) throw branchErr

      // Attempt merchant token verification
      try {
        await (req as any).merchantVerify()
        const actorId = req.user.sub
        // Authorize the merchant actor from the JWT + the LIVE DB context, NOT a
        // short-lived cached login session. resolveMerchantContext reads the active
        // membership (role + branch scope) and keeps the live SEC-M2 suspended guard,
        // so it throws for a missing membership or a suspended merchant; the verify
        // SERVICE additionally re-checks merchant.status / branch.isActive live, and
        // enforces assertBranchAllowed(ctx, redemption.branchId) so a scoped non-owner
        // cannot validate at a branch they do not own.
        //
        // Previously this read a cached `auth:merchant:<id>` Redis session and 403'd
        // (BRANCH_ACCESS_DENIED) once that session had expired — even though the JWT
        // was still valid via refresh — so a merchant admin logged in past the session
        // TTL could not validate codes from the web portal.
        merchantCtx = await resolveMerchantContext(app.prisma, actorId)
        actor = { role: 'merchant', branchId: null, merchantId: merchantCtx.merchantId, actorId }
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
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '' },
      merchantCtx ?? undefined,
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
        // Authorize from the JWT + LIVE DB context, NOT a cached login session (same
        // fix as POST /redemption/verify above — a cached `auth:merchant:<id>` session
        // that expired while the JWT kept refreshing would 403 a still-logged-in
        // merchant admin). resolveMerchantContext reads the active membership and keeps
        // the live SEC-M2 suspended guard.
        const ctx = await resolveMerchantContext(app.prisma, actorId)

        // Verify the branch belongs to this merchant + re-check the merchant's LIVE
        // status (defence in depth alongside resolveMerchantContext's own suspended
        // guard — blocks a merchant suspended after the membership was read).
        const branch = await app.prisma.branch.findUnique({
          where:  { id: branchId },
          select: { merchantId: true, merchant: { select: { status: true } } },
        })
        if (!branch || branch.merchantId !== ctx.merchantId) throw new AppError('BRANCH_ACCESS_DENIED')
        if (branch.merchant.status === 'SUSPENDED') throw new AppError('MERCHANT_SUSPENDED')

        // Staff & Access B6 (§4.3 † SCOPED-READ): a scoped non-owner member can only
        // list redemptions for branches in their allowed set. assertBranchAllowed denies
        // an out-of-scope branch with INSUFFICIENT_PERMISSIONS (owner / allBranches pass
        // by construction). Layered on top of the merchant-ownership check above.
        assertBranchAllowed(ctx, branchId)

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
