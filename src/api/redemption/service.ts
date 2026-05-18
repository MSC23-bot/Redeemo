import { PrismaClient, Prisma, MerchantStatus, VoucherStatus, ApprovalStatus } from '../../../generated/prisma/client'
import type Redis from 'ioredis'
import crypto from 'crypto'
import { AppError } from '../shared/errors'
import { decrypt } from '../shared/encryption'
import { writeAuditLog } from '../shared/audit'
import { RedisKey } from '../shared/redis-keys'
import { getCurrentCycleWindow } from '../subscription/cycle'
import {
  getCurrentWindowOccurrence,
  getNextWindowOccurrence,
  type AvailabilityWindow,
} from '../shared/voucherAvailability'
import { effectiveCooldownSeconds } from './reusable'

// Redemption code alphabet (locked 2026-05-07 from device QA).
//
// Uppercase A-Z + digits 0-9, with `O` and `I` excluded to avoid the
// common `O` vs `0` and `I` vs `1` confusion when staff manually
// transcribe a code onto a bill or read it aloud over the counter.
//
// Alphabet length: 26 - 2 + 10 = 34 characters.
// Code length: 8 characters → 34^8 ≈ 1.79 × 10^12 combinations.
// `redemptionCode` is `@unique` in the schema — a collision retries
// the generation in the backend caller; with this many combinations
// real-world collisions are functionally non-existent.
const ALPHANUMERIC = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'

function generateRedemptionCode(length = 8): string {
  const bytes = crypto.randomBytes(length)
  let code = ''
  for (let i = 0; i < length; i++) {
    code += ALPHANUMERIC[bytes[i] % ALPHANUMERIC.length]
  }
  return code
}

const PIN_FAIL_LIMIT = 5
const PIN_FAIL_WINDOW = 15 * 60 // 15 minutes in seconds

interface RequestCtx { ipAddress: string; userAgent: string }

export interface VerifyActor {
  role: 'branch' | 'merchant'
  branchId: string | null
  merchantId: string
  actorId: string
}

export async function createRedemption(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
  data: { voucherId: string; branchId: string; pin: string },
  ctx: RequestCtx
) {
  // PIN-oracle defense: every eligibility gate runs BEFORE PIN comparison.
  // An attacker probing PINs against an ineligible voucher/branch must NOT
  // be able to distinguish "wrong PIN" (INVALID_PIN) from "right PIN, but
  // ineligible" (eligibility error). All eligibility checks below precede
  // the PIN-compare step at line ~120.
  //
  // See docs/superpowers/plans/2026-05-06-voucher-detail-m2.md §Threat model.
  const now = new Date()

  // 1. Voucher must exist + ACTIVE + APPROVED + merchant ACTIVE
  const voucher = await prisma.voucher.findUnique({
    where: { id: data.voucherId },
    include: {
      merchant: { select: { id: true, status: true } },
      // M4a-6: load availability windows for TIME_LIMITED guard branches
      // (Guard 3 + Guard 7 split). Empty for non-TIME_LIMITED vouchers.
      availabilityWindows: {
        select: { dayOfWeek: true, openTime: true, closeTime: true },
      },
    },
  })
  if (
    !voucher ||
    voucher.status !== VoucherStatus.ACTIVE ||
    voucher.approvalStatus !== ApprovalStatus.APPROVED ||
    voucher.merchant.status !== MerchantStatus.ACTIVE
  ) {
    throw new AppError('VOUCHER_NOT_FOUND')
  }

  // 2. Voucher not expired — server-side eligibility, not a UI concern.
  //    Collapse expired into VOUCHER_NOT_FOUND so an attacker cannot
  //    distinguish "voucher does not exist" vs "voucher expired" via the
  //    error response. A leaked PIN must not be redeemable against an
  //    expired voucher even if the customer-app UI is bypassed.
  if (voucher.expiryDate && voucher.expiryDate.getTime() <= now.getTime()) {
    throw new AppError('VOUCHER_NOT_FOUND')
  }

  // M4a-6 Guard 3 (NEW): TIME_LIMITED availability-window check.
  //
  // Fires AFTER expiry collapse (a dead voucher is dead regardless of
  // window state) and BEFORE branch / subscription / cycle / PIN
  // (those are per-user; window is per-voucher). Skipped entirely for
  // non-TIME_LIMITED vouchers (availabilityWindows is empty).
  //
  // PIN-oracle defense extends here: an attacker probing PINs against
  // a TIME_LIMITED voucher outside its window must not be able to
  // distinguish "wrong PIN" from "right PIN, but window closed".
  if (voucher.type === 'TIME_LIMITED') {
    const windows: AvailabilityWindow[] = voucher.availabilityWindows.map((w) => ({
      dayOfWeek: w.dayOfWeek, openTime: w.openTime, closeTime: w.closeTime,
    }))
    const currentWindowOcc = getCurrentWindowOccurrence(windows, now)
    if (!currentWindowOcc) {
      const nextWindowOcc = getNextWindowOccurrence(windows, now)
      throw new AppError('VOUCHER_OUTSIDE_AVAILABILITY_WINDOW', {
        nextWindowAt: nextWindowOcc?.startsAt.toISOString() ?? null,
      })
    }
  }

  // 3. Branch exists + isActive — server-side eligibility. A branch the
  //    merchant has deactivated must not accept redemptions even if the
  //    branch PIN is known. Wraps both "no such branch" and "branch
  //    deactivated" under BRANCH_UNAVAILABLE so neither state is
  //    distinguishable from the other.
  const branch = await prisma.branch.findUnique({ where: { id: data.branchId } })
  if (!branch || !branch.isActive) {
    throw new AppError('BRANCH_UNAVAILABLE')
  }

  // 4. Branch belongs to voucher's merchant
  if (branch.merchantId !== voucher.merchantId) {
    throw new AppError('BRANCH_MERCHANT_MISMATCH')
  }

  // 5. Subscription guard
  const sub = await prisma.subscription.findUnique({ where: { userId } })
  if (!sub || !['ACTIVE', 'TRIALLING'].includes(sub.status)) {
    throw new AppError('SUBSCRIPTION_REQUIRED')
  }

  // 6. Phone-verified guard — required since phone verification is part of
  //    app onboarding (website users may still have unverified phones, but
  //    they cannot redeem because redemption is mobile-only anyway).
  const userRow = await prisma.user.findUnique({
    where: { id: userId },
    select: { phoneVerified: true },
  })
  if (!userRow || !userRow.phoneVerified) {
    throw new AppError('PHONE_NOT_VERIFIED')
  }

  // 7. Subscription-anchored cycle guard (fast-fail eligibility — closes
  //    PIN oracle by rejecting already-redeemed users BEFORE PIN compare).
  //    Defense in depth: Task A5's transactional claim re-checks under
  //    isolation to defend against the post-PIN race.
  //    Uses cycleAnchorDate as the single source of truth for monthly
  //    cycle windows. Independent of billing interval (monthly/annual)
  //    and payment source (Stripe, Apple IAP, Google Play, admin-grant).
  // **`cycleStart` MUST stay declared at function-body scope** (see
  // M4a-6 §AC lock). Both the non-TIME_LIMITED guard branch below
  // AND the non-TIME_LIMITED upsert in the atomic-claim transaction
  // (further down) read it from this scope. Moving it inside the
  // `else` branch would scope it out of the transaction and break
  // the upsert.
  const { cycleStart } = getCurrentCycleWindow(sub.cycleAnchorDate, now)

  // M4a-6.1: window-occurrence claim for TIME_LIMITED race protection.
  // Hoisted to function scope so the atomic-claim block (further down)
  // can persist it onto VoucherRedemption.windowStartsAt. Stays null for
  // non-TIME_LIMITED vouchers — see schema comment on
  // VoucherRedemption.windowStartsAt for why nulls are safe under the
  // @@unique([userId, voucherId, windowStartsAt]) constraint.
  let timeLimitedWindowStartsAt: Date | null = null

  // M5 v1 (REUSABLE): effective cooldown hoisted to function scope (D12).
  // Computed once for REUSABLE vouchers; consumed by Guard 8a below AND
  // by the atomic-claim transaction's advisory-lock re-check (Task 4).
  // Left `undefined` for non-REUSABLE vouchers — its presence is a
  // type-branch invariant, not a free-form flag.
  let effectiveCooldownMs: number | undefined = undefined
  if (voucher.type === 'REUSABLE') {
    effectiveCooldownMs = effectiveCooldownSeconds(voucher) * 1000
  }

  // M4a-6 Guard 7 (modified): voucher-type-aware redemption check.
  //
  // TIME_LIMITED bypasses UserVoucherCycleState entirely — the
  // VoucherRedemption.redeemedAt timestamp inside the current window-
  // occurrence is the source of truth. REUSABLE also bypasses
  // UserVoucherCycleState — its truth is `lastRedeemedAt +
  // effectiveCooldownMs`. Cycle vouchers (default branch) use the
  // existing per-cycle UserVoucherCycleState lock (unchanged).
  if (voucher.type === 'TIME_LIMITED') {
    const windows: AvailabilityWindow[] = voucher.availabilityWindows.map((w) => ({
      dayOfWeek: w.dayOfWeek, openTime: w.openTime, closeTime: w.closeTime,
    }))
    // Non-null per Guard 3 above — if we got here, the current
    // window-occurrence exists.
    const currentWindowOcc = getCurrentWindowOccurrence(windows, now)!
    timeLimitedWindowStartsAt = currentWindowOcc.startsAt   // M4a-6.1

    const existing = await prisma.voucherRedemption.findFirst({
      where: {
        userId,
        voucherId: data.voucherId,
        redeemedAt: { gte: currentWindowOcc.startsAt, lt: currentWindowOcc.endsAt },
      },
      select: { id: true },
    })
    if (existing) {
      const nextWindowOcc = getNextWindowOccurrence(windows, now)
      throw new AppError('ALREADY_REDEEMED_THIS_WINDOW', {
        nextWindowAt: nextWindowOcc?.startsAt.toISOString() ?? null,
      })
    }
  } else if (voucher.type === 'REUSABLE') {
    // M5 v1 Guard 8a — pre-PIN fast-fail cooldown check.
    //
    // Reads the user's most-recent redemption for this voucher. If that
    // redemption sits inside the effective cooldown window (`lastRedeemedAt
    // + effectiveCooldownMs > now`), fast-fail with REUSABLE_COOLDOWN_ACTIVE
    // and surface `availableAgainAt` for the customer-app's inline copy.
    //
    // This is a UX optimisation — the authoritative re-check happens under
    // the advisory lock inside the atomic-claim transaction (Task 4 / spec
    // §5.2). The pre-PIN fast-fail also closes a (minor) PIN-probing oracle
    // by rejecting in-cooldown users without exposing PIN-compare timing.
    //
    // REUSABLE explicitly bypasses UserVoucherCycleState — its truth is the
    // VoucherRedemption.redeemedAt timestamp + effectiveCooldownMs. No
    // cycle-state read; no cycle-state write later either (see spec §5.2).
    const latest = await prisma.voucherRedemption.findFirst({
      where:   { userId, voucherId: data.voucherId },
      orderBy: { redeemedAt: 'desc' },
      select:  { redeemedAt: true },
    })
    if (latest && now.getTime() < latest.redeemedAt.getTime() + effectiveCooldownMs!) {
      throw new AppError('REUSABLE_COOLDOWN_ACTIVE', {
        availableAgainAt: new Date(
          latest.redeemedAt.getTime() + effectiveCooldownMs!,
        ).toISOString(),
      })
    }
  } else {
    const cycleState = await prisma.userVoucherCycleState.findUnique({
      where: { userId_voucherId: { userId, voucherId: data.voucherId } },
    })

    // If stored cycleStartDate is from a previous cycle, this is a fresh cycle — allow.
    // If stored cycleStartDate matches the current cycle and already redeemed — block.
    const isCurrentCycle = cycleState != null && cycleState.cycleStartDate >= cycleStart
    if (isCurrentCycle && cycleState.isRedeemedInCurrentCycle) {
      throw new AppError('ALREADY_REDEEMED')
    }
  }

  // 8. Branch PIN configured (no leak — eligibility already passed)
  if (!branch.redemptionPin) {
    throw new AppError('PIN_NOT_CONFIGURED')
  }

  // 9. Rate limit — protects ONLY the PIN compare step below
  const failKey = RedisKey.pinFailCount(userId, data.branchId)
  const failCount = await redis.get(failKey)
  if (failCount !== null && parseInt(failCount, 10) >= PIN_FAIL_LIMIT) {
    // Surface the precise lockout window remaining to the customer-app so
    // PinEntrySheet can render an authoritative mm:ss countdown. Redis
    // returns -1 (key has no TTL) or -2 (key missing) on edge cases —
    // fall back to the full PIN_FAIL_WINDOW so the UI never displays a
    // negative or stuck timer.
    const ttl = await redis.ttl(failKey)
    const retryAfter = ttl > 0 ? ttl : PIN_FAIL_WINDOW
    throw new AppError('PIN_RATE_LIMIT_EXCEEDED', { retryAfter })
  }

  // 10. Timing-safe PIN comparison
  let pinMatches = false
  try {
    const decrypted = decrypt(branch.redemptionPin)
    if (decrypted.length !== data.pin.length) {
      pinMatches = false
    } else {
      const pinBuffer = Buffer.from(data.pin, 'utf8')
      const decBuffer = Buffer.from(decrypted, 'utf8')
      pinMatches = crypto.timingSafeEqual(pinBuffer, decBuffer)
    }
  } catch {
    pinMatches = false
  }

  if (!pinMatches) {
    const newCount = await redis.incr(failKey)
    await redis.expire(failKey, PIN_FAIL_WINDOW)
    // Surface remainingAttempts to the customer-app so the lockout-counter
    // UI can show authoritative "X attempts remaining" copy. Clamped at 0
    // — a counter overshoot (from a race or a stale Redis state) never
    // produces a negative number.
    const remainingAttempts = Math.max(0, PIN_FAIL_LIMIT - newCount)
    throw new AppError('INVALID_PIN', { remainingAttempts })
  }

  // 11. Atomic write — race-safe conditional claim with CROSS-TRANSACTION
  // retry.
  //
  // Two concurrent createRedemption calls for the same (userId, voucherId)
  // can both pass the pre-PIN cycle check at step 7 (which reads cycle
  // state without a row lock). Without the conditional claim below, both
  // would write VoucherRedemption rows — duplicate redemption rows,
  // double branch attribution, inflated merchant analytics.
  //
  // Defense uses the existing @@unique([userId, voucherId]) on
  // UserVoucherCycleState as a single-row claim point. Two transactions
  // max:
  //
  //   First transaction:
  //     a. Conditional updateMany — succeeds (count=1) if the row is from
  //        an older cycle (stale, reclaimable) or current cycle but not
  //        yet redeemed. If so, write VoucherRedemption and commit.
  //     b. If count=0, no row exists yet — try create. If create succeeds,
  //        write VoucherRedemption and commit. If create throws P2002 (a
  //        concurrent winner created the row between our updateMany and
  //        our create), Postgres marks the transaction as
  //        25P02 in_failed_sql_transaction. We MUST NOT continue querying
  //        inside this transaction. Prisma rolls it back automatically;
  //        the P2002 propagates up to our outer catch.
  //
  //   Second transaction (only on P2002 from first):
  //     Retry the conditional updateMany ONLY (no create). If count=1,
  //     the concurrent winner's row was reclaimable on retry — proceed
  //     to write VoucherRedemption. If count=0, race lost — throw
  //     ALREADY_REDEEMED.
  //
  // This avoids the pitfall of catching P2002 inside the failed
  // transaction and retrying — that would always fail in production with
  // "current transaction is aborted, commands ignored until end of
  // transaction block" even though a mocked-Prisma test would pass.
  const redemptionCode = generateRedemptionCode()

  const claimWhere = {
    userId,
    voucherId: data.voucherId,
    OR: [
      { cycleStartDate: { lt: cycleStart } },           // stale, can be reclaimed
      { isRedeemedInCurrentCycle: false },               // current cycle, not yet claimed
    ],
  }
  const claimData = {
    cycleStartDate:           cycleStart,
    isRedeemedInCurrentCycle: true,
    lastRedeemedAt:           now,
  }
  const redemptionData = {
    userId,
    voucherId:       data.voucherId,
    branchId:        data.branchId,
    redemptionCode,
    estimatedSaving: voucher.estimatedSaving,
    isValidated:     false,
    redeemedAt:      now,
    windowStartsAt:  timeLimitedWindowStartsAt,   // M4a-6.1: null for non-TL, set for TL
  }

  let redemption
  if (voucher.type === 'REUSABLE') {
    // M5 v1 (REUSABLE) — atomic claim with Postgres advisory lock.
    //
    // Spec §5.2 + §5.5 amendment 2026-05-12: lock per (userId, voucherId)
    // is the design contract; the exact SQL signature is implementation-
    // flexible. The real-DB integration test in
    // `tests/api/redemption/advisory-lock-race.integration.test.ts` is
    // the canonical proof point.
    //
    // Why the lock: Guard 8a (pre-PIN, spec §5.1) is a non-authoritative
    // UX optimisation — a concurrent transaction can insert a winner
    // between Guard 8a passing and our transaction starting. The lock
    // serialises concurrent claims for the same (userId, voucherId)
    // pair and the re-read under the lock is the authoritative gate.
    //
    // Two-int form `pg_advisory_xact_lock(int, int)` keeps unrelated
    // (userId, voucherId) pairs parallel (different hash keyspace) so
    // the lock does not contend across users or unrelated vouchers.
    // `hashtext(text)` returns int4 — the signature resolves cleanly.
    // The lock is transaction-scoped: Postgres auto-releases it on
    // COMMIT or ROLLBACK; no manual unlock needed (and a manual unlock
    // call would be either a no-op or a bug — see the mocked test pin).
    //
    // REUSABLE explicitly bypasses UserVoucherCycleState (D11) — its
    // truth is `lastRedeemedAt + effectiveCooldownMs`. Insert only the
    // VoucherRedemption row with windowStartsAt=null (Postgres distinct-
    // NULL semantics keep @@unique([userId, voucherId, windowStartsAt])
    // non-conflicting across REUSABLE redemptions for the same user +
    // voucher).
    redemption = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${data.voucherId}))
      `

      // Authoritative cooldown re-check UNDER the lock.
      const latest = await tx.voucherRedemption.findFirst({
        where:   { userId, voucherId: data.voucherId },
        orderBy: { redeemedAt: 'desc' },
        select:  { redeemedAt: true },
      })
      if (latest && now.getTime() < latest.redeemedAt.getTime() + effectiveCooldownMs!) {
        throw new AppError('REUSABLE_COOLDOWN_ACTIVE', {
          availableAgainAt: new Date(
            latest.redeemedAt.getTime() + effectiveCooldownMs!,
          ).toISOString(),
        })
      }

      // Insert. windowStartsAt stays null — REUSABLE has no window concept,
      // and Postgres distinct-NULL keeps the existing TL-protecting unique
      // constraint non-conflicting.
      return tx.voucherRedemption.create({ data: {
        ...redemptionData,
        windowStartsAt: null,
      }})
      // No UserVoucherCycleState write — REUSABLE bypasses it (D11).
    })
  } else if (voucher.type === 'TIME_LIMITED') {
    // M4a-6: TIME_LIMITED redemptions are NOT cycle-anchored — the
    // VoucherRedemption.redeemedAt timestamp + window-occurrence is
    // the source of truth (Guard 7 branch above). Insert ONLY the
    // VoucherRedemption row; never touch UserVoucherCycleState.
    //
    // M4a-6.1: race protection via @@unique([userId, voucherId, windowStartsAt]).
    // Two concurrent TIME_LIMITED redemptions for the same (user, voucher,
    // window-occurrence) cannot both succeed at the DB layer — P2002 fires
    // on the second insert. Translate to ALREADY_REDEEMED_THIS_WINDOW so
    // the customer-app surfaces graceful "you already used this offer for
    // this window" copy — same shape as the regular Guard 7 rejection.
    // Symmetric with the existing non-TIME_LIMITED P2002 cross-transaction
    // retry pattern (PR #43), so the test/debug mental model is uniform.
    try {
      redemption = await prisma.$transaction(async (tx) => {
        return tx.voucherRedemption.create({ data: redemptionData })
      })
    } catch (err: any) {
      if (
        err?.code === 'P2002' &&
        Array.isArray(err.meta?.target) &&
        (err.meta.target as string[]).includes('windowStartsAt')
      ) {
        // Concurrent winner inserted first. Compute nextWindowAt for the
        // graceful copy.
        const windows: AvailabilityWindow[] = voucher.availabilityWindows.map((w) => ({
          dayOfWeek: w.dayOfWeek, openTime: w.openTime, closeTime: w.closeTime,
        }))
        const nextWindowOcc = getNextWindowOccurrence(windows, now)
        throw new AppError('ALREADY_REDEEMED_THIS_WINDOW', {
          nextWindowAt: nextWindowOcc?.startsAt.toISOString() ?? null,
        })
      }
      throw err
    }
  } else {
    try {
      // First transaction: try claim via updateMany; if no row, try create.
      // The whole tx (cycle-state claim + redemption write) is one atomic
      // unit. On P2002 the tx rolls back; we catch OUTSIDE.
      redemption = await prisma.$transaction(async (tx) => {
        const updated = await tx.userVoucherCycleState.updateMany({
          where: claimWhere,
          data:  claimData,
        })
        if (updated.count !== 1) {
          // No reclaimable row — try create. P2002 here aborts this tx;
          // do NOT continue querying inside it.
          await tx.userVoucherCycleState.create({
            data: {
              userId,
              voucherId: data.voucherId,
              cycleStartDate:           cycleStart,
              isRedeemedInCurrentCycle: true,
              lastRedeemedAt:           now,
            },
          })
        }
        return tx.voucherRedemption.create({ data: redemptionData })
      })
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err
      // Concurrent winner created the cycle-state row between our updateMany
      // and our create. First transaction has rolled back — its writes are
      // gone. Retry in a FRESH transaction with conditional updateMany only
      // (no create — the row exists now).
      redemption = await prisma.$transaction(async (tx) => {
        const retried = await tx.userVoucherCycleState.updateMany({
          where: claimWhere,
          data:  claimData,
        })
        if (retried.count !== 1) {
          // Concurrent winner's row is NOT reclaimable (current cycle,
          // already redeemed). Race lost.
          throw new AppError('ALREADY_REDEEMED')
        }
        return tx.voucherRedemption.create({ data: redemptionData })
      })
    }
  }

  // 9. Reset fail counter on success
  await redis.del(failKey)

  writeAuditLog(prisma, {
    entityId: userId, entityType: 'customer',
    event: 'VOUCHER_REDEEMED',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { voucherId: data.voucherId, branchId: data.branchId, redemptionCode },
  })

  return { ...redemption, estimatedSaving: Number(redemption.estimatedSaving) }
}

export async function verifyRedemption(
  prisma: PrismaClient,
  code: string,
  method: 'QR_SCAN' | 'MANUAL',
  actor: VerifyActor,
  ctx: RequestCtx
) {
  const redemption = await prisma.voucherRedemption.findUnique({
    where: { redemptionCode: code },
    include: {
      voucher: { select: { merchantId: true } },
      user:    { select: { firstName: true, lastName: true } },
    },
  })

  if (!redemption) throw new AppError('REDEMPTION_NOT_FOUND')
  if (redemption.isValidated) throw new AppError('ALREADY_VALIDATED')

  if (actor.role === 'branch') {
    if (redemption.branchId !== actor.branchId) throw new AppError('BRANCH_ACCESS_DENIED')
  } else {
    if (redemption.voucher.merchantId !== actor.merchantId) throw new AppError('MERCHANT_MISMATCH')
  }

  const updated = await prisma.voucherRedemption.update({
    where: { id: redemption.id },
    data: {
      isValidated:      true,
      validatedAt:      new Date(),
      validationMethod: method,
      validatedById:    actor.actorId,
    },
  })

  writeAuditLog(prisma, {
    entityId: redemption.userId, entityType: 'customer',
    event: 'VOUCHER_VERIFIED',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { redemptionCode: code, method, actorId: actor.actorId },
  })

  return {
    id:               updated.id,
    isValidated:      updated.isValidated,
    validatedAt:      updated.validatedAt,
    validationMethod: updated.validationMethod,
    customer: {
      name: [redemption.user.firstName, redemption.user.lastName].filter(Boolean).join(' '),
    },
  }
}

export async function listMyRedemptions(
  prisma: PrismaClient,
  userId: string,
  pagination: { limit: number; offset: number }
) {
  const rows = await prisma.voucherRedemption.findMany({
    where:   { userId },
    orderBy: { redeemedAt: 'desc' },
    take:    pagination.limit,
    skip:    pagination.offset,
    include: {
      voucher: { select: { id: true, title: true, merchant: { select: { businessName: true, logoUrl: true } } } },
      branch:  { select: { id: true, name: true } },
    },
  })
  return rows.map((r) => ({ ...r, estimatedSaving: Number(r.estimatedSaving) }))
}

export async function getMyRedemption(
  prisma: PrismaClient,
  userId: string,
  redemptionId: string
) {
  const redemption = await prisma.voucherRedemption.findUnique({
    where:   { id: redemptionId },
    include: {
      // §Savings Redemption Detail screen (PR #105 device-QA round-3,
      // 2026-05-18) — added `type` (for the voucher-type label) and
      // `merchant.id` (for the "See merchant" route) to the select.
      // Both additive — no existing callers regress because Zod
      // schemas in the customer-app ignore unknown fields by default.
      //
      // §Savings device-QA round-4 fixup 2026-05-18 — Prisma field is
      // `type`, not `voucherType`.  The previous select shipped
      // `voucherType: true` which Prisma rejected at runtime with
      // PrismaClientValidationError → 500 on every request to
      // GET /api/v1/redemption/my/:id.  See the savings service
      // (src/api/customer/savings/service.ts:161) for the canonical
      // pattern: select `type`, remap to `voucherType` in the
      // response so the customer-app's `voucherType`-keyed schemas
      // stay consistent across endpoints.
      // §Savings device-QA round-8 fixup 2026-05-18 — merchant.logoUrl
      // added to the receipt payload so the Redemption Receipt screen
      // can render the merchant identity visually (matches the
      // savings-history row + savings TopPlaces row treatment).
      // Additive; existing callers ignore unknown fields.
      voucher: { select: { id: true, title: true, type: true, description: true, terms: true, merchant: { select: { id: true, businessName: true, logoUrl: true } } } },
      branch:  { select: { id: true, name: true, addressLine1: true, city: true, postcode: true } },
    },
  })
  if (!redemption || redemption.userId !== userId) throw new AppError('REDEMPTION_NOT_FOUND')

  // Remap Prisma's `voucher.type` → response `voucher.voucherType`
  // (consistent with the savings + ShowToStaff response shapes that
  // the customer-app's redemption schemas expect).
  const { voucher, ...rest } = redemption
  return {
    ...rest,
    estimatedSaving: Number(redemption.estimatedSaving),
    voucher: {
      id:          voucher.id,
      title:       voucher.title,
      description: voucher.description,
      terms:       voucher.terms,
      voucherType: voucher.type,
      merchant:    voucher.merchant,
    },
  }
}

// ─── Show-to-Staff polling + anti-fraud telemetry ─────────────────────────────

const SCREENSHOT_DEDUP_TTL_SECONDS = 5

/**
 * Normalise a user-supplied redemption code to its canonical form.
 * Strips whitespace + hyphens (so the user-friendly "A7K2 P9X4"
 * displayed in the UI matches the canonical "A7K2P9X4" stored in
 * the DB) and uppercases (the alphabet is already uppercase, this
 * is defensive against hand-entered lowercase from a future manual
 * entry surface).
 *
 * Shared between `flagRedemptionScreenshot` and
 * `getMyRedemptionByCode` so dedup keys and DB lookups always agree
 * on the canonical shape.
 */
function normaliseCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase()
}

/**
 * Customer self-lookup by redemption code. Drives the Show-to-Staff
 * polling hook (5s cadence, 15-min budget) — flips the screen from
 * polling → validated when the backend marks `isValidated: true`.
 *
 * Slim payload by design: no userId, no validatedById, no
 * estimatedSaving, no redeemedAt. Only the fields the polling hook
 * + ShowToStaff component need. This endpoint is hit ~180 times
 * per session; keep the wire small.
 *
 * Auth shape mirrors `getMyRedemption` and `flagRedemptionScreenshot`:
 * rejects with `REDEMPTION_NOT_FOUND` when the code does not exist
 * OR the redemption belongs to a different user. A leaked code
 * from another customer MUST NOT surface their redemption status
 * to a different user's session.
 */
export async function getMyRedemptionByCode(
  prisma: PrismaClient,
  userId: string,
  code:   string,
) {
  const normalised = normaliseCode(code)

  const redemption = await prisma.voucherRedemption.findUnique({
    where: { redemptionCode: normalised },
    include: {
      voucher: { select: { id: true, merchant: { select: { businessName: true } } } },
      branch:  { select: { name: true } },
    },
  })
  if (!redemption || redemption.userId !== userId) {
    throw new AppError('REDEMPTION_NOT_FOUND')
  }

  return {
    code:             redemption.redemptionCode,
    isValidated:      redemption.isValidated,
    validatedAt:      redemption.validatedAt,
    validationMethod: redemption.validationMethod,
    voucherId:        redemption.voucher.id,
    merchantName:     redemption.voucher.merchant.businessName,
    branchName:       redemption.branch.name,
  }
}

/**
 * Best-effort anti-fraud telemetry for the Show-to-Staff full-screen
 * surface. iOS detects screenshot events after the fact via
 * `expo-screen-capture.addScreenshotListener`; the customer-app calls
 * this endpoint on every fire to record an audit trail.
 *
 * Dedup is enforced via Redis `SET NX EX 5` so a rapid burst of events
 * for the same `(userId, code)` writes exactly one row instead of N.
 * On dedup hit the function returns `{ accepted: false }` without
 * touching Postgres.
 *
 * Auth shape mirrors `getMyRedemption`: rejects with `REDEMPTION_NOT_FOUND`
 * when the code does not exist OR the redemption belongs to a different
 * user. The customer-app must never block the visible Show-to-Staff
 * surface on this call rejecting — failures are silent on the client.
 */
export async function flagRedemptionScreenshot(
  prisma: PrismaClient,
  redis:  Redis,
  userId: string,
  code:   string,
  platform: 'ios' | 'android',
): Promise<{ accepted: boolean }> {
  const normalised = normaliseCode(code)

  const redemption = await prisma.voucherRedemption.findUnique({
    where: { redemptionCode: normalised },
  })
  if (!redemption || redemption.userId !== userId) {
    throw new AppError('REDEMPTION_NOT_FOUND')
  }

  // SET NX EX dedup. ioredis returns 'OK' on first write within the
  // window, null on subsequent writes inside the TTL. We do NOT race
  // the telemetry write — the dedup happens before the DB hit, so a
  // burst of screenshot events at most generates one row per
  // (userId, code) per 5 seconds.
  //
  // **Graceful degradation if Redis fails** (locked 2026-05-09 from
  // deferred-followups §AG4 — post-PR-#49 cleanup). Redis being down
  // or misbehaving must NOT surface a 500 to the customer-app — the
  // client (`useScreenshotGuard`) already swallows telemetry failures
  // via `.catch(() => {})`, but a 500 here generates noisy server-
  // side error logs that mask genuine bugs. We treat any Redis
  // exception as a "dedup unavailable" condition and skip the DB
  // write entirely (per owner direction: "do not write a DB row if
  // dedup cannot be performed safely"). The route returns 200 with
  // `{ accepted: false }` and the customer's visible state is
  // unaffected (the screenshot banner already fired client-side).
  const dedupKey = RedisKey.redemptionScreenshotDedup(userId, normalised)
  let setResult: string | null
  try {
    setResult = await redis.set(
      dedupKey,
      '1',
      'EX',
      SCREENSHOT_DEDUP_TTL_SECONDS,
      'NX',
    )
  } catch {
    // Redis failure — degrade to "accepted: false" without writing.
    // Skipping the DB write avoids generating duplicates if Redis
    // recovers later, AND avoids storming the audit table during a
    // Redis outage.
    return { accepted: false }
  }
  if (setResult !== 'OK') return { accepted: false }

  await prisma.redemptionScreenshotEvent.create({
    data: { userId, redemptionId: redemption.id, platform },
  })
  return { accepted: true }
}

export async function listBranchRedemptions(
  prisma: PrismaClient,
  branchId: string,
  pagination: { limit: number; offset: number; from?: Date; to?: Date }
) {
  const where: Prisma.VoucherRedemptionWhereInput = { branchId }
  if (pagination.from || pagination.to) {
    where.redeemedAt = {
      ...(pagination.from ? { gte: pagination.from } : {}),
      ...(pagination.to   ? { lte: pagination.to   } : {}),
    }
  }

  const [total, items] = await Promise.all([
    prisma.voucherRedemption.count({ where }),
    prisma.voucherRedemption.findMany({
      where,
      orderBy: { redeemedAt: 'desc' },
      take:    pagination.limit,
      skip:    pagination.offset,
      include: {
        voucher: { select: { id: true, title: true } },
        user:    { select: { firstName: true, lastName: true } },
      },
    }),
  ])

  return {
    total,
    items: items.map((r) => ({
      ...r,
      customer: { name: [r.user.firstName, r.user.lastName].filter(Boolean).join(' ') },
      user: undefined,
    })),
  }
}
