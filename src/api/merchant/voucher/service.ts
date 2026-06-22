import { randomBytes } from 'crypto'
import { PrismaClient, Prisma } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLog, writeAuditLogTx, type ActorType } from '../../shared/audit'
import { resolveAdminMerchant, resolveTopLevelCategoryId, type EditActor } from '../shared'
import { isEligibleFlagshipType, FLAGSHIP_RMV_CAP } from './shared'

// Only DRAFT vouchers can be edited, submitted, or deleted
const EDITABLE_STATUSES = ['DRAFT'] as const
const SUBMITTABLE_STATUSES = ['DRAFT'] as const

function generateVoucherCode(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString('hex').toUpperCase()}`
}

// ─── M2 B4 (D8b): advisory saving sanity ─────────────────────────────────────
//
// A light present/positive check on the merchant voucher SAVE paths where the
// merchant writes a TOP-LEVEL estimatedSaving value (createVoucher always, and
// updateVoucher only when estimatedSaving is in the patch). The value must be a
// finite number greater than zero. There is NO hard floor (a below-ideal-floor
// but positive value is accepted; the floor is an advisory client-side scoring
// input per D8b, with admin review the quality backstop) and NO use of
// RmvTemplate.minimumSaving as a gate. The RMV create / edit cores do not let the
// merchant write a top-level estimatedSaving (create uses the template default;
// the RMV edit core only merges merchantFields), so this never touches B5.1.
function assertSavingSane(value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new AppError('SAVING_INVALID')
  }
}

// Decimal(10,2) holds at most 99999999.99; reject a bag value that would overflow
// the column so a poisoned saving maps to a clean SAVING_INVALID, never a Prisma error.
const RMV_SAVING_COLUMN_MAX = 100000000

// Fix 3 (Decimal(10,2) overflow guard): the custom create/update paths let a
// merchant write a TOP-LEVEL estimatedSaving directly. assertSavingSane only checks
// finite+positive, so a value like 1e9 reaches Prisma and overflows Decimal(10,2)
// (Postgres 22003 -> raw 500). Mirror the RMV bridge's rounding-boundary logic
// (Math.round(v*100)/100 then >= RMV_SAVING_COLUMN_MAX reject) so a too-large value
// is the clean SAVING_INVALID 400. Call AFTER assertSavingSane (which guarantees a
// finite number). Postgres rounds half-away-from-zero to scale 2 BEFORE the
// precision check, so a value just under the max (99999999.995) must be rejected too.
// Does NOT touch the RMV create / edit cores (they keep their own identical guard).
function assertSavingFitsColumn(value: number): void {
  const rounded = Math.round(value * 100) / 100
  if (rounded >= RMV_SAVING_COLUMN_MAX) {
    throw new AppError('SAVING_INVALID')
  }
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
  // Day-2 Vouchers A2: curated select (the Vouchers-module list consumer) + a
  // per-voucher redemption count via _count. The select is deliberately narrow
  // (no raw merchantFields, no redemptionPin-bearing relations) and pulls the
  // fields the list/card render needs. redemptionCount is mapped off _count so
  // the wire shape never exposes the internal aggregate object.
  const rows = await prisma.voucher.findMany({
    where: { merchantId, isRmv: false },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      approvalStatus: true,
      approvalComment: true,
      estimatedSaving: true,
      description: true,
      terms: true,
      isRmv: true,
      cooldownSeconds: true,
      publishedAt: true,
      expiryDate: true,
      approvedAt: true,
      createdAt: true,
      _count: { select: { redemptions: true } },
    },
  })
  return rows.map(({ _count, ...r }) => ({ ...r, redemptionCount: _count?.redemptions ?? 0 }))
}

export async function getVoucher(
  prisma: PrismaClient,
  adminId: string,
  voucherId: string
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  // Day-2 Vouchers A2: include _count additively so ALL scalar columns (incl
  // merchantFields, needed for the concierge proposed-vs-current diff) are kept
  // while the detail page gets a per-voucher redemption count. We strip the
  // internal _count and surface a flat redemptionCount.
  const voucher = await prisma.voucher.findFirst({
    where: { id: voucherId, merchantId, isRmv: false },
    include: { _count: { select: { redemptions: true } } },
  })
  if (!voucher) throw new AppError('VOUCHER_NOT_FOUND')
  const { _count, ...rest } = voucher
  return { ...rest, redemptionCount: _count?.redemptions ?? 0 }
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
    // Day-2 Vouchers A3 — opaque merchant-authored bag (askHelp + builder draft).
    // Written to Voucher.merchantFields. Defaults to {} when omitted.
    merchantFields?: Record<string, unknown>
  },
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  // M2 B4 (D8b): advisory present/positive saving sanity BEFORE any create. Zero /
  // negative / absent estimatedSaving is rejected with SAVING_INVALID; a positive
  // value (even below the advisory floor) is accepted.
  assertSavingSane(data.estimatedSaving)
  // Fix 3: also reject a value that overflows Decimal(10,2) (clean 400, not a 500).
  assertSavingFitsColumn(data.estimatedSaving)
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
      // Day-2 Vouchers A3 — store the merchant-authored bag (askHelp + builder
      // draft). Default to {} so the column is never null for a custom voucher,
      // matching the RMV create paths. status/approvalStatus/isRmv/merchantId are
      // server-set above and CANNOT be overridden by the bag.
      merchantFields: (data.merchantFields ?? {}) as Prisma.InputJsonValue,
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

  // Day-2 Vouchers A3 — merchantFields MERGES (never replaces). This preserves
  // existing keys (askHelp, the concierge adminProposed / adminNote, builder
  // draft state) when the patch only touches a subset of the bag. merchantFields
  // is intentionally NOT in allowedFields (which copies a value verbatim); it is
  // merged here. status/approvalStatus/isRmv/merchantId are never updatable from
  // the body (not in allowedFields and not merged), so the merchant cannot set
  // ACTIVE / APPROVED (security invariant spec §6.1).
  if ('merchantFields' in data && data.merchantFields && typeof data.merchantFields === 'object') {
    const currentBag = (voucher.merchantFields as Record<string, unknown> | null) ?? {}
    safe.merchantFields = { ...currentBag, ...(data.merchantFields as Record<string, unknown>) }
  }

  // M2 B4 (D8b): saving sanity ONLY when the patch writes a top-level
  // estimatedSaving value. A patch that omits estimatedSaving leaves the existing
  // value untouched and never trips the check. Zero / negative is rejected with
  // SAVING_INVALID; a positive value (even below the advisory floor) is accepted.
  if ('estimatedSaving' in safe) {
    assertSavingSane(safe.estimatedSaving)
    // Fix 3: also reject a value that overflows Decimal(10,2) (clean 400, not a 500).
    assertSavingFitsColumn(safe.estimatedSaving as number)
  }

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

  // Day-2 Vouchers A4: the status flip AND the VOUCHER approval lane row are
  // committed atomically. Create the AdminApproval{ type:'VOUCHER' } on first
  // submit; reopen the SAME row (clear the prior claim) on resubmit-after-changes,
  // mirroring the onboarding submitForApprovalCore reopen so the review thread is
  // never duplicated. NO notification fires on submit (no submit bell, spec §0).
  const updated = await prisma.$transaction(async (tx) => {
    const v = await tx.voucher.update({
      where: { id: voucherId },
      data: { status: 'PENDING_APPROVAL', publishedAt: new Date() },
    })

    const existing = await tx.adminApproval.findFirst({
      where: { type: 'VOUCHER', referenceId: voucherId },
      select: { id: true },
    })
    if (existing) {
      await tx.adminApproval.update({
        where: { id: existing.id },
        data: {
          status: 'PENDING',
          claimedById: null,
          claimedAt: null,
          actionedAt: null,
          comment: 'Merchant resubmitted voucher for approval',
        },
      })
    } else {
      await tx.adminApproval.create({
        data: {
          type: 'VOUCHER',
          status: 'PENDING',
          referenceId: voucherId,
          referenceType: 'voucher',
          comment: 'Merchant submitted voucher for approval',
        },
      })
    }
    return v
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
  // Day-2 Vouchers A2: ADD the per-voucher redemption count ADDITIVELY. The
  // existing onboarding flagship UI consumes rmvTemplate, so we keep
  // include:{ rmvTemplate:true } and only add _count (NOT a restrictive select,
  // which would drop rmvTemplate and break onboarding). redemptionCount is mapped
  // off _count; rmvTemplate and every scalar are preserved on the row.
  const rows = await prisma.voucher.findMany({
    where: { merchantId, isRmv: true },
    include: { rmvTemplate: true, _count: { select: { redemptions: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map(({ _count, ...r }) => ({ ...r, redemptionCount: _count?.redemptions ?? 0 }))
}

/**
 * M2 B3 (Decision D, D2/D3): the merchant flagship-RMV create path. The merchant
 * CHOOSES an eligible voucher type; this creates ONE template-linked DRAFT RMV with
 * defaults from the per-(category, type) RmvTemplate. Replaces the old auto-provision
 * -2-fixed flow for the merchant builder (the standalone `provisionRmvVouchers` +
 * the auto-provisioning inside `setMerchantCategoryCore` / `handleCategoryChange`
 * are intentionally left untouched in this MINIMAL slice; their harmonisation is a
 * separate owner-gated slice C).
 *
 * Flow: resolve the caller's OWN merchant (refuses SUSPENDED) -> read the merchant's
 * primaryCategoryId (the SUBCATEGORY) -> walk to the TOP-LEVEL parent (templates +
 * eligibility live at top-level) -> validate the chosen type is flagship-eligible
 * (reject TIME_LIMITED / REUSABLE with VOUCHER_TYPE_NOT_ELIGIBLE) -> find the
 * (categoryId, voucherType, isActive) template (NO_RMV_TEMPLATE if missing) ->
 * create the RMV linked to that template (isRmv / isMandatory / rmvTemplateId / type
 * + title/description/estimatedSaving defaulted from the template; status DRAFT,
 * approvalStatus PENDING, merchantFields {}) with an RMV-prefixed code -> audit.
 *
 * The RMV stays TEMPLATE-LINKED so `updateRmvVoucherCore` (B5.1) can read
 * `allowedFields` and the guided update keeps working. There is NO server-side
 * saving floor here: the floor is an ADVISORY scoring input (D8b); admin review is
 * the quality backstop. Light present/positive saving sanity is B4, not B3.
 */
export async function createFlagshipRmvVoucher(
  prisma: PrismaClient,
  adminId: string,
  voucherType: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)

  // Eligibility gate FIRST (before any merchant/category/template read), so an
  // ineligible type is rejected cheaply with a clear error. This stays ahead of the
  // cap check below so an ineligible type rejects before ANY DB work.
  if (!isEligibleFlagshipType(voucherType)) {
    throw new AppError('VOUCHER_TYPE_NOT_ELIGIBLE')
  }

  // Cap check: at most FLAGSHIP_RMV_CAP (2) mandatory flagship RMVs per merchant.
  // Count only slot-occupying statuses (DRAFT / PENDING_APPROVAL / ACTIVE); INACTIVE
  // and REJECTED free a slot, matching handleCategoryChange's DRAFT->INACTIVE discard.
  // This is a sequential / count guard: the realistic vector is repeated API calls
  // or a buggy / double-submitting frontend. A fully concurrent double-submit race
  // would need a DB constraint (schema) and is intentionally out of scope for this
  // no-schema slice; no transaction is added here for race-safety.
  const flagshipCount = await prisma.voucher.count({
    where: { merchantId, isRmv: true, status: { in: ['DRAFT', 'PENDING_APPROVAL', 'ACTIVE'] } },
  })
  if (flagshipCount >= FLAGSHIP_RMV_CAP) {
    throw new AppError('FLAGSHIP_RMV_LIMIT_REACHED')
  }

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { primaryCategoryId: true },
  })
  if (!merchant?.primaryCategoryId) throw new AppError('NO_RMV_TEMPLATE')

  // Templates + eligibility live at the TOP-LEVEL category; primaryCategoryId is the
  // SUBCATEGORY. Walk to the top-level parent for the lookup (a top-level id resolves
  // to itself).
  const templateCategoryId = await resolveTopLevelCategoryId(prisma, merchant.primaryCategoryId)

  const template = await prisma.rmvTemplate.findFirst({
    where: { categoryId: templateCategoryId, voucherType: voucherType as any, isActive: true },
  })
  if (!template) throw new AppError('NO_RMV_TEMPLATE')

  const voucher = await prisma.voucher.create({
    data: {
      merchantId,
      code:            `RMV-${randomBytes(4).toString('hex').toUpperCase()}`,
      isRmv:           true,
      isMandatory:     true,
      rmvTemplateId:   template.id,
      type:            template.voucherType,
      title:           template.title,
      description:     template.description,
      estimatedSaving: template.minimumSaving,
      status:          'DRAFT',
      approvalStatus:  'PENDING',
      merchantFields:  {},
    },
  })
  writeAuditLog(prisma, {
    entityId: merchantId,
    entityType: 'merchant',
    event: 'RMV_CREATED',
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    metadata: { voucherId: voucher.id, voucherType, rmvTemplateId: template.id },
  })
  return voucher
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
  // `rmvTemplate` is included so the discount re-link (step 2 below) can read the
  // current template's top-level categoryId for the sibling lookup.
  const voucher = await prisma.voucher.findFirst({
    where: { id: voucherId, merchantId, isRmv: true },
    include: { rmvTemplate: true },
  })
  if (!voucher) throw new AppError('RMV_NOT_FOUND')
  if (voucher.status !== 'DRAFT') throw new AppError('VOUCHER_NOT_SUBMITTABLE')

  // ── M2 flagship voucher bridge ──────────────────────────────────────────
  //
  // The F5 builder PATCHes the whole edit body into Voucher.merchantFields (via
  // updateRmvVoucherCore / B5.1, which writes NOTHING to the top-level columns).
  // So the merchant-authored title/description/estimatedSaving/terms/imageUrl sit
  // in the bag, and the discount type may have been flipped (fixed<->percent) in
  // the builder while Voucher.type stayed as created. Customer + admin reads use
  // the TOP-LEVEL columns, so at submit time we promote those fields onto the
  // columns and (for discount vouchers) re-link type + template to match the
  // merchant's chosen discountKind. All of this is part of the existing submit
  // transaction so it commits/rolls back atomically with the status flip.
  const bag = (voucher.merchantFields as Record<string, unknown> | null) ?? {}

  // Step 1 (A): promote the merchant-authored fields, TYPE-GUARDED. Presence check
  // per field: a key absent (or null) from the bag keeps the existing column value
  // (the template default). title/description/terms/estimatedSaving are always set
  // by the builder once edited; imageUrl may be undefined when no photo was set, in
  // which case we keep the existing column.
  //
  // The RMV PATCH body is z.record(z.string(), z.unknown()) and updateRmvVoucherCore
  // (B5.1) validates allowed KEYS but NOT value TYPES, so an off-contract direct API
  // caller can store a malformed value in the bag. We guard each field so a poisoned
  // bag can never reach Prisma as a wrong-typed / out-of-range value.
  const promoted: Record<string, unknown> = {}

  // Strings (title/description/terms/imageUrl): promote ONLY when the value is a
  // string; a non-string value is IGNORED (the column keeps its template default).
  // This is consistent with the presence-check philosophy above (a malformed value
  // is treated like an absent key); the only producer of these bag keys is the F5
  // builder, which always sends strings, so this is a defensive backstop against
  // off-contract direct callers. Graceful degradation to the template default is
  // safer than hard-failing a legitimate submit, and admin review is the content
  // backstop.
  for (const field of ['title', 'description', 'terms', 'imageUrl'] as const) {
    if (field in bag && typeof bag[field] === 'string') {
      promoted[field] = bag[field]
    }
  }

  // estimatedSaving is a customer-facing Decimal column (load-bearing quantitative
  // data the customer sees). If present and non-null it MUST be a finite number > 0
  // that also fits Decimal(10,2); otherwise we throw the existing clean SAVING_INVALID
  // (a 400, not a Prisma 500). We do NOT silently drop an invalid saving to the
  // template default. Absent/null keeps the existing column (unchanged behaviour).
  // The throw happens BEFORE prisma.$transaction, so there is no partial write.
  if ('estimatedSaving' in bag && bag.estimatedSaving != null) {
    const saving = bag.estimatedSaving
    assertSavingSane(saving) // not a number / not finite / <= 0 throws SAVING_INVALID
    // Postgres rounds a numeric(10,2) input half-away-from-zero to scale 2 BEFORE the
    // precision check, so a raw value just under the column max (e.g. 99999999.995)
    // would round up to 100000000.00 and overflow. Round to scale 2 here to match what
    // Postgres will store, reject if the rounded value overflows the column, and promote
    // the rounded value so Postgres receives an already-scale-2 number it cannot re-round
    // into an overflow.
    const roundedSaving = Math.round((saving as number) * 100) / 100
    if (roundedSaving >= RMV_SAVING_COLUMN_MAX) {
      throw new AppError('SAVING_INVALID')
    }
    promoted.estimatedSaving = roundedSaving
  }

  // Step 2 (A-style): re-link the discount type. The builder draft bag is nested
  // one level deeper under bag.merchantFields; discountKind is 'fixed' | 'percent'.
  const nested = (bag.merchantFields as Record<string, unknown> | undefined) ?? undefined
  const discountKind = nested?.discountKind
  const currentType = voucher.type as unknown as string
  let impliedType: 'DISCOUNT_FIXED' | 'DISCOUNT_PERCENT' | null = null
  if (currentType === 'DISCOUNT_PERCENT' || currentType === 'DISCOUNT_FIXED') {
    if (discountKind === 'fixed') impliedType = 'DISCOUNT_FIXED'
    else if (discountKind === 'percent') impliedType = 'DISCOUNT_PERCENT'
  }
  let relink: { type: string; rmvTemplateId: string } | null = null
  if (impliedType && impliedType !== currentType) {
    // The implied type differs from the current type: find the sibling template
    // for the SAME top-level category. Defensively keep the current type/template
    // if the sibling is missing (both kinds are seeded per category, so this
    // should not happen) so the submit never fails on a missing sibling.
    const categoryId = voucher.rmvTemplate?.categoryId
    if (categoryId) {
      const sibling = await prisma.rmvTemplate.findFirst({
        where: { categoryId, voucherType: impliedType as any, isActive: true },
      })
      if (sibling) relink = { type: impliedType, rmvTemplateId: sibling.id }
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.voucher.update({
      where: { id: voucherId },
      data: {
        ...promoted,
        ...(relink ?? {}),
        status: 'PENDING_APPROVAL',
        publishedAt: new Date(),
      } as any,
    })
    await writeAuditLogTx(tx, {
      entityId: merchantId, entityType: 'merchant', event: 'RMV_SUBMITTED',
      actorId: actor.id, actorType: actor.type, reason: actor.reason,
      before: { status: 'DRAFT' }, after: { status: 'PENDING_APPROVAL' },
      // The promoted/relinked columns travel on the voucher.update above. The
      // RMV_SUBMITTED audit before/after/metadata shape is left unchanged so the
      // existing merchant + admin co-build submit audit contracts still hold.
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
