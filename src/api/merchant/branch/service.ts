import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLog } from '../../shared/audit'
import { resolveAdminMerchant } from '../shared'
import { encrypt, decrypt } from '../../shared/encryption'

const PIN_REGEX = /^\d{4}$/

// Sensitive fields require admin approval via edit-request
const SENSITIVE_FIELDS = [
  'name', 'about', 'addressLine1', 'addressLine2', 'city', 'postcode',
  'latitude', 'longitude', 'logoUrl', 'bannerUrl',
] as const

// Directly editable fields via PATCH
const DIRECT_FIELDS = ['phone', 'email', 'websiteUrl', 'isActive'] as const

const BRANCH_INCLUDE = {
  openingHours: true,
  amenities: { include: { amenity: true } },
  photos: true,
  pendingEdits: { where: { status: 'PENDING' as const }, take: 1 },
} as const

async function resolveBranch(
  prisma: PrismaClient,
  branchId: string,
  merchantId: string
) {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, merchantId, deletedAt: null },
    include: BRANCH_INCLUDE,
  })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')
  return branch
}

export async function listBranches(prisma: PrismaClient, adminId: string) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  return prisma.branch.findMany({
    where: { merchantId, deletedAt: null },
    include: BRANCH_INCLUDE,
    orderBy: [{ isMainBranch: 'desc' }, { createdAt: 'asc' }],
  })
}

export async function getBranch(prisma: PrismaClient, adminId: string, branchId: string) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  return resolveBranch(prisma, branchId, merchantId)
}

export async function createBranch(
  prisma: PrismaClient,
  adminId: string,
  data: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)

  const existingCount = await prisma.branch.count({
    where: { merchantId, deletedAt: null },
  })
  const isMainBranch = existingCount === 0

  const branch = await prisma.branch.create({
    data: {
      merchantId,
      isMainBranch,
      name:         data.name as string,
      addressLine1: data.addressLine1 as string,
      addressLine2: data.addressLine2 as string | undefined,
      city:         data.city as string,
      postcode:     data.postcode as string,
      country:      (data.country as string | undefined) ?? 'GB',
      latitude:     data.latitude as number | undefined,
      longitude:    data.longitude as number | undefined,
      phone:        data.phone as string | undefined,
      email:        data.email as string | undefined,
      websiteUrl:   data.websiteUrl as string | undefined,
      logoUrl:      data.logoUrl as string | undefined,
      bannerUrl:    data.bannerUrl as string | undefined,
      about:        data.about as string | undefined,
    },
    include: BRANCH_INCLUDE,
  })

  writeAuditLog(prisma, {
    entityId: merchantId, entityType: 'merchant',
    event: 'BRANCH_CREATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { branchId: branch.id },
  })
  return branch
}

export async function updateBranch(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  data: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  await resolveBranch(prisma, branchId, merchantId)

  // Build safe update object (only direct fields)
  const safe: Record<string, unknown> = {}
  for (const key of DIRECT_FIELDS) {
    if (key in data) safe[key] = data[key]
  }

  // Handle isMainBranch promotion atomically
  if (data.isMainBranch === true) {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.branch.updateMany({
        where: { merchantId, isMainBranch: true },
        data: { isMainBranch: false },
      })
      return tx.branch.update({
        where: { id: branchId },
        data: { ...safe, isMainBranch: true },
        include: BRANCH_INCLUDE,
      })
    })
    writeAuditLog(prisma, {
      entityId: merchantId, entityType: 'merchant',
      event: 'BRANCH_MAIN_CHANGED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
      metadata: { newMainBranchId: branchId },
    })
    writeAuditLog(prisma, {
      entityId: merchantId, entityType: 'merchant',
      event: 'BRANCH_UPDATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
      metadata: { branchId },
    })
    return updated
  }

  if (Object.keys(safe).length === 0) {
    return resolveBranch(prisma, branchId, merchantId)
  }

  const updated = await prisma.branch.update({
    where: { id: branchId },
    data: safe,
    include: BRANCH_INCLUDE,
  })

  writeAuditLog(prisma, {
    entityId: merchantId, entityType: 'merchant',
    event: 'BRANCH_UPDATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { branchId },
  })
  return updated
}

export async function createBranchEditRequest(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  proposedChanges: Record<string, unknown>,
  includesPhotos: boolean,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  await resolveBranch(prisma, branchId, merchantId)

  // Filter to only sensitive fields
  const filtered: Record<string, unknown> = {}
  for (const key of SENSITIVE_FIELDS) {
    if (key in proposedChanges) filtered[key] = proposedChanges[key]
  }

  if (Object.keys(filtered).length === 0 && !includesPhotos) {
    throw new AppError('NO_SENSITIVE_FIELDS')
  }

  // Check for existing PENDING edit
  const existingEdit = await prisma.branchPendingEdit.findFirst({
    where: { branchId, status: 'PENDING' },
  })
  if (existingEdit) throw new AppError('PENDING_EDIT_EXISTS')

  const pendingEdit = await prisma.branchPendingEdit.create({
    data: {
      branchId,
      merchantId,
      proposedChanges: filtered as any,
      includesPhotos,
      status: 'PENDING',
    },
  })

  await prisma.adminApproval.create({
    data: {
      type:          'BRANCH_IDENTITY_EDIT',
      status:        'PENDING',
      referenceId:   pendingEdit.id,
      referenceType: 'branch_pending_edit',
      comment:       `Branch ${branchId} requested identity field changes`,
    },
  })

  writeAuditLog(prisma, {
    entityId: merchantId, entityType: 'merchant',
    event: 'BRANCH_EDIT_REQUEST_CREATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { branchId, pendingEditId: pendingEdit.id },
  })
  return pendingEdit
}

export async function createBranchPhotoEditRequest(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  photoChanges: { add?: string[]; remove?: string[] },
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  await resolveBranch(prisma, branchId, merchantId)

  // Check for existing PENDING edit
  const existingEdit = await prisma.branchPendingEdit.findFirst({
    where: { branchId, status: 'PENDING' },
  })
  if (existingEdit) throw new AppError('PENDING_EDIT_EXISTS')

  const pendingEdit = await prisma.branchPendingEdit.create({
    data: {
      branchId,
      merchantId,
      proposedChanges: photoChanges,
      includesPhotos: true,
      status: 'PENDING',
    },
  })

  await prisma.adminApproval.create({
    data: {
      type:          'BRANCH_IDENTITY_EDIT',
      status:        'PENDING',
      referenceId:   pendingEdit.id,
      referenceType: 'branch_pending_edit',
      comment:       `Branch ${branchId} requested photo changes`,
    },
  })

  writeAuditLog(prisma, {
    entityId: merchantId, entityType: 'merchant',
    event: 'BRANCH_EDIT_REQUEST_CREATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { branchId, pendingEditId: pendingEdit.id, includesPhotos: true },
  })
  return pendingEdit
}

export async function listBranchEditRequests(
  prisma: PrismaClient,
  adminId: string,
  branchId: string
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  await resolveBranch(prisma, branchId, merchantId)
  return prisma.branchPendingEdit.findMany({
    where: { branchId, merchantId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function withdrawBranchEditRequest(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  editId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  await resolveBranch(prisma, branchId, merchantId)

  const edit = await prisma.branchPendingEdit.findFirst({
    where: { id: editId, branchId, merchantId },
  })
  if (!edit) throw new AppError('PENDING_EDIT_NOT_FOUND')
  if (edit.status !== 'PENDING') throw new AppError('PENDING_EDIT_NOT_FOUND')

  const updated = await prisma.branchPendingEdit.update({
    where: { id: editId },
    data: { status: 'WITHDRAWN', reviewedAt: new Date() },
  })

  writeAuditLog(prisma, {
    entityId: merchantId, entityType: 'merchant',
    event: 'BRANCH_EDIT_REQUEST_WITHDRAWN', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { branchId, editId },
  })
  return updated
}

export async function setOpeningHours(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  hours: Array<{ dayOfWeek: number; openTime?: string; closeTime?: string; isClosed: boolean }>
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  await resolveBranch(prisma, branchId, merchantId)

  await Promise.all(
    hours.map(({ dayOfWeek, openTime, closeTime, isClosed }) =>
      prisma.branchOpeningHours.upsert({
        where: { branchId_dayOfWeek: { branchId, dayOfWeek } },
        create: { branchId, dayOfWeek, openTime, closeTime, isClosed },
        update: { openTime, closeTime, isClosed },
      })
    )
  )

  return { ok: true }
}

export async function setAmenities(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  amenityIds: string[]
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  await resolveBranch(prisma, branchId, merchantId)

  await prisma.branchAmenity.deleteMany({ where: { branchId } })
  if (amenityIds.length > 0) {
    await prisma.branchAmenity.createMany({
      data: amenityIds.map(amenityId => ({ branchId, amenityId })),
    })
  }

  return { ok: true }
}

export async function softDeleteBranch(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)

  const branch = await prisma.branch.findFirst({
    where: { id: branchId, merchantId, deletedAt: null },
  })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')

  // Block deleting main branch
  if (branch.isMainBranch) throw new AppError('BRANCH_IS_MAIN')

  // Block deleting last active branch of a live merchant
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } })
  if (merchant?.status === 'ACTIVE') {
    const activeBranchCount = await prisma.branch.count({
      where: { merchantId, isActive: true, deletedAt: null },
    })
    if (activeBranchCount <= 1) throw new AppError('BRANCH_LAST_ACTIVE')
  }

  // Deactivate branch users
  await prisma.branchUser.updateMany({
    where: { branchId },
    data: { status: 'INACTIVE' },
  })

  // Soft delete
  await prisma.branch.update({
    where: { id: branchId },
    data: { deletedAt: new Date(), isActive: false },
  })

  writeAuditLog(prisma, {
    entityId: merchantId, entityType: 'merchant',
    event: 'BRANCH_DELETED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { branchId },
  })

  return { ok: true }
}

export async function getBranchPin(
  prisma: PrismaClient,
  adminId: string,
  branchId: string
): Promise<{ pin: string | null }> {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, merchantId, deletedAt: null },
    select: { redemptionPin: true },
  })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')
  if (!branch.redemptionPin) return { pin: null }
  return { pin: decrypt(branch.redemptionPin) }
}

export async function setBranchPin(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  pin: string,
  ctx: { ipAddress: string; userAgent: string }
): Promise<{ message: string }> {
  if (!PIN_REGEX.test(pin)) throw new AppError('INVALID_PIN_FORMAT')
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, merchantId, deletedAt: null },
  })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')
  await prisma.branch.update({
    where: { id: branchId },
    data:  { redemptionPin: encrypt(pin) },
  })
  writeAuditLog(prisma, {
    entityId: merchantId, entityType: 'merchant',
    event: 'BRANCH_PIN_CHANGED',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { branchId },
  })
  return { message: 'PIN updated' }
}

export async function sendBranchPin(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  ctx: { ipAddress: string; userAgent: string }
): Promise<{ message: string }> {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, merchantId, deletedAt: null },
    select: { redemptionPin: true, name: true, phone: true, email: true },
  })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')
  if (!branch.redemptionPin) throw new AppError('PIN_NOT_CONFIGURED')

  const pin = decrypt(branch.redemptionPin)

  // SMS via Twilio (fire-and-forget — errors are logged, not thrown)
  if (branch.phone) {
    import('twilio').then(({ default: twilio }) => {
      const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
      client.messages.create({
        to:   branch.phone!,
        from: process.env.TWILIO_FROM_NUMBER!,
        body: `Your Redeemo branch PIN for ${branch.name} is: ${pin}. Keep this secure.`,
      }).catch((err: unknown) => console.error('[pin-send] SMS failed:', err))
    }).catch((err: unknown) => console.error('[pin-send] Twilio import failed:', err))
  }

  // Email via Resend (Phase 3 — log for now)
  if (branch.email) {
    console.info(`[dev] Branch PIN email for ${branch.email}: PIN=${pin}`)
  }

  writeAuditLog(prisma, {
    entityId: merchantId, entityType: 'merchant',
    event: 'BRANCH_PIN_SENT',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { branchId, channels: [branch.phone ? 'sms' : null, branch.email ? 'email' : null].filter(Boolean) },
  })

  return { message: 'PIN sent to branch staff' }
}
