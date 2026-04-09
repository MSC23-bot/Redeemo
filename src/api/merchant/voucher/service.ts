import { randomBytes } from 'crypto'
import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLog } from '../../shared/audit'
import { resolveAdminMerchant } from '../shared'

// Only DRAFT vouchers can be edited, submitted, or deleted
const EDITABLE_STATUSES = ['DRAFT'] as const
const SUBMITTABLE_STATUSES = ['DRAFT'] as const

function generateVoucherCode(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString('hex').toUpperCase()}`
}

// ─── Custom Vouchers ────────────────────────────────────────────────────────

export async function listVouchers(prisma: PrismaClient, adminId: string) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  return prisma.voucher.findMany({
    where: { merchantId, isRmv: false },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getVoucher(
  prisma: PrismaClient,
  adminId: string,
  voucherId: string
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const voucher = await prisma.voucher.findFirst({
    where: { id: voucherId, merchantId, isRmv: false },
  })
  if (!voucher) throw new AppError('VOUCHER_NOT_FOUND')
  return voucher
}

export async function createVoucher(
  prisma: PrismaClient,
  adminId: string,
  data: {
    type: string
    title: string
    estimatedSaving: number
    description?: string
    terms?: string
    imageUrl?: string
    expiryDate?: string
  },
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const code = generateVoucherCode('RCV')
  const voucher = await prisma.voucher.create({
    data: {
      merchantId,
      code,
      isRmv: false,
      isMandatory: false,
      type: data.type as any,
      title: data.title,
      estimatedSaving: data.estimatedSaving,
      description: data.description,
      terms: data.terms,
      imageUrl: data.imageUrl,
      expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
      status: 'DRAFT',
      approvalStatus: 'PENDING',
    },
  })
  writeAuditLog(prisma, {
    entityId: merchantId,
    entityType: 'merchant',
    event: 'VOUCHER_CREATED',
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    metadata: { voucherId: voucher.id },
  })
  return voucher
}

export async function updateVoucher(
  prisma: PrismaClient,
  adminId: string,
  voucherId: string,
  data: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const voucher = await prisma.voucher.findFirst({
    where: { id: voucherId, merchantId, isRmv: false },
  })
  if (!voucher) throw new AppError('VOUCHER_NOT_FOUND')
  if (!EDITABLE_STATUSES.includes(voucher.status as any)) {
    throw new AppError('VOUCHER_NOT_EDITABLE')
  }

  const allowedFields = [
    'title',
    'description',
    'terms',
    'imageUrl',
    'estimatedSaving',
    'expiryDate',
    'type',
  ]
  const safe: Record<string, unknown> = {}
  for (const key of allowedFields) {
    if (key in data) safe[key] = data[key]
  }
  if (data.expiryDate) safe.expiryDate = new Date(data.expiryDate as string)

  const updated = await prisma.voucher.update({
    where: { id: voucherId },
    data: safe,
  })
  writeAuditLog(prisma, {
    entityId: merchantId,
    entityType: 'merchant',
    event: 'VOUCHER_UPDATED',
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    metadata: { voucherId },
  })
  return updated
}

export async function submitVoucher(
  prisma: PrismaClient,
  adminId: string,
  voucherId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const voucher = await prisma.voucher.findFirst({
    where: { id: voucherId, merchantId, isRmv: false },
  })
  if (!voucher) throw new AppError('VOUCHER_NOT_FOUND')
  if (!SUBMITTABLE_STATUSES.includes(voucher.status as any)) {
    throw new AppError('VOUCHER_NOT_SUBMITTABLE')
  }

  const updated = await prisma.voucher.update({
    where: { id: voucherId },
    data: { status: 'PENDING_APPROVAL', publishedAt: new Date() },
  })
  writeAuditLog(prisma, {
    entityId: merchantId,
    entityType: 'merchant',
    event: 'VOUCHER_SUBMITTED',
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    metadata: { voucherId },
  })
  return updated
}

export async function deleteVoucher(
  prisma: PrismaClient,
  adminId: string,
  voucherId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const voucher = await prisma.voucher.findFirst({
    where: { id: voucherId, merchantId, isRmv: false },
  })
  if (!voucher) throw new AppError('VOUCHER_NOT_FOUND')
  if (voucher.status !== 'DRAFT') throw new AppError('VOUCHER_NOT_DELETABLE')

  await prisma.voucher.delete({ where: { id: voucherId } })
  writeAuditLog(prisma, {
    entityId: merchantId,
    entityType: 'merchant',
    event: 'VOUCHER_DELETED',
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    metadata: { voucherId },
  })
  return { deleted: true }
}

// ─── RMV ───────────────────────────────────────────────────────────────────

export async function listRmvVouchers(prisma: PrismaClient, adminId: string) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  return prisma.voucher.findMany({
    where: { merchantId, isRmv: true },
    include: { rmvTemplate: true },
    orderBy: { createdAt: 'asc' },
  })
}

export async function updateRmvVoucher(
  prisma: PrismaClient,
  adminId: string,
  voucherId: string,
  proposedFields: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const voucher = await prisma.voucher.findFirst({
    where: { id: voucherId, merchantId, isRmv: true },
    include: { rmvTemplate: true },
  })
  if (!voucher) throw new AppError('RMV_NOT_FOUND')
  if (voucher.status !== 'DRAFT') throw new AppError('VOUCHER_NOT_EDITABLE')

  const allowedFields: string[] = Array.isArray(voucher.rmvTemplate?.allowedFields)
    ? (voucher.rmvTemplate.allowedFields as string[])
    : []
  const disallowed = Object.keys(proposedFields).filter(k => !allowedFields.includes(k))
  if (disallowed.length > 0) throw new AppError('RMV_FIELD_NOT_ALLOWED')

  const currentFields = (voucher.merchantFields as Record<string, unknown>) ?? {}
  const merged = { ...currentFields, ...proposedFields }

  const updated = await prisma.voucher.update({
    where: { id: voucherId },
    data: { merchantFields: merged as any },
  })
  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'RMV_UPDATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { voucherId } })
  return updated
}

export async function submitRmvVoucher(
  prisma: PrismaClient,
  adminId: string,
  voucherId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const voucher = await prisma.voucher.findFirst({ where: { id: voucherId, merchantId, isRmv: true } })
  if (!voucher) throw new AppError('RMV_NOT_FOUND')
  if (voucher.status !== 'DRAFT') throw new AppError('VOUCHER_NOT_SUBMITTABLE')

  const updated = await prisma.voucher.update({
    where: { id: voucherId },
    data: { status: 'PENDING_APPROVAL', publishedAt: new Date() },
  })
  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'RMV_SUBMITTED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { voucherId } })
  return updated
}

export async function provisionRmvVouchers(
  prisma: PrismaClient,
  merchantId: string,
  categoryId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  // This function is called INSIDE a transaction — do NOT call resolveAdminMerchant here
  const templates = await prisma.rmvTemplate.findMany({
    where: { categoryId, isActive: true },
    take: 2,
  })
  if (templates.length < 2) throw new AppError('NO_RMV_TEMPLATE')

  const vouchers = await Promise.all(templates.map(t =>
    prisma.voucher.create({
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
  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'RMV_PROVISIONED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { categoryId } })
  return vouchers
}

export async function handleCategoryChange(
  prisma: PrismaClient,
  merchantId: string,
  newCategoryId: string,
  confirm: boolean,
  ctx: { ipAddress: string; userAgent: string }
) {
  // Check if any RMV has been submitted (blocks category change)
  const submittedRmv = await prisma.voucher.findMany({
    where: { merchantId, isRmv: true, status: { in: ['PENDING_APPROVAL', 'ACTIVE'] } },
  })
  if (submittedRmv.length > 0) throw new AppError('CATEGORY_CHANGE_BLOCKED')

  if (!confirm) {
    return {
      requiresConfirmation: true,
      message: 'Changing category will discard your existing RMV drafts. Re-send with confirm: true to proceed.',
    }
  }

  // Atomically: soft-delete existing draft RMVs + update category + provision new RMVs
  await prisma.$transaction(async (tx) => {
    await tx.voucher.updateMany({
      where: { merchantId, isRmv: true, status: 'DRAFT' },
      data:  { status: 'INACTIVE' },
    })
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

  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'CATEGORY_CHANGED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { newCategoryId } })
  return { changed: true }
}
