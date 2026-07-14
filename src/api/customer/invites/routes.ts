// src/api/customer/invites/routes.ts
//
// Customer merchant-invite programme M1: the customer-facing HTTP surface.
// Registered in the AUTHED scope of ../plugin.ts (signed-in only — mirrors
// M0's service.ts "Phase 1, signed-in only" contract).
//
// Dark-by-default: ALL THREE routes call isInvitesEnabled() FIRST and, when
// false, reply via `reply.callNotFound()` — Fastify's own built-in 404
// handler (src/api/app.ts registers no custom `setNotFoundHandler`), so a
// flag-off probe gets a response BYTE-IDENTICAL to hitting a route that was
// never registered at all. This never leaks that the feature exists.
//
// NEVER log emails, notes, tokens, or IPs anywhere in this module.

import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { AppError } from '../../shared/errors'
import { routeRateLimit } from '../../plugins/rate-limit'
import { consumeInviteSubmit } from '../../shared/inviteSubmitLimiter'
import { isInvitesEnabled } from './flags'
import { submitInvite, searchInvitePlaces, resolveInviteLocationCandidate } from './service'

const prefix = '/api/v1/customer/invites'

const placeSearchBody = z.object({
  query: z.string().trim().min(2).max(120),
})

const submitBody = z.object({
  candidateToken:   z.string().min(1).optional(),
  businessName:     z.string().trim().min(1).max(160).optional(),
  locality:         z.string().trim().max(80).optional(),
  note:             z.string().trim().max(240).optional(),
  consentShareName: z.boolean(),
})

// Per-customer keying (mirrors the redemptionPolling / branchPinDrop
// precedent in src/api/plugins/rate-limit.ts): `hook: 'preHandler'` is
// LOAD-BEARING — @fastify/rate-limit defaults to the `onRequest` lifecycle
// hook, which fires BEFORE the authed scope's `authenticateCustomer`
// preHandler (plugin.ts), so without this override `req.user` would always
// be undefined here and the keyGenerator would silently fall back to
// per-IP keying on every request.
function perCustomerRateLimit(tier: 'inviteSubmit' | 'invitePlaceSearch') {
  return {
    ...routeRateLimit(tier),
    hook: 'preHandler' as const,
    keyGenerator: (req: FastifyRequest) => req.user?.sub ?? req.ip,
  }
}

export async function inviteRoutes(app: FastifyInstance) {
  // POST /api/v1/customer/invites/place-search — Google Places search for
  // the invite form's business-picker. Mirrors the merchant location-search
  // flow's candidate-token pattern (searchInvitePlaces in ./service.ts):
  // the limiter fires BEFORE the billable Google call, and the response NEVER
  // carries the Google place id or lat/lng — only an opaque candidateToken.
  app.post(`${prefix}/place-search`, {
    config: { rateLimit: perCustomerRateLimit('invitePlaceSearch') },
  }, async (req: FastifyRequest, reply) => {
    if (!isInvitesEnabled()) return reply.callNotFound()

    const { query } = placeSearchBody.parse(req.body)
    const userId = req.user.sub

    const candidates = await searchInvitePlaces(app.redis, { userId, ip: req.ip }, query)
    return reply.send({ candidates })
  })

  // POST /api/v1/customer/invites — submit an invite. Either a resolved
  // candidateToken (Places-backed) or a free-text businessName is required;
  // an expired/unknown candidateToken is treated as absent (falls back to
  // businessName when supplied), mirroring how the merchant location flow
  // treats a missing/expired token as "no suggestion" rather than an error.
  app.post(prefix, {
    config: { rateLimit: perCustomerRateLimit('inviteSubmit') },
  }, async (req: FastifyRequest, reply) => {
    if (!isInvitesEnabled()) return reply.callNotFound()

    const body = submitBody.parse(req.body)
    const userId = req.user.sub

    // Per-IP abuser layer against multi-account submission farming (the
    // per-user tier + in-tx cap bound a single account; this bounds one
    // MACHINE running many accounts). Thresholds are development defaults;
    // PRODUCTION SIZING IS OWNER-GATED before INVITES_ENABLED flips.
    await consumeInviteSubmit(app.redis, { ip: req.ip })

    // Route-boundary zod-equivalent: at least one of candidateToken /
    // businessName must be present before any Redis/DB work happens.
    if (!body.candidateToken && !body.businessName) {
      throw new AppError('INVITE_BUSINESS_NAME_REQUIRED')
    }

    const resolvedCandidate = body.candidateToken
      ? await resolveInviteLocationCandidate(app.redis, userId, body.candidateToken)
      : null

    // Expired/unknown token -> treated as absent; fall back to the supplied
    // businessName. Neither present -> the same required-field error
    // submitInvite would throw anyway, raised here so the message is
    // consistent regardless of which lane produced the empty name.
    const businessNameRaw = resolvedCandidate?.name ?? body.businessName
    if (!businessNameRaw) {
      throw new AppError('INVITE_BUSINESS_NAME_REQUIRED')
    }

    const localityRaw    = resolvedCandidate?.locality ?? body.locality ?? null
    const googlePlaceId  = resolvedCandidate?.googlePlaceId ?? null

    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    })
    if (!user) throw new AppError('USER_NOT_FOUND')
    // A DELETED account is still holding a technically-valid access token
    // (the 15-minute JWT TTL outlives the deletion); the house convention
    // for "valid token, invalidated underlying account" is SESSION_REVOKED
    // (see src/api/auth/merchant/plugin.ts / src/api/redemption/routes.ts).
    if (user.status === 'DELETED') throw new AppError('SESSION_REVOKED')

    const result = await submitInvite(app.prisma, {
      userId,
      businessNameRaw,
      localityRaw,
      googlePlaceId,
      note: body.note ?? null,
      consentShareName: body.consentShareName,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    })

    if (result.kind === 'already_live') {
      return reply.send({
        status: 'already_live',
        merchant: { id: result.merchantId, businessName: result.businessName },
      })
    }
    return reply.send({ status: 'ok' })
  })

  // GET /api/v1/customer/invites/mine — the caller's own invites, newest
  // first, capped at 20. Deliberately excludes status / rewardEligible /
  // leadId / any moderation signal: HELD_REVIEW vs ACTIVE must be
  // indistinguishable to the inviter (pipeline-privacy invariant carried
  // over from M0's service.ts).
  app.get(`${prefix}/mine`, async (req: FastifyRequest, reply) => {
    if (!isInvitesEnabled()) return reply.callNotFound()

    const userId = req.user.sub
    const rows = await app.prisma.merchantInvite.findMany({
      where: { inviterUserId: userId, anonymisedAt: null },
      select: { id: true, businessNameRaw: true, localityRaw: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return reply.send(
      rows.map((r) => ({
        id: r.id,
        businessName: r.businessNameRaw,
        locality: r.localityRaw,
        createdAt: r.createdAt,
      })),
    )
  })
}
