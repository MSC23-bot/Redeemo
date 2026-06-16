import { randomBytes } from 'crypto'
import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLog, writeAuditLogTx, type AuditEvent } from '../../shared/audit'
import { resolveAdminMerchant, type EditActor } from '../shared'
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
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    include: { pendingEdits: { where: { status: 'PENDING' }, take: 1 } },
  })
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')
  return merchant
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
    await prisma.$transaction(async (tx) => {
      await tx.merchant.update({ where: { id: merchantId }, data: { primaryCategoryId: newCategoryId } })
      const templates = await tx.rmvTemplate.findMany({ where: { categoryId: newCategoryId, isActive: true }, take: 2 })
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

export async function updateMerchantProfile(
  prisma: PrismaClient,
  adminId: string,
  updates: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)

  // Reject if any sensitive fields are passed — they must go through POST /edit-request
  const attemptedSensitive = SENSITIVE_FIELDS.filter(k => k in updates)
  if (attemptedSensitive.length > 0) throw new AppError('SENSITIVE_FIELDS_REQUIRE_EDIT_REQUEST')

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

  // App-layer enforcement — no DB unique constraint on merchantId.
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
