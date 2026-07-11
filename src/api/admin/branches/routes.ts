import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError } from '../../shared/errors'
import { requireAdminCapability } from '../capability'
import { assertFieldPreLiveScope } from '../prelive-scope'
import { confirmBranchLocation } from './service'
import { resolveTargetMerchantForAdmin } from '../../merchant/shared'
import { updateBranchDirectCore, softDeleteBranchCore } from '../../merchant/branch/service'

export async function adminBranchRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/admin/branches'

  // Admin location pin-drop fallback (M4, slice spec §8 / Q7). authenticateAdmin
  // is applied by the admin-management plugin scope; this route additionally
  // requires the `branch:confirm-location` capability.
  app.post(
    `${prefix}/:id/confirm-location`,
    { preHandler: [requireAdminCapability('branch:confirm-location')] },
    async (req: any, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params)
      const body = z
        .object({
          latitude: z.number().gte(-90).lte(90),
          longitude: z.number().gte(-180).lte(180),
        })
        .parse(req.body)

      const result = await confirmBranchLocation(app.prisma, req.user.sub, id, body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? '',
      })
      return reply.status(200).send(result)
    },
  )

  // Option B B2.1: admin direct-edit-on-behalf of a branch's simple-DIRECT
  // fields (phone / email / websiteUrl / isActive). STRICT body so an extra key
  // 400s before the service runs; a non-empty reason is required and lands on the
  // audit row. The branch's merchant is loaded so resolveTargetMerchantForAdmin
  // can run (SUSPENDED allowed). The shared core does the validation/apply/audit
  // (the SAME path the merchant route runs, no weaker path).
  app.patch(
    `${prefix}/:branchId`,
    { preHandler: [requireAdminCapability('merchant:edit')] },
    async (req: any) => {
      const { branchId } = z.object({ branchId: z.string().min(1) }).parse(req.params)
      const body = z
        .object({
          phone: z.string().nullable().optional(),
          email: z.string().email().nullable().optional(),
          websiteUrl: z.string().url().nullable().optional(),
          isActive: z.boolean().optional(),
          reason: z.string().trim().min(1),
        })
        .strict()
        .parse(req.body)

      const b = await app.prisma.branch.findFirst({
        where: { id: branchId, deletedAt: null },
        select: { merchantId: true },
      })
      if (!b) throw new AppError('BRANCH_NOT_FOUND')
      await resolveTargetMerchantForAdmin(app.prisma, b.merchantId)
      // S3 defence-in-depth: a FIELD rep may edit a branch only for a PRE-LIVE
      // merchant. The route resolved the owning merchantId from branchId above.
      await assertFieldPreLiveScope(app.prisma, req.user.adminRole, b.merchantId)

      const data: Record<string, unknown> = {}
      if ('phone' in body) data.phone = body.phone
      if ('email' in body) data.email = body.email
      if ('websiteUrl' in body) data.websiteUrl = body.websiteUrl
      if ('isActive' in body) data.isActive = body.isActive

      return updateBranchDirectCore(
        app.prisma,
        { merchantId: b.merchantId, actor: { type: 'ADMIN', id: req.user.sub, reason: body.reason } },
        branchId,
        data,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '' },
      )
    },
  )

  // Option B B2.4: admin soft-delete a branch on the merchant's behalf. Gated
  // SUPER_ADMIN-only (`merchant:manage-branches`). POST (not DELETE-with-body):
  // no DELETE-body precedent in the codebase, all admin action routes are POST,
  // and DELETE request bodies are unreliable through proxies. The route resolves
  // the branch's merchant first (it only has the branchId), then the shared core
  // (softDeleteBranchCore) runs the guards (BRANCH_IS_MAIN / BRANCH_LAST_ACTIVE)
  // + the atomic cascade (branch-user deactivation + soft-delete + audit). Actor-
  // attributed, entityType:'branch'. resolveTargetMerchantForAdmin allows SUSPENDED.
  app.post(
    `${prefix}/:branchId/delete`,
    { preHandler: [requireAdminCapability('merchant:manage-branches')] },
    async (req: any) => {
      const { branchId } = z.object({ branchId: z.string().min(1) }).parse(req.params)
      const { reason } = z.object({ reason: z.string().trim().min(1) }).strict().parse(req.body)

      const b = await app.prisma.branch.findFirst({
        where: { id: branchId, deletedAt: null },
        select: { merchantId: true },
      })
      if (!b) throw new AppError('BRANCH_NOT_FOUND')
      await resolveTargetMerchantForAdmin(app.prisma, b.merchantId)
      // S3 defence-in-depth: a FIELD rep may delete a branch only for a PRE-LIVE
      // merchant. The route resolved the owning merchantId from branchId above.
      await assertFieldPreLiveScope(app.prisma, req.user.adminRole, b.merchantId)

      return softDeleteBranchCore(
        app.prisma,
        { merchantId: b.merchantId, actor: { type: 'ADMIN', id: req.user.sub, reason } },
        branchId,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '' },
      )
    },
  )
}
