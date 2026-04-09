import { randomBytes } from 'crypto'
import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLog } from '../../shared/audit'
import { resolveAdminMerchant } from '../shared'
import { handleCategoryChange } from '../voucher/service'

const SENSITIVE_FIELDS = ['businessName', 'tradingName', 'logoUrl', 'bannerUrl', 'description'] as const
const DIRECT_FIELDS    = ['websiteUrl', 'vatNumber', 'companyNumber', 'primaryCategoryId'] as const
// NOTE: primaryCategoryId is a direct-update field in this task.
// RMV provisioning side-effect is added in Task 9 (updateMerchantProfile will be updated there).

export async function getMerchantProfile(prisma: PrismaClient, adminId: string) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    include: { pendingEdits: { where: { status: 'PENDING' }, take: 1 } },
  })
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')
  return merchant
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

  // Handle primaryCategoryId specially — may trigger RMV provisioning
  if ('primaryCategoryId' in updates) {
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { primaryCategoryId: true },
    })
    if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')

    const newCategoryId = updates.primaryCategoryId as string
    const confirm = updates.confirm === true

    if (merchant.primaryCategoryId === null) {
      // First time setting category: update merchant + provision RMVs atomically
      // CRITICAL: both happen in the same transaction to prevent inconsistent state
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
      })
      writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'RMV_PROVISIONED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { categoryId: newCategoryId } })
      writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_PROFILE_UPDATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
      return getMerchantProfile(prisma, adminId)
    }

    if (merchant.primaryCategoryId !== newCategoryId) {
      // Category change — apply change rules
      const result = await handleCategoryChange(prisma, merchantId, newCategoryId, confirm, ctx)
      if ('requiresConfirmation' in result) return result
      writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_PROFILE_UPDATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
      return getMerchantProfile(prisma, adminId)
    }
    // Same category — no change needed
    return getMerchantProfile(prisma, adminId)
  }

  // All other direct fields
  const safe: Record<string, unknown> = {}
  for (const key of DIRECT_FIELDS) {
    if (key in updates && key !== 'primaryCategoryId') safe[key] = updates[key]
  }
  if (Object.keys(safe).length === 0) return getMerchantProfile(prisma, adminId)

  const updated = await prisma.merchant.update({ where: { id: merchantId }, data: safe })
  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_PROFILE_UPDATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
  return updated
}

export async function createMerchantEditRequest(
  prisma: PrismaClient,
  adminId: string,
  proposedChanges: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)

  const sensitiveKeys = SENSITIVE_FIELDS.filter(k => k in proposedChanges)
  if (sensitiveKeys.length === 0) throw new AppError('NO_SENSITIVE_FIELDS')

  // App-layer enforcement — no DB unique constraint on merchantId
  const existing = await prisma.merchantPendingEdit.findFirst({
    where: { merchantId, status: 'PENDING' },
  })
  if (existing) throw new AppError('PENDING_EDIT_EXISTS')

  const filteredChanges: Record<string, unknown> = {}
  for (const k of sensitiveKeys) filteredChanges[k] = proposedChanges[k]

  const pendingEdit = await prisma.merchantPendingEdit.create({
    data: { merchantId, proposedChanges: filteredChanges as any, status: 'PENDING' },
  })

  await prisma.adminApproval.create({
    data: {
      type:          'MERCHANT_IDENTITY_EDIT',
      status:        'PENDING',
      referenceId:   pendingEdit.id,
      referenceType: 'MerchantPendingEdit',
      comment:       `Merchant ${merchantId} requested identity field changes`,
    },
  })

  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_EDIT_REQUEST_CREATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
  return pendingEdit
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
