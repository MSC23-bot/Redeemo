import { randomBytes } from 'crypto'
import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLog, writeAuditLogTx, type AuditEvent } from '../../shared/audit'
import { resolveAdminMerchant, resolveMerchantContext, isDraftWindow, resolveTopLevelCategoryId, type EditActor } from '../shared'
import { handleCategoryChange } from '../voucher/service'

const SENSITIVE_FIELDS = ['businessName', 'tradingName', 'logoUrl', 'bannerUrl', 'description'] as const

// Option B B2.1: the simple-DIRECT subset (the merchant DIRECT set minus
// primaryCategoryId). These are the only fields the shared
// `updateMerchantProfileDirectCore` writes. primaryCategoryId stays on its own
// RMV-provisioning path (handled inline in updateMerchantProfile; NOT
// admin-reachable in B2.1); the admin route narrows even further to websiteUrl
// only.
const DIRECT_SIMPLE_FIELDS = ['websiteUrl', 'vatNumber', 'companyNumber'] as const

export async function getMerchantProfile(prisma: PrismaClient, adminId: string) {
  // Staff & Access B5 (§4.3 MEMBER-READ): any active member can read business info
  // (not branch-specific). resolveMerchantContext keeps the SEC-M2 suspended guard.
  const { merchantId, role } = await resolveMerchantContext(prisma, adminId)
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    include: { pendingEdits: { where: { status: 'PENDING' }, take: 1 } },
  })
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')
  // Insights & Reports: expose a minimal viewer-capability set so merchant-web can hide
  // the Insights navigation for STAFF. Derived server-side from the freshly resolved
  // membership role and mirrors the assertInsightsAccess deny (which remains the REAL
  // security boundary). This is a UX hint only - no extra role information is exposed.
  // Use an explicit ALLOWLIST (not `!== 'STAFF'`) so a future newly-added role FAILS
  // CLOSED - it must be added here deliberately to gain Insights, never by default.
  const canViewInsights = role === 'OWNER' || role === 'BRANCH_MANAGER'
  return {
    ...merchant,
    viewerCapabilities: { canViewInsights },
  }
}

/**
 * Option B B2.1: the shared simple-DIRECT apply core. Filters `updates` to
 * `DIRECT_SIMPLE_FIELDS`, captures a before-snapshot, then writes + audits inside
 * one transaction. BOTH the merchant route (via `updateMerchantProfile`) and the
 * new admin route call this, so the validation/apply/audit is identical (no
 * weaker path). The audit row carries the actor (MERCHANT_ADMIN or ADMIN) +
 * before/after + the ADMIN reason.
 */
export async function updateMerchantProfileDirectCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  updates: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string },
  event: AuditEvent = 'MERCHANT_PROFILE_UPDATED'
) {
  const safe: Record<string, unknown> = {}
  for (const k of DIRECT_SIMPLE_FIELDS) if (k in updates) safe[k] = updates[k]
  if (Object.keys(safe).length === 0) return prisma.merchant.findUnique({ where: { id: merchantId } })

  const beforeRow = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { websiteUrl: true, vatNumber: true, companyNumber: true },
  })
  if (!beforeRow) throw new AppError('MERCHANT_NOT_FOUND')

  const before: Record<string, unknown> = {}
  for (const k of Object.keys(safe)) before[k] = (beforeRow as any)[k]

  return prisma.$transaction(async (tx) => {
    const updated = await tx.merchant.update({ where: { id: merchantId }, data: safe })
    await writeAuditLogTx(tx, {
      entityId: merchantId,
      entityType: 'merchant',
      event,
      actorId: actor.id,
      actorType: actor.type,
      before,
      after: safe,
      reason: actor.reason,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    return updated
  })
}

/**
 * M2 B1 (D1): the draft-window SENSITIVE-direct apply core. Filters `updates` to
 * `SENSITIVE_FIELDS`, captures a before-snapshot, then writes + audits inside one
 * transaction. ONLY reachable from the draft window (`updateMerchantProfile`
 * gates on `isDraftWindow`); outside the draft window the sensitive fields keep
 * throwing SENSITIVE_FIELDS_REQUIRE_EDIT_REQUEST and route through the governed
 * edit-request lane. Mirrors `updateMerchantProfileDirectCore`'s audit shape
 * (actor-attributed MERCHANT_ADMIN, before/after, transactional).
 */
async function updateMerchantProfileSensitiveDirectCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  updates: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const safe: Record<string, unknown> = {}
  for (const k of SENSITIVE_FIELDS) if (k in updates) safe[k] = updates[k]
  if (Object.keys(safe).length === 0) return prisma.merchant.findUnique({ where: { id: merchantId } })

  const beforeRow = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { businessName: true, tradingName: true, logoUrl: true, bannerUrl: true, description: true },
  })
  if (!beforeRow) throw new AppError('MERCHANT_NOT_FOUND')

  const before: Record<string, unknown> = {}
  for (const k of Object.keys(safe)) before[k] = (beforeRow as any)[k]

  return prisma.$transaction(async (tx) => {
    const updated = await tx.merchant.update({ where: { id: merchantId }, data: safe })
    await writeAuditLogTx(tx, {
      entityId: merchantId,
      entityType: 'merchant',
      event: 'MERCHANT_PROFILE_UPDATED',
      actorId: actor.id,
      actorType: actor.type,
      before,
      after: safe,
      reason: actor.reason,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    return updated
  })
}

/**
 * Option B B2.3: the shared category set/change dispatcher (the D4 seam). BOTH the
 * merchant wrapper (actor MERCHANT_ADMIN) and the admin route (actor ADMIN +
 * reason) call this, so the validation/side-effects/audit are identical (no weaker
 * path). D7: the first-set provisioning and the change path stay DISTINCT - the
 * change path is `handleCategoryChange`; they are NOT unified into one provisioning
 * fn. Both paths write actor-attributed audit INSIDE their transaction.
 *
 * Returns a small discriminated result: { provisioned } (first set) |
 * { unchanged } (same category) | { requiresConfirmation, message } (change preview)
 * | { changed } (change applied). The merchant wrapper maps non-confirmation
 * results back to getMerchantProfile; the admin route returns the result directly.
 */
export async function setMerchantCategoryCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  newCategoryId: string,
  confirm: boolean,
  ctx: { ipAddress: string; userAgent: string }
) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { primaryCategoryId: true },
  })
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')

  // First-time set: provision RMVs atomically; no confirm needed.
  if (merchant.primaryCategoryId === null) {
    // M2 B2: the identity write stores primaryCategoryId at the SUBCATEGORY level,
    // but RMV templates are seeded at the TOP-LEVEL. Resolve the top-level parent
    // for the template lookup (a top-level id resolves to itself), so
    // auto-provisioning keeps working after B2. Merchant.primaryCategoryId is still
    // set to the SUBCATEGORY id (newCategoryId) so the descriptor composes.
    const templateCategoryId = await resolveTopLevelCategoryId(prisma, newCategoryId)
    await prisma.$transaction(async (tx) => {
      await tx.merchant.update({ where: { id: merchantId }, data: { primaryCategoryId: newCategoryId } })
      const templates = await tx.rmvTemplate.findMany({ where: { categoryId: templateCategoryId, isActive: true }, take: 2 })
      if (templates.length < 2) throw new AppError('NO_RMV_TEMPLATE')
      await Promise.all(templates.map(t =>
        tx.voucher.create({
          data: {
            merchantId,
            code:            `RMV-${randomBytes(4).toString('hex').toUpperCase()}`,
            isRmv:           true,
            isMandatory:     true,
            rmvTemplateId:   t.id,
            type:            t.voucherType,
            title:           t.title,
            description:     t.description,
            estimatedSaving: t.minimumSaving,
            status:          'DRAFT',
            approvalStatus:  'PENDING',
            merchantFields:  {},
          },
        })
      ))
      await writeAuditLogTx(tx, {
        entityId: merchantId, entityType: 'merchant', event: 'RMV_PROVISIONED',
        actorId: actor.id, actorType: actor.type, reason: actor.reason,
        metadata: { categoryId: newCategoryId },
        ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
      })
      await writeAuditLogTx(tx, {
        entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_PROFILE_UPDATED',
        actorId: actor.id, actorType: actor.type, reason: actor.reason,
        before: { primaryCategoryId: null }, after: { primaryCategoryId: newCategoryId },
        ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
      })
    })
    return { provisioned: true as const }
  }

  // Same category: no-op.
  if (merchant.primaryCategoryId === newCategoryId) return { unchanged: true as const }

  // Change: delegate to handleCategoryChange (block / requiresConfirmation / apply).
  return handleCategoryChange(prisma, { merchantId, actor }, newCategoryId, confirm, ctx)
}

/**
 * M2 B2 (D5): the full merchant category-identity write. Stores the chosen
 * SUBCATEGORY as `primaryCategoryId` (so `buildDescriptor` composes the
 * customer-facing label correctly), the chosen cuisine Tag as
 * `primaryDescriptorTagId` (nullable), the chosen specialty Tags as `MerchantTag`
 * rows, and maintains the `MerchantCategory(isPrimary)` row. Transactional +
 * actor-attributed audit (MERCHANT_ADMIN on the merchant route).
 *
 * Validation (BEFORE the transaction): the subcategory must exist
 * (CATEGORY_NOT_FOUND) and be a real subcategory, not a top-level category
 * (NOT_A_SUBCATEGORY); every chosen tag (descriptor + specialties) must be linked
 * to that subcategory via `SubcategoryTag` (TAG_NOT_ELIGIBLE); the descriptor tag
 * must additionally be `isPrimaryEligible`.
 *
 * Idempotent: the specialty MerchantTag set is replaced (deleteMany + createMany)
 * so re-saving the identity is safe. This is a NEW core distinct from
 * `setMerchantCategoryCore` (the RMV auto-provisioning path) so the existing admin
 * category route + provisioning are untouched. RMV auto-provisioning on first
 * category-set still flows through `updateMerchantProfile`'s `primaryCategoryId`
 * branch / `setMerchantCategoryCore`; this write sets the identity only and does
 * NOT provision (provisioning resolves the top-level parent via the parent-walk).
 *
 * Lifecycle gate (M2 B2 review fix): the identity write is an ONBOARDING-only
 * action (spec D5), so it is gated to the draft window (status REGISTERED, or
 * onboardingStep NEEDS_CHANGES; via B1's `isDraftWindow`). Outside the draft window
 * it REFUSES with IDENTITY_EDIT_REQUIRES_DRAFT. This makes identity-edit
 * onboarding-only for M2 and prevents flipping primaryCategoryId AFTER submission,
 * which would decouple the customer-facing descriptor + MerchantCategory(isPrimary)
 * from already-submitted/active RMVs (the CATEGORY_CHANGE_BLOCKED rule, spec section
 * 4.2). Day-2 governed identity edits are M3. A submitted/active merchant is never in
 * the draft window, so the draft-window gate subsumes the CATEGORY_CHANGE_BLOCKED
 * check (submitted/active RMVs cannot occur here).
 *
 * Within the draft window, if the chosen subcategory's TOP-LEVEL parent differs from
 * the merchant's current category's top-level parent, existing DRAFT RMVs are
 * discarded (set INACTIVE) in the SAME transaction so the descriptor + RMVs stay
 * coherent (mirrors `handleCategoryChange`'s DRAFT-discard). No re-provisioning here
 * (that is B3's redesign). A first-time set (no current category) or a same-top-level
 * change leaves RMVs untouched.
 */
export async function setMerchantIdentityCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  identity: { subcategoryId: string; primaryDescriptorTagId?: string | null; specialtyTagIds?: string[] },
  ctx: { ipAddress: string; userAgent: string }
) {
  const subcategoryId = identity.subcategoryId
  const descriptorTagId = identity.primaryDescriptorTagId ?? null
  const specialtyTagIds = Array.from(new Set(identity.specialtyTagIds ?? []))

  // 0. Lifecycle gate (FIRST, before any validation): the identity write is
  //    onboarding-only, so it is refused outside the draft window. This also reads
  //    the merchant's current category + identity columns (reused below as the
  //    before-snapshot + the top-level-change comparison).
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { primaryCategoryId: true, primaryDescriptorTagId: true, status: true, onboardingStep: true },
  })
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')
  if (!isDraftWindow(merchant)) throw new AppError('IDENTITY_EDIT_REQUIRES_DRAFT')

  // 1. The subcategory must exist + be a real subcategory (parentId set).
  const subcategory = await prisma.category.findUnique({
    where: { id: subcategoryId },
    select: { id: true, parentId: true },
  })
  if (!subcategory) throw new AppError('CATEGORY_NOT_FOUND')
  if (subcategory.parentId === null) throw new AppError('NOT_A_SUBCATEGORY')

  // 2. Validate every chosen tag is eligible for this subcategory (SubcategoryTag).
  //    The descriptor tag must additionally be isPrimaryEligible.
  const requestedTagIds = Array.from(new Set([...(descriptorTagId ? [descriptorTagId] : []), ...specialtyTagIds]))
  if (requestedTagIds.length > 0) {
    const links = await prisma.subcategoryTag.findMany({
      where: { subcategoryId, tagId: { in: requestedTagIds } },
      select: { tagId: true, isPrimaryEligible: true },
    })
    const eligibleById = new Map(links.map((l) => [l.tagId, l.isPrimaryEligible]))
    for (const tagId of requestedTagIds) {
      if (!eligibleById.has(tagId)) throw new AppError('TAG_NOT_ELIGIBLE')
    }
    if (descriptorTagId && eligibleById.get(descriptorTagId) !== true) {
      throw new AppError('TAG_NOT_ELIGIBLE')
    }
  }

  // 3. Within the draft window, decide whether the TOP-LEVEL category changes. The
  //    chosen subcategory's top-level parent vs the merchant's current category's
  //    top-level parent (both via the parent-walk; a top-level id resolves to
  //    itself). A first-time set (no current category) never discards. If the
  //    top-level changes, existing DRAFT RMVs are discarded (set INACTIVE) inside
  //    the transaction so the descriptor + RMVs stay coherent. Submitted/active RMVs
  //    cannot occur in the draft window, so CATEGORY_CHANGE_BLOCKED need not be
  //    re-checked here (the lifecycle gate above subsumes it). No re-provisioning
  //    (B3's redesign).
  const currentCategoryId = merchant.primaryCategoryId
  let topLevelChanged = false
  if (currentCategoryId && currentCategoryId !== subcategoryId) {
    const [newTop, currentTop] = await Promise.all([
      resolveTopLevelCategoryId(prisma, subcategoryId),
      resolveTopLevelCategoryId(prisma, currentCategoryId),
    ])
    topLevelChanged = newTop !== currentTop
  }

  // 4. Apply atomically: (optional DRAFT-RMV discard) + merchant identity columns +
  //    MerchantCategory(isPrimary) + the specialty MerchantTag set (replaced) + the
  //    actor-attributed audit.
  return prisma.$transaction(async (tx) => {
    if (topLevelChanged) {
      await tx.voucher.updateMany({
        where: { merchantId, isRmv: true, status: 'DRAFT' },
        data: { status: 'INACTIVE' },
      })
    }

    const updated = await tx.merchant.update({
      where: { id: merchantId },
      data: { primaryCategoryId: subcategoryId, primaryDescriptorTagId: descriptorTagId },
    })

    // Maintain the MerchantCategory primary-flag invariant: demote any existing
    // rows, then upsert the chosen subcategory as primary.
    await tx.merchantCategory.updateMany({ where: { merchantId }, data: { isPrimary: false } })
    await tx.merchantCategory.upsert({
      where: { merchantId_categoryId: { merchantId, categoryId: subcategoryId } },
      update: { isPrimary: true },
      create: { merchantId, categoryId: subcategoryId, isPrimary: true },
    })

    // Replace the specialty MerchantTag set (idempotent re-save).
    await tx.merchantTag.deleteMany({ where: { merchantId } })
    if (specialtyTagIds.length > 0) {
      await tx.merchantTag.createMany({
        data: specialtyTagIds.map((tagId) => ({ merchantId, tagId })),
        skipDuplicates: true,
      })
    }

    await writeAuditLogTx(tx, {
      entityId: merchantId,
      entityType: 'merchant',
      event: 'MERCHANT_PROFILE_UPDATED',
      actorId: actor.id,
      actorType: actor.type,
      reason: actor.reason,
      before: { primaryCategoryId: merchant.primaryCategoryId, primaryDescriptorTagId: merchant.primaryDescriptorTagId },
      after: { primaryCategoryId: subcategoryId, primaryDescriptorTagId: descriptorTagId },
      metadata: { specialtyTagIds, discardedDraftRmvs: topLevelChanged },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return updated
  })
}

/**
 * M2 B2: merchant-facing wrapper for the identity write. Resolves the caller's OWN
 * merchant (resolveAdminMerchant; keeps INVALID_CREDENTIALS + the SEC-M2 SUSPENDED
 * block) and delegates to the shared core as a MERCHANT_ADMIN actor.
 */
export async function setMerchantIdentity(
  prisma: PrismaClient,
  adminId: string,
  identity: { subcategoryId: string; primaryDescriptorTagId?: string | null; specialtyTagIds?: string[] },
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  return setMerchantIdentityCore(prisma, { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } }, identity, ctx)
}

export async function updateMerchantProfile(
  prisma: PrismaClient,
  adminId: string,
  updates: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)

  // M2 B1 (D1): sensitive fields write DIRECTLY in the draft window (status
  // REGISTERED, or onboardingStep NEEDS_CHANGES); outside it they keep routing
  // through the governed edit-request lane (POST /edit-request). The lifecycle
  // read is a single targeted select; the governed lane is untouched.
  const attemptedSensitive = SENSITIVE_FIELDS.filter(k => k in updates)
  if (attemptedSensitive.length > 0) {
    const lifecycle = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { status: true, onboardingStep: true },
    })
    if (!lifecycle) throw new AppError('MERCHANT_NOT_FOUND')
    if (!isDraftWindow(lifecycle)) throw new AppError('SENSITIVE_FIELDS_REQUIRE_EDIT_REQUEST')

    // Draft window: apply the sensitive fields directly (transactional + audit).
    await updateMerchantProfileSensitiveDirectCore(
      prisma,
      { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } },
      updates,
      ctx
    )
    // Fall through so any DIRECT_SIMPLE / category fields in the same payload are
    // also applied; finally return the refreshed profile (unchanged contract).
  }

  // Option B B2.3: primaryCategoryId (set or change) runs through the shared
  // setMerchantCategoryCore seam (the SAME core the admin route calls), with the
  // merchant as actor. `requiresConfirmation` surfaces to the caller; otherwise
  // the wrapper returns the refreshed profile (unchanged external contract).
  if ('primaryCategoryId' in updates) {
    const newCategoryId = updates.primaryCategoryId as string
    const confirm = updates.confirm === true
    const result = await setMerchantCategoryCore(
      prisma,
      { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } },
      newCategoryId,
      confirm,
      ctx,
    )
    if ('requiresConfirmation' in result) return result
    return getMerchantProfile(prisma, adminId)
  }

  // All other direct fields: delegate to the shared simple-DIRECT core so the
  // merchant path and the admin path run identical validation/apply/audit. The
  // core filters `updates` to DIRECT_SIMPLE_FIELDS (websiteUrl/vatNumber/
  // companyNumber) itself.
  return updateMerchantProfileDirectCore(
    prisma,
    { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } },
    updates,
    ctx
  )
}

/**
 * Option B B2.5: the shared SENSITIVE-edit PROPOSE core (D4 seam). BOTH the
 * merchant wrapper (actor MERCHANT_ADMIN) and the new admin route (actor ADMIN +
 * reason) call this, so the validation/creation/audit is identical (no weaker
 * path). It routes the proposal into the EXISTING B1 pending-edit lane (creates a
 * MerchantPendingEdit + an AdminApproval(MERCHANT_IDENTITY_EDIT)); the B1 applier
 * (approveEdit/rejectEdit) reviews + applies it unchanged. The proposer + reason
 * ride in the AdminApproval.comment (no schema). The two creates + the audit are
 * ATOMIC (one transaction; was previously two separate writes + fire-and-forget
 * audit). The audit is now awaited in-tx, so an audit-write failure rolls back the
 * proposal (matching the B2.1-B2.4 posture).
 */
export async function createMerchantEditRequestCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  proposedChanges: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const sensitiveKeys = SENSITIVE_FIELDS.filter(k => k in proposedChanges)
  if (sensitiveKeys.length === 0) throw new AppError('NO_SENSITIVE_FIELDS')

  // App-layer enforcement: no DB unique constraint on merchantId.
  const existing = await prisma.merchantPendingEdit.findFirst({
    where: { merchantId, status: 'PENDING' },
  })
  if (existing) throw new AppError('PENDING_EDIT_EXISTS')

  const filteredChanges: Record<string, unknown> = {}
  for (const k of sensitiveKeys) filteredChanges[k] = proposedChanges[k]

  // The proposer + reason ride in the AdminApproval.comment (no schema). The
  // merchant path keeps its original wording; the admin path records the actor.
  const comment = actor.type === 'ADMIN'
    ? `Admin-proposed identity field changes on the merchant's behalf. Reason: ${actor.reason ?? ''}`
    : `Merchant ${merchantId} requested identity field changes`

  return prisma.$transaction(async (tx) => {
    const pendingEdit = await tx.merchantPendingEdit.create({
      data: { merchantId, proposedChanges: filteredChanges as any, status: 'PENDING' },
    })
    await tx.adminApproval.create({
      data: {
        type:          'MERCHANT_IDENTITY_EDIT',
        status:        'PENDING',
        referenceId:   pendingEdit.id,
        referenceType: 'MerchantPendingEdit',
        comment,
      },
    })
    await writeAuditLogTx(tx, {
      entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_EDIT_REQUEST_CREATED',
      actorId: actor.id, actorType: actor.type, reason: actor.reason,
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    })
    return pendingEdit
  })
}

export async function createMerchantEditRequest(
  prisma: PrismaClient,
  adminId: string,
  proposedChanges: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  return createMerchantEditRequestCore(prisma, { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } }, proposedChanges, ctx)
}

export async function listMerchantEditRequests(prisma: PrismaClient, adminId: string) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  return prisma.merchantPendingEdit.findMany({
    where: { merchantId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function withdrawMerchantEditRequest(
  prisma: PrismaClient,
  adminId: string,
  editId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const edit = await prisma.merchantPendingEdit.findFirst({ where: { id: editId, merchantId } })
  if (!edit) throw new AppError('PENDING_EDIT_NOT_FOUND')
  if (edit.status !== 'PENDING') throw new AppError('PENDING_EDIT_NOT_FOUND')

  const updated = await prisma.merchantPendingEdit.update({
    where: { id: editId },
    data: { status: 'WITHDRAWN', reviewedAt: new Date() },
  })
  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_EDIT_REQUEST_WITHDRAWN', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
  return updated
}
