import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import '../types'
import { resolveMerchantContext, assertOwner } from '../shared'
import {
  listMembers,
  inviteMember,
  updateMemberAccess,
  deactivateMember,
  reactivateMember,
  removeMember,
  resendInvite,
  listStaffAppUsers,
} from './service'

// Staff & Access (v1) PR-B — owner-only portal membership management + the
// read-only app-user surface. Every handler resolves the caller via
// `resolveMerchantContext` then `assertOwner(ctx)` (owner-only management in v1,
// D7) BEFORE doing any work — a non-owner is denied with INSUFFICIENT_PERMISSIONS
// (403). The resolved `ctx` (caller role/scope) + the request meta are handed to
// the service so role-elevation guards run server-side.
export async function staffRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/staff'

  const reqMeta = (req: FastifyRequest) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '' })

  // Resolve + owner-gate the caller once per handler.
  async function ownerCtx(req: FastifyRequest) {
    const ctx = await resolveMerchantContext(app.prisma, req.user.sub)
    assertOwner(ctx)
    return ctx
  }

  // GET /staff — list portal members (curated; never passwordHash).
  app.get(prefix, async (req: FastifyRequest, reply) => {
    await ownerCtx(req)
    const members = await listMembers(app.prisma, req.user.sub)
    return reply.send({ members })
  })

  // GET /staff/app-users — read-only BranchUser surface (locked shape; PR-C consumes verbatim).
  app.get(`${prefix}/app-users`, async (req: FastifyRequest, reply) => {
    const ctx = await ownerCtx(req)
    const result = await listStaffAppUsers(app.prisma, ctx.merchantId)
    return reply.send(result)
  })

  // POST /staff — invite a portal member.
  app.post(prefix, async (req: FastifyRequest, reply) => {
    const ctx = await ownerCtx(req)
    // The service zod-validates the body; accept the raw object here.
    const body = z.record(z.string(), z.unknown()).parse(req.body)
    const result = await inviteMember(app.prisma, app.redis, req.user.sub, body as any, { ...ctx, ...reqMeta(req) })
    return reply.status(201).send(result)
  })

  // PATCH /staff/:id — edit access (role / scope / canManageVouchers).
  app.patch(`${prefix}/:id`, async (req: FastifyRequest, reply) => {
    const ctx = await ownerCtx(req)
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const body = z.record(z.string(), z.unknown()).parse(req.body)
    const result = await updateMemberAccess(app.prisma, app.redis, req.user.sub, id, body as any, { ...ctx, ...reqMeta(req) })
    return reply.send(result)
  })

  // POST /staff/:id/deactivate.
  app.post(`${prefix}/:id/deactivate`, async (req: FastifyRequest, reply) => {
    const ctx = await ownerCtx(req)
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const result = await deactivateMember(app.prisma, app.redis, req.user.sub, id, { ...ctx, ...reqMeta(req) })
    return reply.send(result)
  })

  // POST /staff/:id/reactivate.
  app.post(`${prefix}/:id/reactivate`, async (req: FastifyRequest, reply) => {
    const ctx = await ownerCtx(req)
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const result = await reactivateMember(app.prisma, app.redis, req.user.sub, id, { ...ctx, ...reqMeta(req) })
    return reply.send(result)
  })

  // DELETE /staff/:id — remove from team (soft, status DELETED).
  app.delete(`${prefix}/:id`, async (req: FastifyRequest, reply) => {
    const ctx = await ownerCtx(req)
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const result = await removeMember(app.prisma, app.redis, req.user.sub, id, { ...ctx, ...reqMeta(req) })
    return reply.send(result)
  })

  // POST /staff/:id/resend-invite — only for unclaimed members.
  app.post(`${prefix}/:id/resend-invite`, async (req: FastifyRequest, reply) => {
    const ctx = await ownerCtx(req)
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const result = await resendInvite(app.prisma, app.redis, req.user.sub, id, { ...ctx, ...reqMeta(req) })
    return reply.send(result)
  })
}
