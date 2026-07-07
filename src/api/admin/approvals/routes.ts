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
  getReviewContext,
} from './service'
import { approveEdit, rejectEdit, getEditReviewContext } from './editApplier'
import {
  approveBranchLifecycle,
  rejectBranchLifecycle,
  getBranchLifecycleReviewContext,
} from './branchLifecycleApplier'
import {
  getVoucherReviewContext,
  approveVoucher,
  rejectVoucher,
  requestVoucherChanges,
} from './voucherApprover'

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
        // Voucher governed flows: VOUCHER_EDIT filterable in the queue; WITHDRAWN
        // filterable so withdrawn rows can be listed (they are terminal — the
        // claim/action guards never match them). (BRANCH_CREATE / BRANCH_CLOSE
        // were already absent from this filter enum before this slice — a
        // pre-existing gap, deliberately not widened here.)
        type: z
          .enum(['MERCHANT_ONBOARDING', 'VOUCHER', 'MERCHANT_PROFILE_EDIT', 'MERCHANT_IDENTITY_EDIT', 'BRANCH_IDENTITY_EDIT', 'VOUCHER_EDIT'])
          .optional(),
        status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'WITHDRAWN']).optional(),
        claimedById: z.string().min(1).optional(),
        referenceId: z.string().min(1).optional(),
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

  // M4 — full review context (merchant profile, owner, branches, vouchers,
  // documents with presigned GET URLs, checklist, thin-area signals, activity).
  // Read-only; gated on approval:read (same as the queue list/detail routes).
  app.get(`${prefix}/:id/review`, { preHandler: [requireAdminCapability('approval:read')] }, async (req: any) => {
    return getReviewContext(app.prisma, idParam(req))
  })

  app.post(`${prefix}/:id/claim`, { preHandler: [requireAdminCapability('approval:action')] }, async (req: any) => {
    return claimApproval(app.prisma, idParam(req), req.user.sub, auditCtx(req))
  })

  app.post(`${prefix}/:id/release`, { preHandler: [requireAdminCapability('approval:action')] }, async (req: any) => {
    return releaseApproval(app.prisma, idParam(req), req.user.sub, req.user.adminRole, auditCtx(req))
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

  // Option B B1: pending-edit applier (MERCHANT_IDENTITY_EDIT /
  // BRANCH_IDENTITY_EDIT). Gated on its own approval:apply-edit capability so an
  // edit-applier role need not also hold the onboarding go-live/reject actions.
  // The field diff read reuses approval:read.
  app.get(`${prefix}/:id/edit-review`, { preHandler: [requireAdminCapability('approval:read')] }, async (req: any) => {
    return getEditReviewContext(app.prisma, idParam(req))
  })

  app.post(`${prefix}/:id/approve-edit`, { preHandler: [requireAdminCapability('approval:apply-edit')] }, async (req: any) => {
    return approveEdit(app.prisma, app.redis, idParam(req), req.user.sub, auditCtx(req))
  })

  app.post(`${prefix}/:id/reject-edit`, { preHandler: [requireAdminCapability('approval:apply-edit')] }, async (req: any) => {
    return rejectEdit(app.prisma, app.redis, idParam(req), req.user.sub, reasonBody(req), auditCtx(req))
  })

  // Branches PR-5 (D5): the branch-lifecycle applier (BRANCH_CREATE /
  // BRANCH_CLOSE). Gated on the SAME approval:apply-edit capability as the
  // edit applier (the actioner capability the spec §7 names) so an edit-applier
  // role can also action branch lifecycle without holding the onboarding go-live.
  // CREATE-approve additionally requires the admin to have confirmed the branch
  // location via the separate confirm-location flow (branch:confirm-location) —
  // the gate is enforced server-side inside the applier (MAIN_BRANCH_LOCATION_UNCONFIRMED).
  // A non-branch-lifecycle approval id surfaces APPROVAL_NOT_ACTIONABLE.
  // The branch-lifecycle review read (mirrors GET /:id/review + /:id/edit-review +
  // /:id/voucher-review). Returns the proposed/target branch + its merchant +
  // closeReason so the actioner can render the BRANCH_CREATE / BRANCH_CLOSE review
  // screen. Read-only; gated on approval:read. NEVER returns redemptionPin.
  // A non-branch-lifecycle approval id surfaces APPROVAL_NOT_ACTIONABLE.
  app.get(`${prefix}/:id/branch-lifecycle-review`, { preHandler: [requireAdminCapability('approval:read')] }, async (req: any) => {
    return getBranchLifecycleReviewContext(app.prisma, idParam(req))
  })

  app.post(`${prefix}/:id/approve-branch-lifecycle`, { preHandler: [requireAdminCapability('approval:apply-edit')] }, async (req: any) => {
    return approveBranchLifecycle(app.prisma, app.redis, idParam(req), req.user.sub, auditCtx(req))
  })

  app.post(`${prefix}/:id/reject-branch-lifecycle`, { preHandler: [requireAdminCapability('approval:apply-edit')] }, async (req: any) => {
    return rejectBranchLifecycle(app.prisma, app.redis, idParam(req), req.user.sub, reasonBody(req), auditCtx(req))
  })

  // Day-2 Vouchers A8: the VOUCHER approval lane. Mirrors the editApplier route
  // registrations. The review read reuses approval:read; the three decisions
  // reuse approval:action (the SAME capability as the onboarding actioner - no
  // new capability per the no-schema model). A non-VOUCHER approval id surfaces
  // APPROVAL_NOT_ACTIONABLE from voucherApprover.
  app.get(`${prefix}/:id/voucher-review`, { preHandler: [requireAdminCapability('approval:read')] }, async (req: any) => {
    return getVoucherReviewContext(app.prisma, idParam(req))
  })

  app.post(`${prefix}/:id/approve-voucher`, { preHandler: [requireAdminCapability('approval:action')] }, async (req: any) => {
    return approveVoucher(app.prisma, app.redis, idParam(req), req.user.sub, auditCtx(req))
  })

  app.post(`${prefix}/:id/reject-voucher`, { preHandler: [requireAdminCapability('approval:action')] }, async (req: any) => {
    return rejectVoucher(app.prisma, app.redis, idParam(req), req.user.sub, reasonBody(req), auditCtx(req))
  })

  app.post(`${prefix}/:id/request-voucher-changes`, { preHandler: [requireAdminCapability('approval:action')] }, async (req: any) => {
    const body = z
      .object({
        proposed: z.record(z.string(), z.unknown()).optional(),
        note: z.string().min(1).max(2000),
      })
      .parse(req.body)
    return requestVoucherChanges(app.prisma, app.redis, idParam(req), req.user.sub, body, auditCtx(req))
  })
}
