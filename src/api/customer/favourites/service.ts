import {
  PrismaClient, Prisma, MerchantStatus, VoucherStatus, ApprovalStatus, VoucherType,
} from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { isOpenNow } from '../../shared/isOpenNow'
import { getCurrentCycleWindow } from '../../subscription/cycle'
import { exposeBranchPosition } from '../discovery/service'
import { getCurrentWindowOccurrence } from '../../shared/voucherAvailability'
import { computeAvailableAgainAt } from '../../redemption/reusable'

/**
 * TIME_LIMITED urgency threshold — 60 minutes.
 *
 * OWNER LOCKED Gate H 2026-05-11 — product-wide threshold across:
 *   - Voucher Detail `useTimeLimited` (apps/customer-app/src/features/voucher/hooks/useTimeLimited.ts)
 *   - Merchant Profile voucher card sort (apps/customer-app/src/features/merchant/utils/voucherCardSort.ts)
 *   - Voucher state pill component
 *
 * Drift between this backend constant and the customer-app constants
 * produces visible UX contradictions (a card in sort bucket 1 rendering
 * an "Active" pill, etc.). Parity is pinned by
 * `tests/api/customer/favourites.vouchers.threshold-parity.test.ts`.
 *
 * Supersedes spec §6.2's older <30 min wording.
 */
export const URGENT_THRESHOLD_MS = 60 * 60_000

export async function addFavouriteMerchant(prisma: PrismaClient, userId: string, merchantId: string) {
  try {
    return await prisma.favouriteMerchant.create({
      data: { userId, merchantId },
      select: { id: true, merchantId: true, createdAt: true },
    })
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError('ALREADY_FAVOURITED')
    }
    throw e
  }
}

export async function removeFavouriteMerchant(prisma: PrismaClient, userId: string, merchantId: string) {
  try {
    await prisma.favouriteMerchant.delete({ where: { userId_merchantId: { userId, merchantId } } })
    return { success: true }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      throw new AppError('FAVOURITE_NOT_FOUND')
    }
    throw e
  }
}

export async function listFavouriteMerchants(
  prisma: PrismaClient,
  userId: string,
  opts: { page: number; limit: number },
) {
  const { page, limit } = opts
  const skip = (page - 1) * limit

  const [rows, total] = await Promise.all([
    prisma.favouriteMerchant.findMany({
      // SEC-C3 (Gate-PR-4b): drop favourites pointing at seed/demo merchants
      // so they never render as real supply tiles. List + count share the filter.
      where: { userId, merchant: { isTestData: false } },
      select: {
        createdAt: true,
        merchant: {
          select: {
            id: true, businessName: true, tradingName: true,
            logoUrl: true, bannerUrl: true, status: true,
            primaryCategory: { select: { id: true, name: true } },
            vouchers: {
              where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED, isTestData: false },
              select: { estimatedSaving: true },
            },
            branches: {
              where: { isActive: true, isTestData: false },
              orderBy: { isMainBranch: 'desc' },
              take: 1,
              select: {
                id: true, name: true, addressLine1: true,
                latitude: true, longitude: true, isMainBranch: true,
                openingHours: {
                  select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.favouriteMerchant.count({ where: { userId, merchant: { isTestData: false } } }),
  ])

  // Compute ratings via branch groupBy (same pattern as discovery service)
  const branchIds = rows.flatMap(r => r.merchant.branches.map(b => b.id))
  const ratingGroups = branchIds.length > 0
    ? await prisma.review.groupBy({
        by: ['branchId'],
        where: { branchId: { in: branchIds }, isHidden: false },
        _avg: { rating: true },
        _count: { id: true },
      })
    : []
  const ratingByBranch = Object.fromEntries(
    ratingGroups.map((g: any) => [g.branchId, { avg: g._avg.rating ?? 0, count: g._count.id }]),
  )

  const enriched = rows.map(r => {
    const m = r.merchant
    const branch = m.branches[0] ?? null
    const isUnavailable = m.status !== MerchantStatus.ACTIVE
    const isOpen = !isUnavailable && branch ? isOpenNow(branch.openingHours as any) : false
    const activeVouchers = m.vouchers
    const voucherCount = activeVouchers.length
    const maxEstimatedSaving = activeVouchers.length > 0
      ? Math.max(...activeVouchers.map(v => Number(v.estimatedSaving)))
      : 0

    let totalRating = 0; let totalCount = 0
    for (const b of m.branches) {
      const rb = ratingByBranch[b.id]
      if (rb) { totalRating += rb.avg * rb.count; totalCount += rb.count }
    }
    const avgRating   = totalCount > 0 ? Math.round((totalRating / totalCount) * 10) / 10 : null
    const reviewCount = totalCount

    return {
      id: m.id,
      businessName: m.businessName,
      tradingName:  m.tradingName,
      logoUrl:      m.logoUrl,
      bannerUrl:    m.bannerUrl,
      status:       m.status,
      primaryCategory: m.primaryCategory,
      voucherCount,
      maxEstimatedSaving,
      avgRating,
      reviewCount,
      isOpen,
      branch: branch ? {
        id:           branch.id,
        name:         branch.name,
        addressLine1: branch.addressLine1,
        latitude:     branch.latitude ? Number(branch.latitude) : null,
        longitude:    branch.longitude ? Number(branch.longitude) : null,
      } : null,
      favouritedAt: r.createdAt,
      isUnavailable,
    }
  })

  // Sort: open first, suspended last; within group order is already by favouritedAt desc from DB
  const sorted = enriched.sort((a, b) => {
    if (a.isUnavailable !== b.isUnavailable) return a.isUnavailable ? 1 : -1
    if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1
    return 0
  })

  const items = sorted.slice(skip, skip + limit)
  return { items, total, page, limit }
}

export async function addFavouriteVoucher(prisma: PrismaClient, userId: string, voucherId: string) {
  try {
    return await prisma.favouriteVoucher.create({
      data: { userId, voucherId },
      select: { id: true, voucherId: true, createdAt: true },
    })
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError('ALREADY_FAVOURITED')
    }
    throw e
  }
}

export async function removeFavouriteVoucher(prisma: PrismaClient, userId: string, voucherId: string) {
  try {
    await prisma.favouriteVoucher.delete({ where: { userId_voucherId: { userId, voucherId } } })
    return { success: true }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      throw new AppError('FAVOURITE_NOT_FOUND')
    }
    throw e
  }
}

/**
 * Compute the Smart 7-bucket priority for a single favourited voucher row
 * (spec §9.3 — locked v1.1).
 *
 *   1. Urgent — TL inside its current window with < URGENT_THRESHOLD_MS remaining
 *   2. Active + available (TL active, REUSABLE available, non-TL not redeemed)
 *   3. REUSABLE in cooldown
 *   4. Non-TL non-REUSABLE redeemed-this-cycle
 *   5. TIME_LIMITED outside window (no live current occurrence)
 *   6. Unavailable (voucher status / approval / merchant.status not active)
 *   7. Expired
 *
 * Pure: no DB I/O. Callers pre-fetch the per-row inputs.
 */
function computeVoucherPriorityBucket(input: {
  type: VoucherType
  status: VoucherStatus
  approvalStatus: ApprovalStatus
  merchantStatus: MerchantStatus
  expiryDate: Date | null
  cooldownSeconds: number | null
  availabilityWindows: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>
  redeemedThisCycle: boolean
  lastRedeemedAt: Date | null
  now: Date
}): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const {
    type, status, approvalStatus, merchantStatus, expiryDate,
    cooldownSeconds, availabilityWindows, redeemedThisCycle, lastRedeemedAt, now,
  } = input

  // Bucket 7 — expired is the terminal state regardless of everything else.
  if (expiryDate && expiryDate.getTime() <= now.getTime()) return 7

  // Bucket 6 — voucher or merchant is inactive / pending.
  const voucherActive = status === VoucherStatus.ACTIVE && approvalStatus === ApprovalStatus.APPROVED
  const merchantActive = merchantStatus === MerchantStatus.ACTIVE
  if (!voucherActive || !merchantActive) return 6

  // Bucket 1 / 2 / 5 — TIME_LIMITED gating.
  if (type === VoucherType.TIME_LIMITED) {
    const currentWindow = getCurrentWindowOccurrence(availabilityWindows, now)
    if (currentWindow) {
      const remaining = currentWindow.endsAt.getTime() - now.getTime()
      if (remaining > 0) {
        return remaining < URGENT_THRESHOLD_MS ? 1 : 2
      }
      // Stale: endsAt is in the past (fixture in-window then now drifted past).
      // Fall through to bucket 5 so the row is not labelled live.
    }
    return 5
  }

  // Bucket 2 / 3 — REUSABLE cooldown gating.
  if (type === VoucherType.REUSABLE) {
    const availableAgainAt = computeAvailableAgainAt(lastRedeemedAt, { cooldownSeconds })
    if (availableAgainAt && availableAgainAt.getTime() > now.getTime()) return 3
    return 2
  }

  // Bucket 2 / 4 — non-TL non-REUSABLE.
  if (redeemedThisCycle) return 4
  return 2
}

export async function listFavouriteVouchers(
  prisma: PrismaClient,
  userId: string,
  opts: { page: number; limit: number; now?: Date },
) {
  const { page, limit } = opts
  const skip = (page - 1) * limit
  // `now` is the only intentional test seam — the integration test pins
  // it to a known mid-afternoon UK time so the TL urgent / active /
  // outside-window fixtures don't drift across CI clock-of-day.
  const now = opts.now ?? new Date()

  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { cycleAnchorDate: true },
  })
  let cycleStart: Date | null = null
  if (subscription?.cycleAnchorDate) {
    const window = getCurrentCycleWindow(subscription.cycleAnchorDate, now)
    cycleStart = window.cycleStart
  }

  // Spec §6.3 — fetch ALL rows for this user (no LIMIT). Sort happens
  // in JS after the per-row priority bucket is computed; the page slice
  // is the LAST step. This is the only correctness-preserving option
  // given an N-keyed global sort; spec §6.3 "Cost model" caps real-world
  // N ≤ 200 per user and accepts the per-request enrichment overhead.
  const rows = await prisma.favouriteVoucher.findMany({
    // SEC-C3 (Gate-PR-4b): drop favourites pointing at seed/demo vouchers (or
    // vouchers under a seed/demo merchant). `total` derives from these rows.
    where: { userId, voucher: { isTestData: false, merchant: { isTestData: false } } },
    select: {
      createdAt: true,
      voucher: {
        select: {
          id: true, title: true, type: true, estimatedSaving: true,
          description: true, expiryDate: true,
          status: true, approvalStatus: true,
          // cooldownSeconds — REUSABLE priority-bucket input only.
          // D19 lock: never exposed on the customer payload (stripped below).
          cooldownSeconds: true,
          // availabilityWindows — TL priority-bucket input only. Not
          // exposed on the per-row payload (kept inline; the Voucher
          // Detail surface owns the full TL window shape).
          availabilityWindows: {
            select: { dayOfWeek: true, openTime: true, closeTime: true },
          },
          merchant: {
            select: { id: true, businessName: true, logoUrl: true, status: true },
          },
        },
      },
    },
    // Stable secondary sort within priority buckets.
    orderBy: { createdAt: 'desc' },
  })
  const total = rows.length

  const voucherIds = rows.map(r => r.voucher.id)

  // Per-cycle redemption set (drives bucket 4 for non-TL non-REUSABLE rows).
  const cycleStates = cycleStart && voucherIds.length > 0
    ? await prisma.userVoucherCycleState.findMany({
        where: {
          userId,
          voucherId: { in: voucherIds },
          cycleStartDate: { gte: cycleStart },
          isRedeemedInCurrentCycle: true,
        },
        select: { voucherId: true },
      })
    : []
  const redeemedSet = new Set(cycleStates.map(s => s.voucherId))

  // Last-redemption batch (drives REUSABLE cooldown — bucket 3 / bucket 2).
  // Constrained to REUSABLE voucher ids so the groupBy stays tight.
  const reusableVoucherIds = rows
    .filter(r => r.voucher.type === VoucherType.REUSABLE)
    .map(r => r.voucher.id)
  const lastRedemptionMap = new Map<string, Date>()
  if (reusableVoucherIds.length > 0) {
    const lastRedRows = await prisma.voucherRedemption.groupBy({
      by: ['voucherId'],
      where: { userId, voucherId: { in: reusableVoucherIds } },
      _max: { redeemedAt: true },
    })
    for (const r of lastRedRows) {
      if (r._max.redeemedAt) lastRedemptionMap.set(r.voucherId, r._max.redeemedAt)
    }
  }

  const enriched = rows.map(r => {
    const v = r.voucher
    const voucherActive  = v.status === VoucherStatus.ACTIVE && v.approvalStatus === ApprovalStatus.APPROVED
    const merchantActive = v.merchant.status === MerchantStatus.ACTIVE
    const isUnavailable  = !voucherActive || !merchantActive
    const redeemedThisCycle = redeemedSet.has(v.id)
    const lastRedeemedAt = lastRedemptionMap.get(v.id) ?? null

    const priorityBucket = computeVoucherPriorityBucket({
      type:               v.type,
      status:             v.status,
      approvalStatus:     v.approvalStatus,
      merchantStatus:     v.merchant.status,
      expiryDate:         v.expiryDate ?? null,
      cooldownSeconds:    v.cooldownSeconds ?? null,
      availabilityWindows: v.availabilityWindows ?? [],
      redeemedThisCycle,
      lastRedeemedAt,
      now,
    })

    return {
      id:                       v.id,
      title:                    v.title,
      type:                     v.type,
      estimatedSaving:          Number(v.estimatedSaving),
      description:              v.description ?? null,
      expiresAt:                v.expiryDate ?? null,
      status:                   v.status,
      approvalStatus:           v.approvalStatus,
      isRedeemedInCurrentCycle: redeemedThisCycle,
      merchant:                 v.merchant,
      favouritedAt:             r.createdAt,
      isUnavailable,
      priorityBucket,
    }
  })

  // Global sort: priority bucket asc, then favouritedAt desc (rows were
  // pre-ordered by createdAt desc — Array.prototype.sort is stable since
  // ES2019, so the within-bucket order is preserved).
  enriched.sort((a, b) => a.priorityBucket - b.priorityBucket)

  const items = enriched.slice(skip, skip + limit)
  return { items, total, page, limit }
}

// ─────────────────────────────────────────────────────────────────────────
// FavouriteBranch — Phase 3C.1g (branch-level favourites). Mirrors the
// FavouriteMerchant + FavouriteVoucher patterns above.  FavouriteMerchant
// remains live during the v1 transition; the cleanup PR removes the
// merchant-level table/routes once the customer-app cut-over has settled.
// ─────────────────────────────────────────────────────────────────────────

export async function addFavouriteBranch(prisma: PrismaClient, userId: string, branchId: string) {
  try {
    return await prisma.favouriteBranch.create({
      data: { userId, branchId },
      select: { id: true, branchId: true, createdAt: true },
    })
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError('ALREADY_FAVOURITED')
    }
    throw e
  }
}

export async function removeFavouriteBranch(prisma: PrismaClient, userId: string, branchId: string) {
  try {
    await prisma.favouriteBranch.delete({ where: { userId_branchId: { userId, branchId } } })
    return { success: true }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      throw new AppError('FAVOURITE_NOT_FOUND')
    }
    throw e
  }
}

/**
 * List a user's favourite branches with full enrichment (parent merchant,
 * voucher count + max saving, branch-keyed ratings, isOpen, isUnavailable).
 *
 * Global sort applied BEFORE pagination, matching `listFavouriteMerchants`:
 *   isUnavailable last → isOpen first within available → favouritedAt desc
 * within ties (preserved by the underlying SQL ORDER BY).
 *
 * Branch position (lat/lng) is gated by the locked redaction contract
 * via `exposeBranchPosition`: POSTCODE_CENTROID branches return null
 * coords + `locationConfidence` only.
 */
export async function listFavouriteBranches(
  prisma: PrismaClient,
  userId: string,
  opts: { page: number; limit: number },
) {
  const { page, limit } = opts
  const skip = (page - 1) * limit

  const [rows, total] = await Promise.all([
    prisma.favouriteBranch.findMany({
      // SEC-C3 (Gate-PR-4b): drop favourites pointing at seed/demo branches (or
      // branches under a seed/demo merchant). List + count share the filter.
      where: { userId, branch: { isTestData: false, merchant: { isTestData: false } } },
      select: {
        createdAt: true,
        branch: {
          select: {
            id: true, name: true, isActive: true, isMainBranch: true,
            addressLine1: true, addressLine2: true, city: true, postcode: true,
            latitude: true, longitude: true, locationConfidence: true,
            openingHours: {
              select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
            },
            merchant: {
              select: {
                id: true, businessName: true, tradingName: true,
                logoUrl: true, bannerUrl: true, status: true,
                primaryCategory: { select: { id: true, name: true } },
                vouchers: {
                  where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED, isTestData: false },
                  select: { estimatedSaving: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.favouriteBranch.count({ where: { userId, branch: { isTestData: false, merchant: { isTestData: false } } } }),
  ])

  // Branch-keyed ratings (NOT a merchant rollup — Phase 3C.1g + the
  // `contextBranchId` standing direction: ratings on a branch surface
  // belong to THAT branch).
  const branchIds = rows.map(r => r.branch.id)
  const ratingGroups = branchIds.length > 0
    ? await prisma.review.groupBy({
        by: ['branchId'],
        where: { branchId: { in: branchIds }, isHidden: false },
        _avg: { rating: true },
        _count: { id: true },
      })
    : []
  const ratingByBranch = Object.fromEntries(
    ratingGroups.map((g: any) => [g.branchId, { avg: g._avg.rating ?? 0, count: g._count.id }]),
  )

  const enriched = rows.map(r => {
    const b = r.branch
    const m = b.merchant
    // Unavailable if EITHER the branch or the parent merchant is not
    // ACTIVE.  Mirrors `listFavouriteMerchants`'s unavailability gate.
    const branchActive   = b.isActive
    const merchantActive = m.status === MerchantStatus.ACTIVE
    const isUnavailable  = !branchActive || !merchantActive
    const isOpen = !isUnavailable ? isOpenNow(b.openingHours as any) : false

    const activeVouchers      = m.vouchers
    const voucherCount        = activeVouchers.length
    const savings             = activeVouchers.map(v => Number(v.estimatedSaving)).filter(n => !isNaN(n))
    const maxEstimatedSaving  = savings.length > 0 ? Math.max(...savings) : 0
    // Wave 4 #3 (locked 2026-05-30) — additive `totalEstimatedSaving`
    // matches the Search / BranchTile semantics: "Save £X across N
    // vouchers" (sum of all active voucher estimatedSavings).  Same
    // float-arith-drift guard as `enrichBranchTile` — round to whole
    // pence.  `maxEstimatedSaving` stays unchanged so any other
    // consumer of the favourites payload reads the same value.
    const totalEstimatedSaving = savings.length > 0
      ? Math.round(savings.reduce((a, b) => a + b, 0) * 100) / 100
      : 0

    const rb = ratingByBranch[b.id]
    const avgRating   = rb && rb.count > 0
      ? Math.round(rb.avg * 10) / 10
      : null
    const reviewCount = rb?.count ?? 0

    // Redaction contract — POSTCODE_CENTROID branches drop lat/lng.
    const position = exposeBranchPosition(b)

    return {
      // Branch identity is the primary unit on this surface.
      id:           b.id,
      name:         b.name,
      isMainBranch: b.isMainBranch,
      addressLine1: b.addressLine1,
      addressLine2: b.addressLine2,
      city:         b.city,
      postcode:     b.postcode,
      latitude:           position.latitude,
      longitude:          position.longitude,
      locationConfidence: position.locationConfidence,
      // Parent merchant identity for the card chrome.
      merchant: {
        id:            m.id,
        businessName:  m.businessName,
        tradingName:   m.tradingName,
        logoUrl:       m.logoUrl,
        bannerUrl:     m.bannerUrl,
        status:        m.status,
        primaryCategory: m.primaryCategory,
      },
      // Aggregates.
      voucherCount,
      maxEstimatedSaving,
      totalEstimatedSaving,
      avgRating,
      reviewCount,
      isOpen,
      favouritedAt: r.createdAt,
      isUnavailable,
    }
  })

  // Global sort BEFORE pagination — open first within available,
  // unavailable last.  Within each bucket the underlying SQL preserves
  // favouritedAt desc ordering.
  const sorted = enriched.sort((a, b) => {
    if (a.isUnavailable !== b.isUnavailable) return a.isUnavailable ? 1 : -1
    if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1
    return 0
  })

  const items = sorted.slice(skip, skip + limit)
  return { items, total, page, limit }
}
