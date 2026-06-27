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
// LOCKED ISOLATION INVARIANTS (spec 17, plan 2.6, Task A10; findings #8 + #10):
//   1. SERVER-OWNED INCLUDE-PATH. The only way to seed is to call
//      seedInsightsDemoFixture(prisma) from server-side code (a dev/staging
//      script). It takes ONLY a PrismaClient - there is NO opener argument, so
//      nothing in a request header / body / query / cookie can enable it. A
//      caller-shaped object (e.g. a Fastify request) is not a PrismaClient and
//      will not satisfy the guard either, but the guard does not even read a
//      caller-supplied flag: it reads ONLY server-owned process config.
//   2. THROWS AT CALL TIME unless BOTH hold (finding #8 staging-identity update):
//        - process.env.REDEEMO_DEPLOY_ENV === 'staging'  (the app-owned deploy
//          identity, NOT NODE_ENV - Railway staging runs NODE_ENV=production), AND
//        - process.env.INSIGHTS_DEMO_FIXTURE === '1'  (explicit staging flag).
//      On a production deploy (REDEEMO_DEPLOY_ENV='production'), unset, or any
//      non-'staging' value the function throws even when the flag is set. With the
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
//   5. COLLISION FAIL-CLOSED (finding #10). Every find-by-sentinel lookup VERIFIES
//      the matched entity is the EXPECTED test-owned one (merchant.isTestData,
//      branch.isTestData, voucher.isTestData AND on the demo merchant, the
//      MerchantAdmin email === the sentinel). If a real (non-test) entity already
//      owns a sentinel name / code / email, the fixture THROWS - it never mutates
//      or hijacks a real row.
//   6. SCOPED DELETE + ATOMIC RECONCILE (finding #10). The reseed deletes ONLY
//      verified fixture-owned redemptions (branchId IN demo-branch-ids AND
//      isTestData=true), so a stray non-test row under a demo branch is preserved,
//      and the delete + recreate runs inside a single prisma.$transaction so an
//      interruption cannot leave partial data.
//   7. CREDENTIAL FAIL-CLOSED (finding #10). The demo login password is read from
//      the SERVER-OWNED env var INSIGHTS_DEMO_ADMIN_PASSWORD; if unset/empty the
//      fixture THROWS before any DB access. No password literal is committed.
//
// This file is intentionally NOT under src/ (it is dev/staging tooling, not an
// API surface). It is never imported by the running API.

import type { PrismaClient, VoucherType, ValidationMethod } from '../generated/prisma/client'
import { DAYPARTS } from '../src/api/merchant/insights/london'
import { hashPassword } from '../src/api/shared/password'
import { isStagingDeploy } from '../src/api/merchant/insights/demo'

// --- The dedicated demo-merchant allowlist key ------------------------------
//
// A fixed sentinel businessName uniquely identifies THE demo merchant. The
// fixture upserts against it (find-by-name, create-if-missing) so re-running is
// idempotent and never spawns a second demo merchant. Production never creates a
// merchant with this name; even if it did, isTestData=true would exclude it.
export const INSIGHTS_DEMO_MERCHANT_NAME = 'INSIGHTS DEMO (test-data only)'

// --- The demo login (so QA can authenticate via the normal merchant login) ---
//
// The demo dataset is only useful if QA can reach the authz'd Insights routes as
// the demo merchant. The fixture upserts a MerchantAdmin (the person who logs in)
// + an OWNER MerchantMembership (allBranches=true) for the dedicated demo
// merchant, so the FULL resolveMerchantContext / lifecycle / role / scope chain
// applies unchanged. The email lives in a clearly-demo .invalid space (cannot
// collide with a real user) and the password is hashed with the SAME bcrypt path
// the merchant auth uses (src/api/shared/password.ts -> hashPassword), so the
// normal merchant login verifies it. emailVerified is set true so the M1 login
// email-verified gate passes. These rows are tooling-only and never created in
// production (the call-time guard refuses any non-staging deploy).
export const INSIGHTS_DEMO_LOGIN_EMAIL = 'insights-demo-owner@redeemo-insights-demo.invalid'

// FINDING #10: the demo login password is NEVER committed. It is read at seed time
// from the SERVER-OWNED env var below and hashed with the standard bcrypt path. If
// unset/empty the fixture FAILS CLOSED (throws) before any DB access. The operator
// chooses the secret per the runbook (docs/runbooks/insights-demo-fixture.md).
const DEMO_ADMIN_PASSWORD_ENV_VAR = 'INSIGHTS_DEMO_ADMIN_PASSWORD'

// The env flag that, together with a staging deploy identity, opens the
// include-path. Server-owned only (a process env var; never request-derived).
const DEMO_FLAG_ENV_VAR = 'INSIGHTS_DEMO_FIXTURE'
const DEMO_FLAG_AFFIRMATIVE = '1'

/**
 * The hard, call-time guard (finding #8 staging-identity update). Throws unless the
 * deploy identity is EXACTLY staging (REDEEMO_DEPLOY_ENV==='staging' via
 * isStagingDeploy) AND the explicit staging flag is set. Exported so the safety
 * tests can assert the throw paths directly without seeding. Reads ONLY server-owned
 * process config - it accepts no argument, so no caller (request/header/body/query/
 * cookie) can influence it. NODE_ENV is NOT consulted (Railway staging runs
 * NODE_ENV=production).
 */
export function assertInsightsDemoFixtureAllowed(): void {
  if (!isStagingDeploy()) {
    throw new Error(
      'seedInsightsDemoFixture refused: this is not a staging deploy. The Insights ' +
        'demo fixture requires REDEEMO_DEPLOY_ENV="staging" exactly (NODE_ENV is not ' +
        'consulted; Railway staging runs NODE_ENV=production). Production / unset / ' +
        `unknown all fail closed, even with ${DEMO_FLAG_ENV_VAR} set.`,
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

/**
 * Read the demo admin password from the server-owned env var, FAIL-CLOSED
 * (finding #10). Throws a clear, non-secret error when unset/empty so a misconfig
 * never seeds an admin with a guessable / committed credential. The value itself is
 * NEVER logged or returned. Exported so safety tests can assert the throw without
 * seeding.
 */
export function requireInsightsDemoAdminPassword(): string {
  const value = process.env[DEMO_ADMIN_PASSWORD_ENV_VAR]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `seedInsightsDemoFixture refused: ${DEMO_ADMIN_PASSWORD_ENV_VAR} is not set. ` +
        'The demo login password must be supplied by the operator via this ' +
        'server-owned env var (no password is committed). Set it to an ' +
        'operator-chosen secret per docs/runbooks/insights-demo-fixture.md.',
    )
  }
  return value
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

/** One pre-built redemption row (no DB ids yet are resolved at build time). */
type PlannedRedemption = {
  userId: string
  voucherId: string
  branchId: string
  redemptionCode: string
  redeemedAt: Date
  isValidated: boolean
  validatedAt: Date | null
  validationMethod: ValidationMethod | null
  estimatedSaving: number
}

/**
 * Seed the isolated Insights demo fixture. Throws at call time unless the
 * server-owned guard allows it (REDEEMO_DEPLOY_ENV='staging' + the explicit flag),
 * and unless the server-owned demo admin password is supplied.
 *
 * FULLY IDEMPOTENT / DETERMINISTIC RECONCILE: it finds-or-creates the dedicated demo
 * merchant by its sentinel name, its branches/vouchers by their fixed names/codes,
 * and an OWNER MerchantAdmin + membership (so QA can log in), then ATOMICALLY DELETES
 * the demo merchant's existing FIXTURE-OWNED redemptions and recreates a FIXED set
 * with STABLE redemptionCodes (no Date.now() salt). Running the fixture twice yields
 * the SAME row count, not double - a true reconcile, not an append.
 *
 * COLLISION FAIL-CLOSED (finding #10): every find-by-sentinel match is VERIFIED to be
 * the expected test-owned entity. If a real (non-test) merchant/branch/voucher/admin
 * already owns a sentinel name / code / email, the fixture THROWS - it never hijacks a
 * real row. A voucher-code collision with a non-demo voucher fails, never upserts.
 *
 * SCOPED DELETE (finding #10): the reseed deletes ONLY isTestData=true redemptions on
 * the demo branches, so a stray non-test row under a demo branch is preserved.
 *
 * CREDENTIAL FAIL-CLOSED (finding #10): the demo login password is read from the
 * server-owned env var INSIGHTS_DEMO_ADMIN_PASSWORD and hashed; if unset/empty the
 * function throws BEFORE any DB access (nothing is seeded). The password is NEVER
 * logged or returned.
 *
 * ATOMIC (finding #10): the redemption delete + recreate runs inside a single
 * prisma.$transaction, so an interruption cannot leave partial redemption data.
 *
 * Every row written carries isTestData=true, so the canonical eligible rule excludes
 * them from production analytics regardless of any guard state (the demo include-path
 * - demoIncludeMerchantId + buildEligibilityWhereSql's same-merchant carve-out - is
 * the only way QA surfaces them, and it is dead on a non-staging deploy).
 *
 * @param prisma a PrismaClient (server-owned; the ONLY argument - no opener).
 * @returns a summary of the ids/counts seeded (for the seeding script's log).
 */
export async function seedInsightsDemoFixture(prisma: PrismaClient): Promise<{
  merchantId: string
  merchantAdminId: string
  membershipId: string
  loginEmail: string
  branchIds: string[]
  voucherIds: string[]
  redemptionsCreated: number
}> {
  // GUARD FIRST: no DB access happens before this passes.
  assertInsightsDemoFixtureAllowed()

  // CREDENTIAL FAIL-CLOSED (finding #10): read + hash the operator-supplied secret
  // BEFORE any DB access. If the env var is unset/empty this throws and nothing is
  // seeded. The plaintext is never logged or returned.
  const passwordHash = await hashPassword(requireInsightsDemoAdminPassword())

  // 1. The dedicated demo merchant (allowlisted by its sentinel name). COLLISION
  //    FAIL-CLOSED: a pre-existing match MUST be the test-owned demo merchant; a
  //    real (isTestData=false) merchant that happens to carry the sentinel name is
  //    NEVER hijacked - we throw instead.
  const existingMerchant = await prisma.merchant.findFirst({
    where: { businessName: INSIGHTS_DEMO_MERCHANT_NAME },
    select: { id: true, isTestData: true },
  })
  if (existingMerchant && existingMerchant.isTestData !== true) {
    throw new Error(
      'seedInsightsDemoFixture refused: a NON-test merchant already owns the demo ' +
        `sentinel businessName "${INSIGHTS_DEMO_MERCHANT_NAME}". Refusing to mutate or ` +
        'hijack a real merchant.',
    )
  }
  const merchant =
    existingMerchant ??
    (await prisma.merchant.create({
      data: {
        businessName: INSIGHTS_DEMO_MERCHANT_NAME,
        status: 'ACTIVE',
        isTestData: true,
      },
      select: { id: true, isTestData: true },
    }))
  const merchantId = merchant.id

  // 1b. The demo OWNER login (MerchantAdmin + OWNER MerchantMembership). The unique
  //     key IS the sentinel demo email, so any match by that exact email is, by
  //     construction, the demo admin (the email lives in a clearly-demo .invalid
  //     space no real user can hold). We VERIFY the matched email equals the sentinel
  //     (defence in depth) before updating its credentials. The password is hashed
  //     with the SAME bcrypt path the merchant auth uses so the normal merchant login
  //     verifies it; emailVerified=true so the M1 login email-verified gate passes.
  const existingAdmin = await prisma.merchantAdmin.findUnique({
    where: { email: INSIGHTS_DEMO_LOGIN_EMAIL },
    select: { id: true, email: true },
  })
  if (existingAdmin && existingAdmin.email !== INSIGHTS_DEMO_LOGIN_EMAIL) {
    // Defence in depth: a unique-by-email lookup can only return the sentinel email,
    // but never trust a non-sentinel match.
    throw new Error(
      'seedInsightsDemoFixture refused: the MerchantAdmin matched by the demo ' +
        'sentinel email is not the expected demo owner. Refusing to mutate it.',
    )
  }
  const admin = await prisma.merchantAdmin.upsert({
    where: { email: INSIGHTS_DEMO_LOGIN_EMAIL },
    update: { passwordHash, emailVerified: true, status: 'ACTIVE' },
    create: {
      email: INSIGHTS_DEMO_LOGIN_EMAIL,
      passwordHash,
      firstName: 'Insights',
      lastName: 'Demo',
      status: 'ACTIVE',
      emailVerified: true,
    },
    select: { id: true },
  })
  const merchantAdminId = admin.id

  // OWNER membership, allBranches=true. Idempotent by the (merchantId, merchantAdminId)
  // unique pair so re-running never creates a duplicate membership.
  const existingMembership = await prisma.merchantMembership.findUnique({
    where: { merchantId_merchantAdminId: { merchantId, merchantAdminId } },
    select: { id: true },
  })
  const membership =
    existingMembership ??
    (await prisma.merchantMembership.create({
      data: {
        merchantId,
        merchantAdminId,
        role: 'OWNER',
        allBranches: true,
        status: 'ACTIVE',
      },
      select: { id: true },
    }))
  const membershipId = membership.id

  // 2. Branches (idempotent by name within the demo merchant). COLLISION FAIL-CLOSED:
  //    a pre-existing branch with the sentinel name under the demo merchant MUST be
  //    test-owned; a real (isTestData=false) branch is never reused.
  const branchIds: string[] = []
  for (const b of DEMO_BRANCHES) {
    const existing = await prisma.branch.findFirst({
      where: { merchantId, name: b.name },
      select: { id: true, isTestData: true },
    })
    if (existing && existing.isTestData !== true) {
      throw new Error(
        'seedInsightsDemoFixture refused: a NON-test branch already exists under the ' +
          `demo merchant with the sentinel name "${b.name}". Refusing to mutate it.`,
      )
    }
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
        select: { id: true, isTestData: true },
      }))
    branchIds.push(branch.id)
  }

  // 3. Vouchers (idempotent by unique code). COLLISION FAIL-CLOSED: a pre-existing
  //    voucher with the demo code MUST be test-owned AND on the demo merchant. A
  //    real voucher (or another merchant's voucher) that already owns a demo code
  //    THROWS - we never upsert/hijack it. We find-then-create rather than blind
  //    upsert so a non-demo owner of the code fails instead of being overwritten.
  const voucherIds: string[] = []
  for (const v of DEMO_VOUCHERS) {
    const existing = await prisma.voucher.findUnique({
      where: { code: v.code },
      select: { id: true, isTestData: true, merchantId: true },
    })
    if (existing) {
      if (existing.isTestData !== true || existing.merchantId !== merchantId) {
        throw new Error(
          'seedInsightsDemoFixture refused: the voucher code ' +
            `"${v.code}" is already owned by a non-demo voucher (test=${existing.isTestData}, ` +
            `merchantMatch=${existing.merchantId === merchantId}). Refusing to upsert/hijack it.`,
        )
      }
      voucherIds.push(existing.id) // an existing demo voucher: never mutate its shape
      continue
    }
    const created = await prisma.voucher.create({
      data: {
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
    voucherIds.push(created.id)
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

  // 5. Redemptions: a DETERMINISTIC, ATOMIC, SCOPED RECONCILE. Plan a FIXED set with
  //    STABLE redemptionCodes (seq-derived, NO Date.now() salt) so running the fixture
  //    twice yields the SAME row count, not double.
  //
  //    The demo branches are dedicated isTestData=true branches on the dedicated demo
  //    merchant; the demo merchant/vouchers are isTestData=true and excluded from
  //    discovery, so a real customer can never redeem at them. The reseed therefore
  //    deletes ONLY the FIXTURE-OWNED rows (branchId IN demo-branch-ids AND
  //    isTestData=true) - a stray non-test redemption that somehow exists under a demo
  //    branch is PRESERVED (finding #10). We scope by branch id (NOT code prefix) so a
  //    fixture-version change to the redemptionCode scheme still fully reconciles prior
  //    demo rows. All planned rows carry isTestData=true.
  const planned: PlannedRedemption[] = []
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

      // A STABLE, unique, sentinel-prefixed redemption code (<= 24 chars upper),
      // derived ONLY from the sequence index so a re-run produces the EXACT same
      // codes (the prior batch having been deleted above). seq is zero-padded so
      // ordering + uniqueness hold across the whole batch.
      const redemptionCode = `IDEMO-${String(seq).padStart(5, '0')}`

      planned.push({
        userId,
        voucherId,
        branchId,
        redemptionCode,
        redeemedAt,
        isValidated,
        validatedAt,
        validationMethod,
        estimatedSaving: voucher.estimatedSaving,
      })
      seq += 1
    }
  }

  // ATOMIC reconcile (finding #10): delete the fixture-owned rows and recreate the
  // planned set in ONE transaction so an interruption cannot leave partial data.
  const redemptionsCreated = await prisma.$transaction(async (tx) => {
    await tx.voucherRedemption.deleteMany({
      where: { branchId: { in: branchIds }, isTestData: true },
    })
    const result = await tx.voucherRedemption.createMany({
      data: planned.map((p) => ({ ...p, isTestData: true })),
    })
    return result.count
  })

  return { merchantId, merchantAdminId, membershipId, loginEmail: INSIGHTS_DEMO_LOGIN_EMAIL, branchIds, voucherIds, redemptionsCreated }
}
