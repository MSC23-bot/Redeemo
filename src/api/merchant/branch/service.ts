import { PrismaClient } from '../../../../generated/prisma/client'
import type Redis from 'ioredis'
import { AppError } from '../../shared/errors'
import { writeAuditLog, writeAuditLogTx } from '../../shared/audit'
import { resolveAdminMerchant, isDraftWindow, type EditActor } from '../shared'
import { encrypt, decrypt } from '../../shared/encryption'
import { resolvePostcode } from '../../lib/postcodeResolver'
import { findOrCreateLocality } from '../../lib/findOrCreateLocality'

/**
 * Plan 4 M1.21 — resolve a postcode via postcodes.io + find-or-create the
 * matching Locality. Returns the Branch location-snapshot fields ready to
 * spread into a Branch.create payload OR to merge into a
 * BranchPendingEdit.proposedChanges block for later admin apply.
 *
 * Throws AppError on resolver failure (POSTCODE_NOT_FOUND or
 * GAZETTEER_UNAVAILABLE — both defined in ERROR_DEFINITIONS, both surface as
 * their declared statusCode via the global error handler).
 *
 * locationConfidence is always 'POSTCODE_CENTROID' on resolve-on-write — a
 * postcode change re-anchors the branch pin to the postcode-area centroid.
 * Admin pin-drop / Phase 4 Merchant Portal geocoder upgrades to
 * MANUALLY_CONFIRMED via a separate path (out of scope for Plan 4a M1).
 */
async function resolveBranchLocationFields(prisma: PrismaClient, postcode: string) {
  const resolved = await resolvePostcode(postcode)
  if (!resolved.ok) {
    throw new AppError(resolved.error)
  }
  const locality = await findOrCreateLocality(prisma, resolved.snapshot)
  return {
    latitude:           resolved.snapshot.latitude,
    longitude:          resolved.snapshot.longitude,
    localityId:         locality.id,
    localityName:       locality.name,
    postTown:           resolved.snapshot.postTown ?? locality.postTown,
    ladDistrict:        resolved.snapshot.ladDistrict,
    adminCounty:        resolved.snapshot.adminCounty,
    region:             resolved.snapshot.region,
    locationCountry:    resolved.snapshot.country,
    locationResolvedAt: new Date(),
    locationConfidence: 'POSTCODE_CENTROID' as const,
  }
}

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

/**
 * Option B B2.4: the tight admin-facing branch shape. NEVER includes
 * `redemptionPin` (AES-encrypted) or asset/secret URLs (logoUrl/bannerUrl/
 * priceListUrl/about). Mirrors getMerchantDetail's branch select so the admin
 * create response cannot leak a branch secret.
 */
export function toAdminBranchShape(b: {
  id: string; name: string; isMainBranch: boolean; addressLine1: string
  addressLine2: string | null; city: string; postcode: string
  localityName: string | null; locationConfidence: string
  phone: string | null; email: string | null; websiteUrl: string | null; isActive: boolean
}) {
  return {
    id: b.id, name: b.name, isMainBranch: b.isMainBranch,
    addressLine1: b.addressLine1, addressLine2: b.addressLine2, city: b.city, postcode: b.postcode,
    localityName: b.localityName, locationConfidence: b.locationConfidence,
    phone: b.phone, email: b.email, websiteUrl: b.websiteUrl, isActive: b.isActive,
  }
}

/**
 * Option B B2.4: the shared branch-create core (D4 seam). BOTH the merchant
 * wrapper (actor MERCHANT_ADMIN) and the new admin route (actor ADMIN + reason)
 * call this, so validation/side-effects/audit are identical (no weaker path).
 * The postcode resolve STAYS before the transaction (a bad postcode or gazetteer
 * outage must reject before opening a tx); the branch.create + audit are inside
 * one transaction, actor-attributed, `entityType:'branch'`. Caller lat/lng are
 * dropped (pin-precise coords arrive via the separate confirm-location flow).
 */
export async function createBranchCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  data: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const existingCount = await prisma.branch.count({ where: { merchantId, deletedAt: null } })
  const isMainBranch = existingCount === 0

  const postcode = data.postcode as string | undefined
  if (!postcode) throw new AppError('POSTCODE_REQUIRED')
  const locationFields = await resolveBranchLocationFields(prisma, postcode)

  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.create({
      data: {
        merchantId,
        isMainBranch,
        name:         data.name as string,
        addressLine1: data.addressLine1 as string,
        addressLine2: data.addressLine2 as string | undefined,
        city:         data.city as string,
        postcode:     postcode,
        country:      (data.country as string | undefined) ?? 'GB',  // legacy address-country
        phone:        data.phone as string | undefined,
        email:        data.email as string | undefined,
        websiteUrl:   data.websiteUrl as string | undefined,
        logoUrl:      data.logoUrl as string | undefined,
        bannerUrl:    data.bannerUrl as string | undefined,
        about:        data.about as string | undefined,
        ...locationFields,  // latitude / longitude / localityId / localityName /
                            // postTown / ladDistrict / adminCounty / region /
                            // locationCountry / locationResolvedAt /
                            // locationConfidence = POSTCODE_CENTROID
      },
      include: BRANCH_INCLUDE,
    })
    await writeAuditLogTx(tx, {
      entityId: branch.id, entityType: 'branch', event: 'BRANCH_CREATED',
      actorId: actor.id, actorType: actor.type, reason: actor.reason,
      metadata: { merchantId },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    })
    return branch
  })
}

export async function createBranch(
  prisma: PrismaClient,
  adminId: string,
  data: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  return createBranchCore(prisma, { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } }, data, ctx)
}

/**
 * Option B B2.1: the shared simple-DIRECT branch apply core. Resolves +
 * ownership-validates the branch, filters `data` to DIRECT_FIELDS, captures a
 * before-snapshot, then writes + audits inside one transaction. BOTH the merchant
 * route (via `updateBranch`) and the new admin route call this so the
 * validation/apply/audit is identical (no weaker path). The audit row uses the
 * CORRECTED entity (entityType:'branch', entityId:branchId; matching the admin
 * precedents confirmBranchLocation + B1 editApplier) and carries the actor +
 * before/after + the ADMIN reason.
 */
export async function updateBranchDirectCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  branchId: string,
  data: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const safe: Record<string, unknown> = {}
  for (const key of DIRECT_FIELDS) {
    if (key in data) safe[key] = data[key]
  }

  const branch = await resolveBranch(prisma, branchId, merchantId)
  if (Object.keys(safe).length === 0) return branch

  const before: Record<string, unknown> = {}
  for (const k of Object.keys(safe)) before[k] = (branch as any)[k]

  return prisma.$transaction(async (tx) => {
    const updated = await tx.branch.update({
      where: { id: branchId },
      data: safe,
      include: BRANCH_INCLUDE,
    })
    await writeAuditLogTx(tx, {
      entityId: branchId,
      entityType: 'branch',
      event: 'BRANCH_UPDATED',
      actorId: actor.id,
      actorType: actor.type,
      before,
      after: safe,
      reason: actor.reason,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: { merchantId },
    })
    return updated
  })
}

/**
 * M2 B1 (D1): the draft-window SENSITIVE-direct branch apply core. Writes the
 * sensitive branch fields directly (transactional + actor audit), re-resolving
 * location via `resolveBranchLocationFields` when `postcode` is among the changes
 * (so a postcode change re-anchors lat/lng/locality to the postcode centroid -
 * NEVER writes a raw postcode without re-resolving). ONLY reachable from the
 * draft window (`updateBranch` gates on `isDraftWindow`); outside it the sensitive
 * fields keep routing through the governed `createBranchEditRequest` lane.
 *
 * Direct fields in the same payload are written alongside the sensitive ones. The
 * postcode resolve STAYS before the transaction (a bad postcode / gazetteer outage
 * must reject before opening a tx), matching `createBranchCore`.
 */
async function updateBranchSensitiveDirectCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  branchId: string,
  data: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const branch = await resolveBranch(prisma, branchId, merchantId)

  const safe: Record<string, unknown> = {}
  for (const key of SENSITIVE_FIELDS) if (key in data) safe[key] = data[key]
  for (const key of DIRECT_FIELDS) if (key in data) safe[key] = data[key]
  if (Object.keys(safe).length === 0) return branch

  // Re-resolve location on a postcode change (mirrors createBranchCore +
  // createBranchEditRequest). The resolved snapshot OVERWRITES any caller-supplied
  // latitude/longitude in `safe` - a postcode change re-anchors the pin to the
  // postcode centroid. trim() the candidate up front (PR #81 contract).
  if (typeof safe.postcode === 'string' && safe.postcode.trim().length > 0) {
    const locationFields = await resolveBranchLocationFields(prisma, safe.postcode as string)
    Object.assign(safe, locationFields)
  }

  const before: Record<string, unknown> = {}
  for (const k of Object.keys(safe)) before[k] = (branch as any)[k]

  return prisma.$transaction(async (tx) => {
    const updated = await tx.branch.update({
      where: { id: branchId },
      data: safe,
      include: BRANCH_INCLUDE,
    })
    await writeAuditLogTx(tx, {
      entityId: branchId,
      entityType: 'branch',
      event: 'BRANCH_UPDATED',
      actorId: actor.id,
      actorType: actor.type,
      before,
      after: safe,
      reason: actor.reason,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: { merchantId },
    })
    return updated
  })
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

  // M2 B1 (D1): sensitive branch fields write DIRECTLY in the draft window
  // (status REGISTERED, or onboardingStep NEEDS_CHANGES) with postcode
  // re-resolution; outside it they keep routing through the governed
  // createBranchEditRequest lane. The lifecycle read is a single targeted select.
  const attemptedSensitive = SENSITIVE_FIELDS.filter(key => key in data)
  if (attemptedSensitive.length > 0) {
    const lifecycle = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { status: true, onboardingStep: true },
    })
    if (!lifecycle) throw new AppError('MERCHANT_NOT_FOUND')

    if (isDraftWindow(lifecycle)) {
      // Draft window: apply sensitive (+ any direct) fields directly, re-resolving
      // location on a postcode change.
      return updateBranchSensitiveDirectCore(
        prisma,
        { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } },
        branchId,
        data,
        ctx
      )
    }

    // Live / governed: route the sensitive fields through the EXISTING
    // edit-request lane (createBranchEditRequest does its own ownership re-check,
    // PENDING_EDIT_EXISTS guard, and eager postcode resolution). Unchanged path.
    return createBranchEditRequest(prisma, adminId, branchId, data, false, ctx)
  }

  // Simple-DIRECT path: delegate to the shared core so the merchant path and
  // the admin path run identical validation/apply/audit. The core re-resolves +
  // ownership-validates the branch and filters `data` to DIRECT_FIELDS itself.
  return updateBranchDirectCore(
    prisma,
    { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } },
    branchId,
    data,
    ctx
  )
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

  // Plan 4 M1.21 — when the merchant is proposing a postcode change, eagerly
  // resolve and stash the full location snapshot in the pending edit so admin
  // approval is a clean apply. Two benefits: (a) merchant gets immediate
  // POSTCODE_NOT_FOUND / GAZETTEER_UNAVAILABLE feedback BEFORE admin sees the
  // request; (b) `proposedChanges.localityId` etc. are present at admin-approval
  // time so the apply step doesn't need to re-resolve.
  //
  // Resolved snapshot overwrites any caller-supplied latitude/longitude in
  // `filtered` — a postcode change re-anchors the pin to the postcode
  // centroid; pin-drop refinement is a separate (no-postcode) edit path.
  //
  // PR #81 review follow-up — trim() the postcode candidate before the
  // length check. A whitespace-only payload ("   ") would pass `length > 0`
  // and then trip resolvePostcode into the < 5-char POSTCODE_NOT_FOUND
  // branch; trimming up front gives a cleaner contract.
  if (typeof filtered.postcode === 'string' && filtered.postcode.trim().length > 0) {
    const locationFields = await resolveBranchLocationFields(prisma, filtered.postcode as string)
    Object.assign(filtered, locationFields)
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

/**
 * Option B B2.4: the shared branch-soft-delete core (D4 seam). BOTH the merchant
 * wrapper (actor MERCHANT_ADMIN) and the new admin route (actor ADMIN + reason)
 * call this. The guards (reads) stay BEFORE the transaction; the staff-user
 * deactivation cascade + the branch soft-delete + the audit are inside ONE
 * transaction (atomic - was previously two separate writes). Audit is
 * actor-attributed, `entityType:'branch'`. BRANCH_IS_MAIN + BRANCH_LAST_ACTIVE
 * guards preserved.
 */
export async function softDeleteBranchCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  branchId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
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

  await prisma.$transaction(async (tx) => {
    // Deactivate branch users (staff logins)
    await tx.branchUser.updateMany({ where: { branchId }, data: { status: 'INACTIVE' } })
    // Soft delete
    await tx.branch.update({ where: { id: branchId }, data: { deletedAt: new Date(), isActive: false } })
    await writeAuditLogTx(tx, {
      entityId: branchId, entityType: 'branch', event: 'BRANCH_DELETED',
      actorId: actor.id, actorType: actor.type, reason: actor.reason,
      metadata: { merchantId },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    })
  })

  return { ok: true as const }
}

export async function softDeleteBranch(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  return softDeleteBranchCore(prisma, { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } }, branchId, ctx)
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
  redis: Redis,
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

  // SMS via Twilio — SEC-H3 (Gate-PR-7) + §SEC.1: toll-fraud controls (E.164
  // check + country allowlist + per-phone/IP/branch caps + cooldown + global
  // circuit-breaker) as ONE atomic check-and-count. branch.phone MUST be stored
  // as E.164 (+44…) — a non-E.164 number is rejected with
  // SMS_DESTINATION_NOT_ALLOWED, never silently sent. The send is AWAITED so
  // the rate-limit counting + the route response reflect the actual attempt.
  if (branch.phone) {
    const { consumeSmsSend } = await import('../../shared/smsLimiter')
    const smsCtx = { phone: branch.phone, ip: ctx.ipAddress, scope: 'branchPin' as const, branchId }
    await consumeSmsSend(redis, smsCtx)
    const { default: twilio } = await import('twilio')
    const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
    await client.messages.create({
      to:   branch.phone,
      from: process.env.TWILIO_FROM_NUMBER!,
      body: `Your Redeemo branch PIN for ${branch.name} is: ${pin}. Keep this secure.`,
    })
  }

  // Email via the PR-0.4 outbox (dark by default). Supplementary to the SMS —
  // best-effort, so an email-path hiccup never fails the PIN send. The PIN is
  // never logged: it travels only inside the rendered email payload.
  if (branch.email) {
    try {
      const { notify } = await import('../../shared/notify')
      const { branchPinEmail } = await import('../../shared/emailTemplates')
      await notify(prisma, redis, {
        to: branch.email,
        recipientType: 'BRANCH_USER',
        recipientId: branchId,
        type: 'branch_pin',
        email: branchPinEmail(branch.name, pin),
        ip: ctx.ipAddress,
      })
    } catch (err) {
      console.warn('[branch-pin] email dispatch failed (non-fatal):', err instanceof Error ? err.message : String(err))
    }
  }

  writeAuditLog(prisma, {
    entityId: merchantId, entityType: 'merchant',
    event: 'BRANCH_PIN_SENT',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { branchId, channels: [branch.phone ? 'sms' : null, branch.email ? 'email' : null].filter(Boolean) },
  })

  return { message: 'PIN sent to branch staff' }
}
