// Insights PR-A Task A10: the isolated demo fixture (spec 17, plan 2.6).
//
// PURPOSE
// -------
// The Insights UI (PR-B) needs a realistic "established" dataset to demo:
// validated + awaiting redemptions across branches, voucher types, dates, and
// the six London dayparts. We MUST NOT seed that as real activity: an
// isTestData=false fake redemption would pollute customer discovery
// (Popular/Trending) AND production Insights analytics. So every row this
// fixture writes is isTestData=true, on a single DEDICATED, allowlisted demo
// merchant, and the include-path is a server-owned function that refuses to run
// in production.
//
// LOCKED ISOLATION INVARIANTS (spec 17, plan 2.6, Task A10):
//   1. SERVER-OWNED INCLUDE-PATH. The only way to seed is to call
//      seedInsightsDemoFixture(prisma) from server-side code (a dev/staging
//      script). It takes ONLY a PrismaClient - there is NO opener argument, so
//      nothing in a request header / body / query / cookie can enable it. A
//      caller-shaped object (e.g. a Fastify request) is not a PrismaClient and
//      will not satisfy the guard either, but the guard does not even read a
//      caller-supplied flag: it reads ONLY server-owned process config.
//   2. THROWS AT CALL TIME unless BOTH hold:
//        - process.env.NODE_ENV !== 'production'  (never in production), AND
//        - process.env.INSIGHTS_DEMO_FIXTURE === '1'  (explicit staging flag).
//      In production the function throws even when the flag is set. With the
//      flag unset it throws everywhere. Default = off (fail-closed).
//   3. EVERY ROW is isTestData=true and lives on the dedicated demo merchant
//      (allowlisted by a fixed businessName sentinel). The merchant, its
//      branches, its vouchers, and every redemption all carry isTestData=true.
//   4. PRODUCTION CLEANLINESS HOLDS EVEN IF EVERY DEMO GUARD IS MISCONFIGURED.
//      Because the rows are isTestData=true and the canonical eligible rule
//      (src/api/merchant/insights/eligibility.ts -> buildEligibilityWhereSql)
//      AND-joins `redemption.isTestData = false AND branch.isTestData = false
//      AND merchant.isTestData = false`, the demo rows can never appear in
//      production Insights analytics - the gate is the data, not the guard.
//
// This file is intentionally NOT under src/ (it is dev/staging tooling, not an
// API surface). It is never imported by the running API.

import type { PrismaClient, VoucherType, ValidationMethod } from '../generated/prisma/client'
import { DAYPARTS } from '../src/api/merchant/insights/london'

// --- The dedicated demo-merchant allowlist key ------------------------------
//
// A fixed sentinel businessName uniquely identifies THE demo merchant. The
// fixture upserts against it (find-by-name, create-if-missing) so re-running is
// idempotent and never spawns a second demo merchant. Production never creates a
// merchant with this name; even if it did, isTestData=true would exclude it.
export const INSIGHTS_DEMO_MERCHANT_NAME = 'INSIGHTS DEMO (test-data only)'

// The env flag that, together with a non-production NODE_ENV, opens the
// include-path. Server-owned only (a process env var; never request-derived).
const DEMO_FLAG_ENV_VAR = 'INSIGHTS_DEMO_FIXTURE'
const DEMO_FLAG_AFFIRMATIVE = '1'

/**
 * The hard, call-time guard. Throws unless NODE_ENV is non-production AND the
 * explicit staging flag is set. Exported so the safety tests can assert the
 * throw paths directly without seeding. Reads ONLY server-owned process config -
 * it accepts no argument, so no caller (request/header/body/query/cookie) can
 * influence it.
 */
export function assertInsightsDemoFixtureAllowed(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'seedInsightsDemoFixture refused: NODE_ENV is "production". The Insights ' +
        'demo fixture is dev/staging-only and must never run in production, even ' +
        `with ${DEMO_FLAG_ENV_VAR} set.`,
    )
  }
  if (process.env[DEMO_FLAG_ENV_VAR] !== DEMO_FLAG_AFFIRMATIVE) {
    throw new Error(
      `seedInsightsDemoFixture refused: the staging demo flag ${DEMO_FLAG_ENV_VAR}=` +
        `${DEMO_FLAG_AFFIRMATIVE} is not set. The demo fixture is default-off and ` +
        'fail-closed; set the server-owned flag explicitly to enable it.',
    )
  }
}

/** A demo branch the fixture seeds (all isTestData=true). */
type DemoBranch = { name: string; city: string; postcode: string; isMainBranch: boolean }

const DEMO_BRANCHES: readonly DemoBranch[] = [
  { name: 'INSIGHTS DEMO - Central', city: 'London', postcode: 'EC1A 1AA', isMainBranch: true },
  { name: 'INSIGHTS DEMO - Riverside', city: 'London', postcode: 'SE1 9AA', isMainBranch: false },
  { name: 'INSIGHTS DEMO - Northgate', city: 'Manchester', postcode: 'M1 1AA', isMainBranch: false },
]

/** A demo voucher (all isTestData=true). `type` is a DB VoucherType value. */
type DemoVoucher = { code: string; type: VoucherType; title: string; estimatedSaving: number }

// Cover the merchant-facing type spread: BOGO, SPEND_AND_SAVE, both DISCOUNT
// variants (collapse to DISCOUNT in analytics), FREEBIE, PACKAGE_DEAL,
// TIME_LIMITED, REUSABLE.
const DEMO_VOUCHERS: readonly DemoVoucher[] = [
  { code: 'INSIGHTS-DEMO-BOGO', type: 'BOGO', title: 'Buy one main, get one free', estimatedSaving: 12.5 },
  { code: 'INSIGHTS-DEMO-SAS', type: 'SPEND_AND_SAVE', title: 'Spend GBP 30, save GBP 5', estimatedSaving: 5 },
  { code: 'INSIGHTS-DEMO-DISCF', type: 'DISCOUNT_FIXED', title: 'GBP 4 off any bill', estimatedSaving: 4 },
  { code: 'INSIGHTS-DEMO-DISCP', type: 'DISCOUNT_PERCENT', title: '15% off the food bill', estimatedSaving: 7.25 },
  { code: 'INSIGHTS-DEMO-FREE', type: 'FREEBIE', title: 'Free side with any main', estimatedSaving: 3.5 },
  { code: 'INSIGHTS-DEMO-PKG', type: 'PACKAGE_DEAL', title: 'Two courses for GBP 18', estimatedSaving: 9 },
  { code: 'INSIGHTS-DEMO-TL', type: 'TIME_LIMITED', title: 'Happy-hour mocktail deal', estimatedSaving: 6 },
  { code: 'INSIGHTS-DEMO-REUSE', type: 'REUSABLE', title: 'Loyalty coffee top-up', estimatedSaving: 2.5 },
]

const VALIDATION_METHODS: readonly ValidationMethod[] = ['PIN', 'QR_SCAN', 'MANUAL']

/**
 * Build a deterministic UTC instant whose Europe/London wall-clock hour lands in
 * a chosen daypart, on a chosen London calendar date. We seed each redemption at
 * 09:30 UTC + an hour offset so a given index maps into a predictable daypart;
 * exact London bucketing is verified elsewhere - here we only need a realistic
 * spread across the six dayparts. We avoid the DST-transition hour by staying on
 * whole-day boundaries with mid-daypart hours.
 */
function demoRedeemedAt(dayOffset: number, hour: number): Date {
  // A fixed base London date well inside a normal (non-transition) window; we
  // build the UTC instant by treating the London hour as UTC minus 0 (London is
  // GMT in winter). The fixture only needs a realistic daypart/date spread for
  // the demo, not exact-second London precision, so a simple base + offset is
  // sufficient and deterministic.
  const base = Date.UTC(2026, 1, 2, 0, 0, 0) // 2026-02-02 (a Monday) 00:00 UTC, GMT season
  return new Date(base + dayOffset * 24 * 60 * 60 * 1000 + hour * 60 * 60 * 1000)
}

/** A mid-point hour for each of the six dayparts (index-aligned to DAYPARTS). */
const DAYPART_MID_HOURS: readonly number[] = DAYPARTS.map((d) =>
  Math.min(d.endHour - 1, Math.floor((d.startHour + d.endHour) / 2)),
)

/**
 * Seed the isolated Insights demo fixture. Throws at call time unless the
 * server-owned guard allows it (non-production NODE_ENV + the explicit flag).
 *
 * Idempotent: it upserts the dedicated demo merchant by its sentinel name and
 * its branches/vouchers by their fixed names/codes, then seeds a fresh batch of
 * demo redemptions. Re-running adds another redemption batch (acceptable for a
 * demo dataset); the merchant/branches/vouchers are not duplicated.
 *
 * Every row written carries isTestData=true, so the canonical eligible rule
 * excludes them from production analytics regardless of any guard state.
 *
 * @param prisma a PrismaClient (server-owned; the ONLY argument - no opener).
 * @returns a summary of the ids/counts seeded (for the seeding script's log).
 */
export async function seedInsightsDemoFixture(prisma: PrismaClient): Promise<{
  merchantId: string
  branchIds: string[]
  voucherIds: string[]
  redemptionsCreated: number
}> {
  // GUARD FIRST: no DB access happens before this passes.
  assertInsightsDemoFixtureAllowed()

  // 1. The dedicated demo merchant (allowlisted by its sentinel name).
  const existingMerchant = await prisma.merchant.findFirst({
    where: { businessName: INSIGHTS_DEMO_MERCHANT_NAME },
    select: { id: true },
  })
  const merchant =
    existingMerchant ??
    (await prisma.merchant.create({
      data: {
        businessName: INSIGHTS_DEMO_MERCHANT_NAME,
        status: 'ACTIVE',
        isTestData: true,
      },
      select: { id: true },
    }))
  const merchantId = merchant.id

  // 2. Branches (idempotent by name within the demo merchant).
  const branchIds: string[] = []
  for (const b of DEMO_BRANCHES) {
    const existing = await prisma.branch.findFirst({
      where: { merchantId, name: b.name },
      select: { id: true },
    })
    const branch =
      existing ??
      (await prisma.branch.create({
        data: {
          merchantId,
          name: b.name,
          isMainBranch: b.isMainBranch,
          addressLine1: '1 Demo Street',
          city: b.city,
          postcode: b.postcode,
          isActive: true,
          isTestData: true,
        },
        select: { id: true },
      }))
    branchIds.push(branch.id)
  }

  // 3. Vouchers (idempotent by unique code).
  const voucherIds: string[] = []
  for (const v of DEMO_VOUCHERS) {
    const branch = await prisma.voucher.upsert({
      where: { code: v.code },
      update: {}, // never mutate an existing demo voucher's shape
      create: {
        merchantId,
        code: v.code,
        type: v.type,
        title: v.title,
        estimatedSaving: v.estimatedSaving,
        status: 'ACTIVE',
        approvalStatus: 'APPROVED',
        isTestData: true,
      },
      select: { id: true },
    })
    voucherIds.push(branch.id)
  }

  // 4. A pool of demo customers (real Users have no isTestData column; the demo
  //    rows are excluded from production analytics via the redemption/branch/
  //    merchant isTestData=true predicate, NOT via the user). Emails use the
  //    sentinel demo address space so they cannot collide with real users.
  const customerCount = 6
  const userIds: string[] = []
  for (let i = 0; i < customerCount; i++) {
    const email = `insights-demo-customer-${i}@redeemo-insights-demo.invalid`
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, status: 'ACTIVE' },
      select: { id: true },
    })
    userIds.push(user.id)
  }

  // 5. Redemptions: a realistic spread across branches x voucher types x dates x
  //    the six London dayparts, half validated (confirmed) and half awaiting.
  //    Unique redemptionCode per row (sentinel-prefixed). All isTestData=true.
  let redemptionsCreated = 0
  let seq = 0
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    for (let dpIndex = 0; dpIndex < DAYPARTS.length; dpIndex++) {
      // Vary which branch / voucher / customer each cell uses so rankings differ.
      const branchId = branchIds[(dayOffset + dpIndex) % branchIds.length]
      const voucherId = voucherIds[(dayOffset * DAYPARTS.length + dpIndex) % voucherIds.length]
      const userId = userIds[(dayOffset + dpIndex * 2) % userIds.length]
      const voucher = DEMO_VOUCHERS[(dayOffset * DAYPARTS.length + dpIndex) % DEMO_VOUCHERS.length]
      const redeemedAt = demoRedeemedAt(dayOffset, DAYPART_MID_HOURS[dpIndex])

      // Alternate confirmed / awaiting so the dual-layer demo has both.
      const isValidated = seq % 2 === 0
      const validationMethod = isValidated ? VALIDATION_METHODS[seq % VALIDATION_METHODS.length] : null
      const validatedAt = isValidated ? new Date(redeemedAt.getTime() + 5 * 60 * 1000) : null

      // A unique, sentinel-prefixed redemption code (<= 24 chars upper). Include
      // a per-call salt so a re-run never collides on the @unique code.
      const salt = Date.now().toString(36).slice(-4).toUpperCase()
      const redemptionCode = `IDEMO${salt}${seq.toString(36).toUpperCase()}`.slice(0, 24)

      await prisma.voucherRedemption.create({
        data: {
          userId,
          voucherId,
          branchId,
          redemptionCode,
          redeemedAt,
          isValidated,
          validatedAt,
          validationMethod,
          estimatedSaving: voucher.estimatedSaving,
          isTestData: true,
        },
        select: { id: true },
      })
      redemptionsCreated += 1
      seq += 1
    }
  }

  return { merchantId, branchIds, voucherIds, redemptionsCreated }
}
