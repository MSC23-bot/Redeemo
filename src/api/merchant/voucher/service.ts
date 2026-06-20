import { randomBytes } from 'crypto'
import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLog, writeAuditLogTx, type ActorType } from '../../shared/audit'
import { resolveAdminMerchant, resolveTopLevelCategoryId, type EditActor } from '../shared'

// Only DRAFT vouchers can be edited, submitted, or deleted
const EDITABLE_STATUSES = ['DRAFT'] as const
const SUBMITTABLE_STATUSES = ['DRAFT'] as const

function generateVoucherCode(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString('hex').toUpperCase()}`
}

// ─── M4a-7: TIME_LIMITED availability-window validation ─────────────────────
//
// Enforces spec §3.2 rules 1-4 + 7 + type-attachment (D2 lock):
//   1. Each row = one window-occurrence (split-day allowed).
//   2. Half-open ranges accept back-to-back non-overlap (rule encoded via
//      `<` strict inequality on overlap check).
//   3. "24:00" sentinel allowed ONLY as closeTime, NEVER as openTime; no
//      cross-midnight in single row (closeTime > openTime enforced).
//   4. No overlapping windows for same (voucherId, dayOfWeek).
//   7. submitVoucher rejects TIME_LIMITED with zero windows (enforced in
//      submitVoucher, not here).
//
// Branch-hours overlap (rule 5) NOT enforced in v1.
// Wall-clock Europe/London semantics (rule 6) is convention, not enforced.

type AvailabilityWindowInput = {
  dayOfWeek: number
  openTime:  string
  closeTime: string
}

// Mirror parseTimeString from shared/voucherAvailability.ts but with the
// "24:00" sentinel accepted (validation-layer only — the runtime
// window-occurrence math uses its own parser keyed to UTC anchors).
function parseTimeStringToMinutes(s: string): number {
  if (s === '24:00') return 1440
  const [hh, mm] = s.split(':').map(n => parseInt(n, 10))
  return hh * 60 + mm
}

// Service-layer format validation. The Zod schemas in routes.ts catch
// malformed strings at the HTTP boundary; this defense-in-depth check
// covers direct service-call paths (tests, batch jobs, future internal
// callers).
const OPEN_TIME_REGEX  = /^([01]\d|2[0-3]):[0-5]\d$/
const CLOSE_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/

function validateAvailabilityWindows(
  type: string,
  windows: AvailabilityWindowInput[] | undefined,
): void {
  if (!windows || windows.length === 0) return // empty is valid at create time (draft)

  // Type-attachment rule (D2 lock): windows are TIME_LIMITED only.
  if (type !== 'TIME_LIMITED') {
    throw new AppError('INVALID_AVAILABILITY_WINDOWS', {
      reason: 'availabilityWindows are only valid on TIME_LIMITED vouchers',
    })
  }

  // Per-row validation
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]

    // Format validation (defense-in-depth — Zod also catches this at the HTTP
    // boundary, but service-layer callers may bypass routes.ts).
    if (!OPEN_TIME_REGEX.test(w.openTime)) {
      throw new AppError('INVALID_AVAILABILITY_WINDOWS', {
        reason: `windows[${i}].openTime must be HH:mm in [00:00, 23:59] (got "${w.openTime}")`,
      })
    }
    if (!CLOSE_TIME_REGEX.test(w.closeTime)) {
      throw new AppError('INVALID_AVAILABILITY_WINDOWS', {
        reason: `windows[${i}].closeTime must be HH:mm in [00:01, 23:59] OR "24:00" (got "${w.closeTime}")`,
      })
    }

    // Reject "24:00" as openTime (regex-allowed only in closeTime).
    if (w.openTime === '24:00') {
      throw new AppError('INVALID_AVAILABILITY_WINDOWS', {
        reason: `windows[${i}].openTime cannot be "24:00"`,
      })
    }

    // closeTime > openTime arithmetic check (cross-midnight rejected).
    const openMin  = parseTimeStringToMinutes(w.openTime)
    const closeMin = parseTimeStringToMinutes(w.closeTime)
    if (closeMin <= openMin) {
      throw new AppError('INVALID_AVAILABILITY_WINDOWS', {
        reason: `windows[${i}].closeTime must be after openTime`,
      })
    }
  }

  // Overlap check: for each (voucherId, dayOfWeek) group, sort by openTime
  // and verify no later openTime is < previous closeTime. Strict `<` so
  // back-to-back boundary touches (e.g. 11-15 + 15-18) are valid.
  const byDay = new Map<number, Array<{ open: number; close: number; idx: number }>>()
  windows.forEach((w, idx) => {
    const arr = byDay.get(w.dayOfWeek) ?? []
    arr.push({
      open: parseTimeStringToMinutes(w.openTime),
      close: parseTimeStringToMinutes(w.closeTime),
      idx,
    })
    byDay.set(w.dayOfWeek, arr)
  })
  for (const [day, rows] of byDay) {
    rows.sort((a, b) => a.open - b.open)
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].open < rows[i - 1].close) {
        throw new AppError('INVALID_AVAILABILITY_WINDOWS', {
          reason: `windows[${rows[i].idx}] overlaps with windows[${rows[i - 1].idx}] on dayOfWeek=${day}`,
        })
      }
    }
  }
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
    availabilityWindows?: AvailabilityWindowInput[]
    // M5 Task 12.5 — REUSABLE cooldown propagation. Zod has already
    // enforced type/range/REUSABLE-scope at API ingress (routes.ts) and
    // the DB has matching CHECK constraints (Task 1); we just persist
    // the validated value here. `null` and `undefined` both map to a
    // null column (`undefined` = Prisma "do nothing" against a nullable
    // column with no default).
    cooldownSeconds?: number | null
  },
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  // M4a-7: validate windows BEFORE the Prisma create. Type-attachment +
  // per-row format + per-day overlap checks all run synchronously.
  validateAvailabilityWindows(data.type, data.availabilityWindows)

  const code = generateVoucherCode('RCV')
  const hasWindows = !!data.availabilityWindows && data.availabilityWindows.length > 0
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
      // M5 Task 12.5 — propagate validated cooldown. Zod refine (Task
      // 12) guarantees: REUSABLE → null OR >= 1800; non-REUSABLE → null.
      cooldownSeconds: data.cooldownSeconds ?? null,
      ...(hasWindows
        ? { availabilityWindows: { create: data.availabilityWindows } }
        : {}),
    },
    include: { availabilityWindows: true },
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
    include: { availabilityWindows: true },
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
    // M5 Task 12.5 — REUSABLE cooldown updatable on DRAFT vouchers. Zod
    // partial-refine (Task 12, routes.ts) already enforced the type
    // coherence rule + the 1800-floor before this code runs. The DB
    // CHECK constraint (Task 1) is the final safety net.
    'cooldownSeconds',
  ]
  const safe: Record<string, unknown> = {}
  for (const key of allowedFields) {
    if (key in data) safe[key] = data[key]
  }
  if (data.expiryDate) safe.expiryDate = new Date(data.expiryDate as string)

  // M4a-7: resolve effective type (post-merge) and effective windows.
  // Type-change rule: TIME_LIMITED → other type rejected when windows still attached.
  // Window-replacement rule: if `availabilityWindows` is supplied, replace
  // existing rows wholesale (deleteMany + create).
  const effectiveType =
    typeof data.type === 'string'
      ? data.type
      : (voucher.type as unknown as string)

  // PR #72 pre-merge review fix (Finding 2, 2026-05-12) — service-layer
  // cross-field cooldownSeconds validation. Zod's updateVoucherSchema
  // (routes.ts) no longer carries the cross-field refine because it
  // can't see the existing voucher's type on a partial PATCH. The check
  // runs here against `effectiveType` (merged type post-PATCH): a
  // non-null cooldownSeconds may only be set when the resulting type is
  // REUSABLE. Catches both:
  //   • PATCH { cooldownSeconds: 7200 } on a non-REUSABLE existing voucher
  //   • PATCH { type: 'BOGO', cooldownSeconds: 7200 } (explicit non-REUSABLE)
  // Allows the previously-blocked-but-valid case:
  //   • PATCH { cooldownSeconds: 7200 } on an existing REUSABLE voucher
  // null is always permitted regardless of effectiveType (the column
  // stays nullable; null is the default for non-REUSABLE types).
  if (
    'cooldownSeconds' in safe &&
    safe.cooldownSeconds !== null &&
    safe.cooldownSeconds !== undefined &&
    effectiveType !== 'REUSABLE'
  ) {
    throw new AppError('COOLDOWN_REUSABLE_ONLY')
  }

  const windowsSupplied = 'availabilityWindows' in data
  const newWindows = windowsSupplied
    ? (data.availabilityWindows as AvailabilityWindowInput[] | undefined)
    : undefined

  const existingWindowCount = (voucher.availabilityWindows ?? []).length

  if (windowsSupplied) {
    // Validate the new set against the effective type.
    validateAvailabilityWindows(effectiveType, newWindows)
  } else if (effectiveType !== 'TIME_LIMITED' && existingWindowCount > 0) {
    // Type change away from TIME_LIMITED while windows still attached → reject.
    throw new AppError('INVALID_AVAILABILITY_WINDOWS', {
      reason: 'Cannot change voucher type away from TIME_LIMITED while availability windows are attached. Clear windows first.',
    })
  }

  const updateData: Record<string, unknown> = { ...safe }
  if (windowsSupplied) {
    updateData.availabilityWindows = {
      deleteMany: {},
      ...(newWindows && newWindows.length > 0 ? { create: newWindows } : {}),
    }
  }

  const updated = await prisma.voucher.update({
    where: { id: voucherId },
    data: updateData as any,
    include: { availabilityWindows: true },
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
    include: { availabilityWindows: true },
  })
  if (!voucher) throw new AppError('VOUCHER_NOT_FOUND')
  if (!SUBMITTABLE_STATUSES.includes(voucher.status as any)) {
    throw new AppError('VOUCHER_NOT_SUBMITTABLE')
  }

  // M4a-7 Rule 7: TIME_LIMITED vouchers MUST have at least one availability
  // window before they can be submitted for approval / published.
  if (
    voucher.type === 'TIME_LIMITED' &&
    (voucher.availabilityWindows ?? []).length === 0
  ) {
    throw new AppError('TIME_LIMITED_REQUIRES_WINDOW')
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

/**
 * Option B B5.1: the RMV-EDIT core. Actor-aware so the admin path (actor ADMIN +
 * reason) and the merchant path (actor MERCHANT_ADMIN) share it (no weaker path).
 * Behaviour is unchanged from the previous `updateRmvVoucher`: DRAFT-only,
 * allowedFields KEY validation, merchantFields merge (top-level columns untouched).
 * The only change is the audit, which moves INSIDE the transaction and carries the
 * actor + reason + before/after (was fire-and-forget writeAuditLog). The
 * voucher.findFirst stays scoped to merchantId, so an admin acting on
 * /merchants/:id can never edit a voucher belonging to a different merchant (a
 * mismatch returns RMV_NOT_FOUND).
 */
export async function updateRmvVoucherCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  voucherId: string,
  proposedFields: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
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

  return prisma.$transaction(async (tx) => {
    const updated = await tx.voucher.update({
      where: { id: voucherId },
      data: { merchantFields: merged as any },
    })
    await writeAuditLogTx(tx, {
      entityId: merchantId, entityType: 'merchant', event: 'RMV_UPDATED',
      actorId: actor.id, actorType: actor.type, reason: actor.reason,
      before: { merchantFields: currentFields }, after: { merchantFields: merged },
      metadata: { voucherId }, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    })
    return updated
  })
}

// Merchant wrapper: unchanged signature; resolves the caller's own merchant
// (refuses SUSPENDED) and delegates to the core as MERCHANT_ADMIN.
export async function updateRmvVoucher(
  prisma: PrismaClient,
  adminId: string,
  voucherId: string,
  proposedFields: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  return updateRmvVoucherCore(
    prisma,
    { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } },
    voucherId,
    proposedFields,
    ctx
  )
}

/**
 * Option B B5.1: the RMV-SUBMIT core. Actor-aware (admin ADMIN + reason / merchant
 * MERCHANT_ADMIN), no weaker path. Behaviour unchanged from the previous
 * `submitRmvVoucher`: DRAFT-only gate (VOUCHER_NOT_SUBMITTABLE otherwise), NO
 * allowedFields-completeness gate (a blank-fields RMV can still be submitted, same
 * as the merchant path), status flips DRAFT -> PENDING_APPROVAL with publishedAt.
 * Audit moves INSIDE the transaction with actor + reason + before/after.
 */
export async function submitRmvVoucherCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  voucherId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const voucher = await prisma.voucher.findFirst({ where: { id: voucherId, merchantId, isRmv: true } })
  if (!voucher) throw new AppError('RMV_NOT_FOUND')
  if (voucher.status !== 'DRAFT') throw new AppError('VOUCHER_NOT_SUBMITTABLE')

  return prisma.$transaction(async (tx) => {
    const updated = await tx.voucher.update({
      where: { id: voucherId },
      data: { status: 'PENDING_APPROVAL', publishedAt: new Date() },
    })
    await writeAuditLogTx(tx, {
      entityId: merchantId, entityType: 'merchant', event: 'RMV_SUBMITTED',
      actorId: actor.id, actorType: actor.type, reason: actor.reason,
      before: { status: 'DRAFT' }, after: { status: 'PENDING_APPROVAL' },
      metadata: { voucherId }, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    })
    return updated
  })
}

// Merchant wrapper: unchanged signature; delegates to the core as MERCHANT_ADMIN.
export async function submitRmvVoucher(
  prisma: PrismaClient,
  adminId: string,
  voucherId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  return submitRmvVoucherCore(
    prisma,
    { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } },
    voucherId,
    ctx
  )
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

/**
 * Option B B2.3: the category-CHANGE path (an existing primaryCategoryId moving to
 * a different one). Actor-aware so the admin path (actor ADMIN + reason) and the
 * merchant path (actor MERCHANT_ADMIN) share it (no weaker path). The CATEGORY_
 * CHANGE_BLOCKED / requiresConfirmation / NO_RMV_TEMPLATE semantics are unchanged;
 * the only behavioural change is the audit, which moves INSIDE the transaction and
 * carries the actor + reason + before/after (was fire-and-forget writeAuditLog).
 */
export async function handleCategoryChange(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: { type: ActorType; id: string; reason?: string } },
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
      requiresConfirmation: true as const,
      message: 'Changing category will discard your existing RMV drafts. Re-send with confirm: true to proceed.',
    }
  }

  const beforeRow = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { primaryCategoryId: true } })

  // M2 B2: resolve the TOP-LEVEL parent for the template lookup (templates are
  // seeded at top-level; the new category may be a subcategory). A top-level id
  // resolves to itself, so the admin category path (which passes top-level ids) is
  // unchanged. Merchant.primaryCategoryId is still set to newCategoryId (subcategory).
  const templateCategoryId = await resolveTopLevelCategoryId(prisma, newCategoryId)

  // Atomically: soft-delete existing draft RMVs + update category + provision new
  // RMVs + write the actor-attributed audit (commits/rolls back with the change).
  await prisma.$transaction(async (tx) => {
    await tx.voucher.updateMany({
      where: { merchantId, isRmv: true, status: 'DRAFT' },
      data:  { status: 'INACTIVE' },
    })
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
      entityId: merchantId, entityType: 'merchant', event: 'CATEGORY_CHANGED',
      actorId: actor.id, actorType: actor.type, reason: actor.reason,
      before: { primaryCategoryId: beforeRow?.primaryCategoryId ?? null },
      after: { primaryCategoryId: newCategoryId },
      metadata: { newCategoryId },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    })
  })

  return { changed: true as const }
}
