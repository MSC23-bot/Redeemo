import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { emailSchema } from '../../shared/schemas'
import { requireAdminCapability } from '../capability'
import { assertFieldPreLiveScope } from '../prelive-scope'
import { createMerchantDraft, suspendMerchant, reactivateMerchant, listMerchants, getMerchantDetail, listAdminCategories, listAdminRmvVouchers, listAdminCustomVouchers, listAdminStaff } from './service'
import { updateRmvVoucherCore, submitRmvVoucherCore } from '../../merchant/voucher/service'
import { issueMerchantClaim } from '../../auth/merchant/service'
import { resolveTargetMerchantForAdmin } from '../../merchant/shared'
import { updateMerchantProfileDirectCore, setMerchantCategoryCore, createMerchantEditRequestCore } from '../../merchant/profile/service'
import { createBranchCore, toAdminBranchShape } from '../../merchant/branch/service'
import { submitForApprovalCore } from '../../merchant/onboarding/service'
import { signAgreementInPerson } from '../../merchant/agreement/service'
import { AppError } from '../../shared/errors'
import { isStorageEnabled, kindPolicy } from '../../shared/storage'
import { listMerchantDocuments, createMerchantDocument, deleteMerchantDocument } from './documents'

const DOCUMENT_TYPES = ['BUSINESS_VERIFICATION_1', 'BUSINESS_VERIFICATION_2', 'PRICE_LIST', 'AGREEMENT'] as const

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
    // S3 defence-in-depth: a FIELD rep may edit only a PRE-LIVE merchant.
    await assertFieldPreLiveScope(app.prisma, req.user.adminRole, id)

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

  // Option B B2.4: admin create a branch on the merchant's behalf. Gated
  // SUPER_ADMIN-only (`merchant:manage-branches`). STRICT body: the create fields
  // + required reason; latitude/longitude are NOT accepted (location resolves from
  // the postcode; pin-precise correction is the separate confirm-location flow).
  // The shared core (createBranchCore) does the validation/provisioning/audit (the
  // SAME path the merchant route runs, no weaker path), actor-attributed +
  // entityType:'branch'. The response is the TIGHT redacted shape (no
  // redemptionPin/secrets). resolveTargetMerchantForAdmin allows SUSPENDED.
  app.post(`${prefix}/:id/branches`, { preHandler: [requireAdminCapability('merchant:manage-branches')] }, async (req: any) => {
    const body = z
      .object({
        name: z.string().min(1),
        addressLine1: z.string().min(1),
        addressLine2: z.string().optional(),
        city: z.string().min(1),
        postcode: z.string().min(1),
        country: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        websiteUrl: z.string().optional(),
        reason: z.string().trim().min(1),
      })
      .strict()
      .parse(req.body)

    const id = idParam(req)
    await resolveTargetMerchantForAdmin(app.prisma, id)
    // S3 defence-in-depth: a FIELD rep may add a branch only for a PRE-LIVE merchant.
    await assertFieldPreLiveScope(app.prisma, req.user.adminRole, id)

    const { reason, ...data } = body
    const branch = await createBranchCore(
      app.prisma,
      { merchantId: id, actor: { type: 'ADMIN', id: req.user.sub, reason } },
      data,
      auditCtx(req),
    )
    return toAdminBranchShape(branch)
  })

  // Option B B2.5: admin PROPOSE a change to a merchant's SENSITIVE identity text
  // fields on the merchant's behalf. This does NOT mutate directly; it routes the
  // proposal into the EXISTING B1 pending-edit lane (creates a MerchantPendingEdit
  // + an AdminApproval) which an admin then reviews + applies/rejects via the B1
  // applier (approval:apply-edit). Gated SUPER_ADMIN-only (merchant:propose-edit),
  // distinct from the apply cap. STRICT body: only the 3 text fields + required
  // reason (logoUrl/bannerUrl are asset territory and 400 here). The shared core
  // does the validation/create/audit (the SAME path the merchant route runs, no
  // weaker path). resolveTargetMerchantForAdmin allows SUSPENDED.
  app.post(`${prefix}/:id/edit-request`, { preHandler: [requireAdminCapability('merchant:propose-edit')] }, async (req: any) => {
    const body = z
      .object({
        businessName: z.string().trim().min(1).optional(),
        tradingName: z.string().trim().min(1).optional(),
        description: z.string().trim().min(1).optional(),
        reason: z.string().trim().min(1),
      })
      .strict()
      .parse(req.body)

    const id = idParam(req)
    await resolveTargetMerchantForAdmin(app.prisma, id)

    const { reason, ...proposed } = body
    const pendingEdit = await createMerchantEditRequestCore(
      app.prisma,
      { merchantId: id, actor: { type: 'ADMIN', id: req.user.sub, reason } },
      proposed,
      auditCtx(req),
    )
    return { pendingEditId: pendingEdit.id }
  })

  // Option B B3: admin submit-for-approval on the merchant's behalf. Gated
  // OPERATIONS-level (`merchant:submit`, in ALL_SLICE1_CAPS) — an operational
  // lifecycle action (like create-draft / suspend), NOT approval. Reuses the LIVE
  // submit core (no weaker path): the SAME status gate + the SAME onboarding
  // checklist (branch + contract SIGNED + RMV). B3 adds NO new gates and NO admin
  // contract-signing — an unsigned merchant simply fails ONBOARDING_GATES_INCOMPLETE.
  // STRICT body = reason only. resolveTargetMerchantForAdmin allows a SUSPENDED
  // merchant; the core's status gate then yields ALREADY_SUBMITTED for any
  // non-submittable state. Audited actorType ADMIN + reason. B3 only QUEUES —
  // claim + go-live remain the separate actioner flow (approval:action).
  app.post(`${prefix}/:id/submit`, { preHandler: [requireAdminCapability('merchant:submit')] }, async (req: any) => {
    const { reason } = z.object({ reason: z.string().trim().min(1) }).strict().parse(req.body)
    const id = idParam(req)
    await resolveTargetMerchantForAdmin(app.prisma, id)
    // S3 defence-in-depth: a FIELD rep may submit only a PRE-LIVE merchant.
    await assertFieldPreLiveScope(app.prisma, req.user.adminRole, id)
    const updated = await submitForApprovalCore(
      app.prisma,
      app.redis,
      { merchantId: id, actor: { type: 'ADMIN', id: req.user.sub, reason } },
      auditCtx(req),
    )
    // Slim response (M1): the merchant lifecycle fields only. The Merchant row has
    // no secrets (the PIN lives on Branch), so this is a redaction of convenience,
    // not of safety — the UI just needs the new state.
    return {
      id: updated.id,
      status: updated.status,
      onboardingStep: updated.onboardingStep,
      verificationStatus: updated.verificationStatus,
    }
  })

  // ── D65: in-person assisted contract-signing ceremony ────────────────────────
  //
  // The rep (req.user.sub) WITNESSES the owner's signature on the rep's device: the
  // owner's typed name is the signature of record; the rep is recorded as actorAdminId
  // (witness), NEVER the signer (admin-never-signs lock). FIX 2: the witness IDENTITY is
  // NOT client-supplied; the service looks up the authenticated rep's name + email from
  // AdminUser server-side and persists THAT as evidence. Gated on the operational
  // `merchant:sign-agreement` cap (OPERATIONS + FIELD). resolveTargetMerchantForAdmin
  // 404s an unknown merchant; assertFieldPreLiveScope clamps FIELD to PRE-LIVE
  // merchants (signing happens during onboarding). The fail-closed
  // AGREEMENT_LEGAL_REVIEW_REQUIRED gate (in the service) refuses production binding
  // writes while legal review is pending; staging/dev run fully, DRAFT-watermarked.
  // STRICT body: the typed name + authority role (+ optional explicit version). No
  // `reason` (the ceremony IS the act; the audit carries version + hash metadata). No
  // `witnessLabel` (FIX 2: witness identity is authenticated server-side, not request text).
  app.post(`${prefix}/:id/agreement/sign`, { preHandler: [requireAdminCapability('merchant:sign-agreement')] }, async (req: any) => {
    const body = z
      .object({
        signerName: z.string().trim().min(1),
        signerRoleConfirmation: z.string().trim().min(1),
        agreementVersion: z.string().min(1).optional(),
      })
      .strict()
      .parse(req.body)

    const id = idParam(req)
    await resolveTargetMerchantForAdmin(app.prisma, id)
    // S3 defence-in-depth: a FIELD rep may witness signing only for a PRE-LIVE merchant.
    await assertFieldPreLiveScope(app.prisma, req.user.adminRole, id)

    return signAgreementInPerson(
      app.prisma,
      {
        merchantId: id,
        actorAdminId: req.user.sub,
        signerName: body.signerName,
        signerRoleConfirmation: body.signerRoleConfirmation,
        agreementVersion: body.agreementVersion,
      },
      auditCtx(req),
    )
  })

  // ── Option B B4: admin merchant documents (upload / view / delete on behalf) ──

  // Read: list the merchant's documents with short-lived presigned GET URLs. Gated
  // on `merchant:read` (D4a): OPERATIONS can VIEW, consistent with the M4 review
  // screen. The raw R2 key (`fileUrl`) is NEVER returned; `available:false`/`url:null`
  // when storage is dark or a presign fails (mirrors getReviewContext).
  app.get(`${prefix}/:id/documents`, { preHandler: [requireAdminCapability('merchant:read')] }, async (req: any) => {
    const id = idParam(req)
    await resolveTargetMerchantForAdmin(app.prisma, id)
    return listMerchantDocuments(app.prisma, id)
  })

  // Upload: server-proxied multipart upload of a verification document on the
  // merchant's behalf. Gated SUPER_ADMIN-only (`merchant:manage-documents`, D3).
  // Fails closed with STORAGE_NOT_ENABLED BEFORE reading any bytes when storage is
  // dark. The API holds the bytes, so content-type + size are HARD-validated
  // server-side (the multipart layer also caps fileSize). Form fields:
  // `documentType` (the existing enum), `reason` (mandatory, audited), and one file.
  app.post(`${prefix}/:id/documents`, { preHandler: [requireAdminCapability('merchant:manage-documents')] }, async (req: any) => {
    if (!isStorageEnabled()) throw new AppError('STORAGE_NOT_ENABLED')
    const id = idParam(req)
    await resolveTargetMerchantForAdmin(app.prisma, id)
    // S3 defence-in-depth: a FIELD rep may upload documents only for a PRE-LIVE merchant.
    await assertFieldPreLiveScope(app.prisma, req.user.adminRole, id)

    if (!req.isMultipart()) throw new AppError('FILE_REQUIRED')

    let documentType: string | undefined
    let reason: string | undefined
    let fileBuffer: Buffer | undefined
    let mimetype: string | undefined
    try {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          mimetype = part.mimetype
          fileBuffer = await part.toBuffer() // throws if the part exceeds limits.fileSize
        } else if (part.fieldname === 'documentType') {
          documentType = String(part.value)
        } else if (part.fieldname === 'reason') {
          reason = String(part.value)
        }
      }
    } catch (err: any) {
      const code = typeof err?.code === 'string' ? err.code : ''
      if (code === 'FST_REQ_FILE_TOO_LARGE') throw new AppError('FILE_TOO_LARGE')
      // Any OTHER @fastify/multipart parser error (too many files / fields / parts,
      // malformed body) is a client error, not a 500. Multipart error codes are
      // `FST_*` but NOT the Fastify-core `FST_ERR_*` namespace, so this stays scoped
      // to multipart parsing failures and won't swallow an unrelated core error.
      if (code.startsWith('FST_') && !code.startsWith('FST_ERR_')) throw new AppError('INVALID_UPLOAD')
      throw err
    }

    const meta = z
      .object({ documentType: z.enum(DOCUMENT_TYPES), reason: z.string().trim().min(1) })
      .parse({ documentType, reason })

    if (!fileBuffer || fileBuffer.length === 0) throw new AppError('FILE_REQUIRED')
    const policy = kindPolicy('document')
    // Object.hasOwn (not `in`) — `in` walks the prototype chain, so a part with
    // Content-Type: constructor (or __proto__, toString, …) would otherwise pass
    // via an inherited Object.prototype key. Same bug class as PR #427's merchant
    // documents route; fixed identically here for consistency (the shared
    // storage.ts putObject guard already closes the exploit downstream, but the
    // route-level check should not itself be misleadingly bypassable).
    if (!mimetype || !Object.hasOwn(policy.contentTypes, mimetype)) throw new AppError('UNSUPPORTED_FILE_TYPE')
    if (fileBuffer.length > policy.maxBytes) throw new AppError('FILE_TOO_LARGE')

    return createMerchantDocument(
      app.prisma,
      {
        merchantId: id,
        adminId: req.user.sub,
        documentType: meta.documentType,
        contentType: mimetype,
        body: fileBuffer,
        reason: meta.reason,
      },
      auditCtx(req),
    )
  })

  // Delete: remove a merchant document on the merchant's behalf. Gated SUPER_ADMIN-
  // only (`merchant:manage-documents`, D3). POST `/delete` (reason body), matching
  // the B2.4 no-DELETE-with-body precedent. Deletes the row + audits, then
  // best-effort deletes the R2 object (a failure there does NOT fail the row delete).
  app.post(`${prefix}/:id/documents/:documentId/delete`, { preHandler: [requireAdminCapability('merchant:manage-documents')] }, async (req: any) => {
    const { id, documentId } = z
      .object({ id: z.string().min(1), documentId: z.string().min(1) })
      .parse(req.params)
    const { reason } = z.object({ reason: z.string().trim().min(1) }).strict().parse(req.body)
    await resolveTargetMerchantForAdmin(app.prisma, id)
    // S3 defence-in-depth: a FIELD rep may delete documents only for a PRE-LIVE merchant.
    await assertFieldPreLiveScope(app.prisma, req.user.adminRole, id)
    return deleteMerchantDocument(
      app.prisma,
      { merchantId: id, documentId, adminId: req.user.sub, reason },
      auditCtx(req),
    )
  })

  // ── Option B B5.1: admin RMV co-build on behalf (edit + submit) ──────────────

  // Read: the merchant's mandatory RMV vouchers, for the admin co-build card. Gated
  // `merchant:read` (VIEW), consistent with the documents read + M4 review screen:
  // OPERATIONS can see them; the edit/submit affordances are the higher
  // `merchant:manage-vouchers` below. No secrets in the payload (vouchers carry
  // none; the PIN lives on Branch).
  app.get(`${prefix}/:id/vouchers/rmv`, { preHandler: [requireAdminCapability('merchant:read')] }, async (req: any) => {
    const id = idParam(req)
    await resolveTargetMerchantForAdmin(app.prisma, id)
    return listAdminRmvVouchers(app.prisma, id)
  })

  // Merchant 360 A4-read: the merchant's CUSTOM (RCV) vouchers, for the Vouchers-
  // tab custom section (read-only; B5.2 mutations stay unbuilt). Gated
  // `merchant:read` (VIEW), the same interim OD4 gating as the RMV read + the
  // documents read: no new capability. The service select is a TIGHT curated
  // roster (no customer PII, no redemption rows, no secrets) — see
  // listAdminCustomVouchers. Distinct path from the RMV read above.
  app.get(`${prefix}/:id/vouchers`, { preHandler: [requireAdminCapability('merchant:read')] }, async (req: any) => {
    const id = idParam(req)
    await resolveTargetMerchantForAdmin(app.prisma, id)
    return listAdminCustomVouchers(app.prisma, id)
  })

  // Merchant 360 A4-read: the merchant's staff roster (portal members + branch app
  // logins), for the read-only Staff tab (D44 mutations are Phase C / OD4-gated).
  // Gated `merchant:read` (VIEW) — the interim OD4 decision (staff-read gates on
  // the existing merchant:read, not a net-new staff capability). The service
  // NEVER selects a passwordHash, the branch redemptionPin, OTP, sessions, or any
  // token — see listAdminStaff.
  app.get(`${prefix}/:id/staff`, { preHandler: [requireAdminCapability('merchant:read')] }, async (req: any) => {
    const id = idParam(req)
    await resolveTargetMerchantForAdmin(app.prisma, id)
    return listAdminStaff(app.prisma, id)
  })

  // Edit: update a DRAFT RMV's template-allowed fields on the merchant's behalf.
  // Gated OPERATIONS-level (`merchant:manage-vouchers`, in ALL_SLICE1_CAPS). Reuses
  // the LIVE edit core (no weaker path): the SAME DRAFT-only gate (VOUCHER_NOT_
  // EDITABLE), the SAME allowedFields KEY validation (RMV_FIELD_NOT_ALLOWED), the
  // SAME merchantFields merge. NESTED body `{ fields, reason }`: `fields` is the
  // dynamic allowedFields payload (separated from `reason` so a future allowedField
  // literally named "reason" cannot collide); `reason` is required + audited.
  // resolveTargetMerchantForAdmin allows SUSPENDED; the core's findFirst is scoped
  // to merchantId, so a cross-merchant voucher id yields RMV_NOT_FOUND (no
  // cross-merchant edit). Audited actorType ADMIN + reason.
  app.patch(`${prefix}/:id/vouchers/:voucherId/rmv`, { preHandler: [requireAdminCapability('merchant:manage-vouchers')] }, async (req: any) => {
    const { id, voucherId } = z
      .object({ id: z.string().min(1), voucherId: z.string().min(1) })
      .parse(req.params)
    const body = z
      .object({ fields: z.record(z.string(), z.unknown()), reason: z.string().trim().min(1) })
      .strict()
      .parse(req.body)
    await resolveTargetMerchantForAdmin(app.prisma, id)
    // S3 defence-in-depth: a FIELD rep may edit RMV vouchers only for a PRE-LIVE merchant.
    await assertFieldPreLiveScope(app.prisma, req.user.adminRole, id)
    return updateRmvVoucherCore(
      app.prisma,
      { merchantId: id, actor: { type: 'ADMIN', id: req.user.sub, reason: body.reason } },
      voucherId,
      body.fields,
      auditCtx(req),
    )
  })

  // Submit: move a DRAFT RMV to PENDING_APPROVAL on the merchant's behalf. Gated
  // OPERATIONS-level (`merchant:manage-vouchers`). Reuses the LIVE submit core (no
  // weaker path): the SAME DRAFT-only gate (VOUCHER_NOT_SUBMITTABLE) and NO
  // completeness gate (a blank-fields RMV still submits, exactly as the merchant
  // path). Submitting only QUEUES the RMV for the go-live review; nothing goes live
  // here; the actioner approve (approval:action) stays the separation-of-duties
  // backstop that flips submitted RMVs to ACTIVE. STRICT body = reason only.
  // Audited actorType ADMIN + reason.
  app.post(`${prefix}/:id/vouchers/:voucherId/rmv/submit`, { preHandler: [requireAdminCapability('merchant:manage-vouchers')] }, async (req: any) => {
    const { id, voucherId } = z
      .object({ id: z.string().min(1), voucherId: z.string().min(1) })
      .parse(req.params)
    const { reason } = z.object({ reason: z.string().trim().min(1) }).strict().parse(req.body)
    await resolveTargetMerchantForAdmin(app.prisma, id)
    // S3 defence-in-depth: a FIELD rep may submit RMV vouchers only for a PRE-LIVE merchant.
    await assertFieldPreLiveScope(app.prisma, req.user.adminRole, id)
    return submitRmvVoucherCore(
      app.prisma,
      { merchantId: id, actor: { type: 'ADMIN', id: req.user.sub, reason } },
      voucherId,
      auditCtx(req),
    )
  })
}
