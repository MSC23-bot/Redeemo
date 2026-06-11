import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdminCapability } from '../capability'
import {
  listApprovals,
  getApproval,
  claimApproval,
  releaseApproval,
  requestChanges,
  rejectApproval,
  approveApproval,
} from './service'

// Phase 2 Slice 1 M3 — actioner review-loop routes. `authenticateAdmin` is
// applied by the admin-management plugin scope; each route adds its capability.
// Reads need `approval:read`; state changes need `approval:action`.
export async function adminApprovalRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/admin/approvals'
  const auditCtx = (req: any) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '' })
  const idParam = (req: any) => z.object({ id: z.string().min(1) }).parse(req.params).id
  const reasonBody = (req: any) => z.object({ reason: z.string().min(1).max(2000) }).parse(req.body).reason

  app.get(prefix, { preHandler: [requireAdminCapability('approval:read')] }, async (req: any) => {
    const q = z
      .object({
        type: z
          .enum(['MERCHANT_ONBOARDING', 'VOUCHER', 'MERCHANT_PROFILE_EDIT', 'MERCHANT_IDENTITY_EDIT', 'BRANCH_IDENTITY_EDIT'])
          .optional(),
        status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED']).optional(),
        claimedById: z.string().min(1).optional(),
        olderThanMinutes: z.coerce.number().int().positive().optional(),
        page: z.coerce.number().int().positive().optional(),
        pageSize: z.coerce.number().int().positive().max(100).optional(),
      })
      .parse(req.query)
    return listApprovals(app.prisma, q)
  })

  app.get(`${prefix}/:id`, { preHandler: [requireAdminCapability('approval:read')] }, async (req: any) => {
    return getApproval(app.prisma, idParam(req))
  })

  app.post(`${prefix}/:id/claim`, { preHandler: [requireAdminCapability('approval:action')] }, async (req: any) => {
    return claimApproval(app.prisma, idParam(req), req.user.sub, auditCtx(req))
  })

  app.post(`${prefix}/:id/release`, { preHandler: [requireAdminCapability('approval:action')] }, async (req: any) => {
    return releaseApproval(app.prisma, idParam(req), req.user.sub, auditCtx(req))
  })

  app.post(`${prefix}/:id/request-changes`, { preHandler: [requireAdminCapability('approval:action')] }, async (req: any) => {
    return requestChanges(app.prisma, app.redis, idParam(req), req.user.sub, reasonBody(req), auditCtx(req))
  })

  app.post(`${prefix}/:id/reject`, { preHandler: [requireAdminCapability('approval:action')] }, async (req: any) => {
    return rejectApproval(app.prisma, app.redis, idParam(req), req.user.sub, reasonBody(req), auditCtx(req))
  })

  // M5 — approve → atomic go-live (no reason body). Same capability as the
  // other state-changing actions.
  app.post(`${prefix}/:id/approve`, { preHandler: [requireAdminCapability('approval:action')] }, async (req: any) => {
    return approveApproval(app.prisma, app.redis, idParam(req), req.user.sub, auditCtx(req))
  })
}
