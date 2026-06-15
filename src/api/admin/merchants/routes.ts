import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { emailSchema } from '../../shared/schemas'
import { requireAdminCapability } from '../capability'
import { createMerchantDraft, suspendMerchant, reactivateMerchant, listMerchants, getMerchantDetail, listAdminCategories } from './service'
import { issueMerchantClaim } from '../../auth/merchant/service'
import { resolveTargetMerchantForAdmin } from '../../merchant/shared'
import { updateMerchantProfileDirectCore, setMerchantCategoryCore } from '../../merchant/profile/service'

export async function adminMerchantRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/admin/merchants'

  // WP2 — read-only merchants directory (list + name/status search). Gated on
  // `merchant:read` (NOT the destructive `merchant:suspend`). Shares `prefix`
  // with the create-draft POST below: same path, different method, so they
  // coexist. The service select is redacted (no secrets) — see listMerchants.
  app.get(prefix, { preHandler: [requireAdminCapability('merchant:read')] }, async (req: any) => {
    const query = z
      .object({
        q: z.string().trim().min(1).max(200).optional(),
        status: z
          .enum(['REGISTERED', 'PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED'])
          .optional(),
        page: z.coerce.number().int().positive().optional(),
        pageSize: z.coerce.number().int().positive().max(100).optional(),
      })
      .parse(req.query)
    return listMerchants(app.prisma, query)
  })

  // Option B B2.1-read: single merchant detail for the admin edit page
  // (B2.1-web). Gated `merchant:read` (same as the directory). The service uses
  // a TIGHT redacted select: branches are joined but `redemptionPin` and other
  // branch secrets are NEVER returned (see getMerchantDetail). 404
  // MERCHANT_NOT_FOUND if absent. Distinct path from GET `prefix` (the list).
  app.get(`${prefix}/:id`, { preHandler: [requireAdminCapability('merchant:read')] }, async (req: any) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params)
    return getMerchantDetail(app.prisma, id)
  })

  // Option B B2.3-read: categories assignable as a merchant's primaryCategoryId,
  // each with an `eligible` flag (>= 2 active RMV templates). Gated `merchant:read`
  // (same as the directory + detail). Sibling path to the `${prefix}` routes;
  // registered here for proximity to the merchant-detail consumer. No params.
  app.get('/api/v1/admin/categories', { preHandler: [requireAdminCapability('merchant:read')] }, async () => {
    return listAdminCategories(app.prisma)
  })

  // Create a merchant draft on the owner's behalf (M2, D-3). authenticateAdmin
  // is applied by the admin-management plugin scope; this route additionally
  // requires the `merchant:create-draft` capability.
  app.post(prefix, { preHandler: [requireAdminCapability('merchant:create-draft')] }, async (req: any, reply) => {
    const body = z
      .object({
        businessName: z.string().min(1),
        tradingName: z.string().optional(),
        ownerEmail: emailSchema,
        ownerFirstName: z.string().min(1),
        ownerLastName: z.string().min(1),
        jobTitle: z.string().optional(),
      })
      .parse(req.body)

    const result = await createMerchantDraft(app.prisma, req.user.sub, body, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    // Queue the owner's claim email (set-password link) via the notify outbox.
    // Best-effort: the draft is already committed, so a claim-issue failure must
    // not fail the response. The claim token is NEVER part of `result`.
    try {
      await issueMerchantClaim(app.prisma, app.redis, {
        adminId: result.ownerAdminId, email: result.ownerEmail, ip: req.ip,
      })
    } catch (err) {
      app.log.warn({ err, merchantId: result.merchantId }, '[draft] claim email issue failed — draft created without claim')
    }
    return reply.status(201).send(result)
  })

  const idParam = (req: any) => z.object({ id: z.string().min(1) }).parse(req.params).id
  const auditCtx = (req: any) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '' })

  // M6a — admin suspend (safe takedown). Cap `merchant:suspend`.
  app.post(`${prefix}/:id/suspend`, { preHandler: [requireAdminCapability('merchant:suspend')] }, async (req: any) => {
    const { reason } = z.object({ reason: z.string().min(1).max(2000) }).parse(req.body)
    return suspendMerchant(app.prisma, app.redis, req.user.sub, idParam(req), reason, auditCtx(req))
  })

  // M6a — admin reactivate (reverse of suspend). Same capability.
  app.post(`${prefix}/:id/reactivate`, { preHandler: [requireAdminCapability('merchant:suspend')] }, async (req: any) => {
    return reactivateMerchant(app.prisma, req.user.sub, idParam(req), auditCtx(req))
  })

  // Option B B2.1: admin direct-edit-on-behalf of a merchant's simple-DIRECT
  // fields. The admin allow-list is NARROWER than the merchant DIRECT set:
  // websiteUrl ONLY (vatNumber / companyNumber / primaryCategoryId are out of
  // B2.1 scope). STRICT body so any extra key (e.g. businessName / companyNumber
  // / vatNumber) 400s before the service runs. A non-empty reason is required and
  // lands on the audit row. The shared core does the validation/apply/audit (the
  // SAME path the merchant route runs, no weaker path). resolveTargetMerchant-
  // ForAdmin allows a SUSPENDED merchant (admins may edit for operational fixes).
  app.patch(`${prefix}/:id/profile`, { preHandler: [requireAdminCapability('merchant:edit')] }, async (req: any) => {
    const body = z
      .object({
        websiteUrl: z.string().url().nullable().optional(),
        reason: z.string().trim().min(1),
      })
      .strict()
      .parse(req.body)

    const id = idParam(req)
    await resolveTargetMerchantForAdmin(app.prisma, id)

    const updates: Record<string, unknown> = {}
    if ('websiteUrl' in body) updates.websiteUrl = body.websiteUrl

    return updateMerchantProfileDirectCore(
      app.prisma,
      { merchantId: id, actor: { type: 'ADMIN', id: req.user.sub, reason: body.reason } },
      updates,
      auditCtx(req),
    )
  })

  // Option B B2.2: admin edit of a merchant's registered identity fields
  // (vatNumber / companyNumber) on the merchant's behalf. Gated on the
  // SUPER_ADMIN-only `merchant:edit-identity` capability (NOT the broader
  // `merchant:edit`). STRICT body: only vat/company + reason + confirm; any other
  // key (e.g. websiteUrl / businessName) 400s before the service runs.
  // `confirm: true` is required (backend confirmation, not just the UI checkbox).
  // The shared core does the validation/apply/audit (the SAME path the merchant +
  // B2.1 routes run, no weaker path), tagged with the distinct
  // MERCHANT_IDENTITY_UPDATED event. resolveTargetMerchantForAdmin allows a
  // SUSPENDED merchant (admins may correct identity for operational fixes).
  app.patch(`${prefix}/:id/identity`, { preHandler: [requireAdminCapability('merchant:edit-identity')] }, async (req: any) => {
    const body = z
      .object({
        vatNumber: z.string().trim().min(1).nullable().optional(),
        companyNumber: z.string().trim().min(1).nullable().optional(),
        reason: z.string().trim().min(1),
        confirm: z.literal(true),
      })
      .strict()
      .parse(req.body)

    const id = idParam(req)
    await resolveTargetMerchantForAdmin(app.prisma, id)

    const updates: Record<string, unknown> = {}
    if ('vatNumber' in body) updates.vatNumber = body.vatNumber
    if ('companyNumber' in body) updates.companyNumber = body.companyNumber

    return updateMerchantProfileDirectCore(
      app.prisma,
      { merchantId: id, actor: { type: 'ADMIN', id: req.user.sub, reason: body.reason } },
      updates,
      auditCtx(req),
      'MERCHANT_IDENTITY_UPDATED',
    )
  })

  // Option B B2.3: admin set/change of a merchant's primaryCategoryId on the
  // merchant's behalf. Gated SUPER_ADMIN-only (`merchant:edit-category`).
  // Category change has RMV-provisioning side effects (it discards DRAFT RMVs and
  // reprovisions 2 mandatory vouchers). STRICT body: primaryCategoryId + optional
  // confirm + required reason. The shared core (setMerchantCategoryCore) runs the
  // first-set provisioning OR handleCategoryChange (block / requiresConfirmation /
  // apply) with actor-attributed audit - the SAME path the merchant route runs (no
  // weaker path). resolveTargetMerchantForAdmin allows a SUSPENDED merchant. The
  // change path is still BLOCKED if any RMV is submitted/active (CATEGORY_CHANGE_
  // BLOCKED) - intentional; a live merchant's category is locked.
  app.patch(`${prefix}/:id/category`, { preHandler: [requireAdminCapability('merchant:edit-category')] }, async (req: any) => {
    const body = z
      .object({
        primaryCategoryId: z.string().min(1),
        confirm: z.boolean().optional(),
        reason: z.string().trim().min(1),
      })
      .strict()
      .parse(req.body)

    const id = idParam(req)
    await resolveTargetMerchantForAdmin(app.prisma, id)

    return setMerchantCategoryCore(
      app.prisma,
      { merchantId: id, actor: { type: 'ADMIN', id: req.user.sub, reason: body.reason } },
      body.primaryCategoryId,
      body.confirm === true,
      auditCtx(req),
    )
  })
}
