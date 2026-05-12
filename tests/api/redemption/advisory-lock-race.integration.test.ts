import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { createRedemption } from '../../../src/api/redemption/service'
import { encrypt } from '../../../src/api/shared/encryption'

/**
 * REUSABLE v1 Task 4 — real-DB integration test for the advisory lock.
 *
 * Spec §5.5 (D51 Amendment 1, amendment 2026-05-12): this is the
 * CANONICAL proof that whichever lock expression ships actually serialises
 * two concurrent transactions for the same (userId, voucherId).
 *
 * Mocked tests (`atomic-claim-reusable.test.ts`) prove branch shape +
 * error format. They cannot prove the lock semantics — only a real
 * Postgres `pg_advisory_xact_lock` can.
 *
 * Setup: real Neon dev DB. Creates fixture merchant + branch +
 * REUSABLE voucher + user + active subscription with branch PIN
 * encrypted via the shared `encrypt()` helper. Cleans up in
 * dependency order on afterAll.
 *
 * Test: kick off two concurrent createRedemption calls for the same
 * (userId, voucherId) via Promise.allSettled. Exactly one must succeed
 * (commits a VoucherRedemption row) and exactly one must fail with
 * REUSABLE_COOLDOWN_ACTIVE.
 *
 * Mirrors test setup pattern from
 * `tests/prisma/redemption-screenshot-event-platform-check.test.ts`
 * (the §AG3 precedent) — inline PrismaClient + PrismaPg adapter.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

// Cooldown floor — 30 min. The lowest value the runtime clamp permits,
// keeping the test fixture compact while still exercising real cooldown
// arithmetic.
const COOLDOWN_SECONDS = 1800
const PIN = '1234'

let testUserId:        string
let testVoucherId:     string
let testBranchId:      string
let testMerchantId:    string
let testSubscriptionId: string
let testPlanId:        string

/**
 * In-memory Redis shim. The race test only exercises the PIN fail-counter
 * path (get/incr/expire/del), and we never want a counter from a prior
 * test run to leak in. The shim is hard-wired to "no failures, ever".
 *
 * `del`/`incr`/`expire` are no-ops because the success path's `redis.del`
 * needs to be callable without side effects, and PIN compare succeeds
 * on the first try.
 */
function inMemoryRedisShim(): any {
  return {
    get:    async () => null,
    incr:   async () => 1,
    expire: async () => 1,
    del:    async () => 1,
    ttl:    async () => 900,
    set:    async () => 'OK',
  }
}

beforeAll(async () => {
  // Reuse an existing seeded SubscriptionPlan if present; otherwise create
  // a throwaway one. The seed populates monthly/annual plans on first
  // `prisma db seed` — production tests run against a seeded DB.
  let plan = await prisma.subscriptionPlan.findFirst({
    select: { id: true },
  })
  if (!plan) {
    plan = await prisma.subscriptionPlan.create({
      data: {
        name:            'TEST §5.5 race plan',
        priceGbp:        '0.00',
        billingInterval: 'MONTHLY',
        stripePriceId:   `test-price-${Date.now()}`,
        isActive:        true,
      },
      select: { id: true },
    })
  }
  testPlanId = plan.id

  const ts = Date.now()
  const merchant = await prisma.merchant.create({
    data: {
      businessName: `TEST §5.5 race merchant ${ts}`,
      status:       'ACTIVE',
    },
  })
  testMerchantId = merchant.id

  const branch = await prisma.branch.create({
    data: {
      merchantId:    merchant.id,
      name:          `TEST §5.5 race branch ${ts}`,
      addressLine1:  'Test',
      city:          'Test',
      postcode:      'TE1 1ST',
      country:       'United Kingdom',
      isMainBranch:  true,
      isActive:      true,
      // Encrypted PIN via the shared helper — real ciphertext that
      // `decrypt()` inside createRedemption will round-trip back to PIN.
      redemptionPin: encrypt(PIN),
    },
  })
  testBranchId = branch.id

  const voucher = await prisma.voucher.create({
    data: {
      merchantId:      merchant.id,
      code:            `RACE-${ts}`,
      title:           'TEST §5.5 race REUSABLE voucher',
      description:     'Auto-generated for the advisory-lock race test',
      type:            'REUSABLE',
      estimatedSaving: '0.00',
      status:          'ACTIVE',
      approvalStatus:  'APPROVED',
      cooldownSeconds: COOLDOWN_SECONDS,
    },
  })
  testVoucherId = voucher.id

  const user = await prisma.user.create({
    data: {
      email:         `race-test-${ts}@redeemo.test`,
      passwordHash:  'placeholder',
      firstName:     'Race',
      lastName:      'Test',
      phoneVerified: true,
    },
  })
  testUserId = user.id

  const now      = new Date()
  const anchor   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const periodEnd = new Date(now)
  periodEnd.setFullYear(periodEnd.getFullYear() + 1)

  const sub = await prisma.subscription.create({
    data: {
      userId:             user.id,
      planId:             plan.id,
      status:             'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd:   periodEnd,
      cycleAnchorDate:    anchor,
    },
  })
  testSubscriptionId = sub.id
})

afterAll(async () => {
  // Tear down in dependency order: redemptions (FK to user + voucher +
  // branch) → cycle states (FK to user + voucher) → subscription → user
  // → voucher → branch → merchant.
  if (testUserId)         await prisma.voucherRedemption.deleteMany({ where: { userId: testUserId } })
  if (testUserId)         await prisma.userVoucherCycleState.deleteMany({ where: { userId: testUserId } })
  if (testSubscriptionId) await prisma.subscription.deleteMany({ where: { id: testSubscriptionId } })
  if (testUserId)         await prisma.user.deleteMany({ where: { id: testUserId } })
  if (testVoucherId)      await prisma.voucher.deleteMany({ where: { id: testVoucherId } })
  if (testBranchId)       await prisma.branch.deleteMany({ where: { id: testBranchId } })
  if (testMerchantId)     await prisma.merchant.deleteMany({ where: { id: testMerchantId } })
  await prisma.$disconnect()
})

describe('REUSABLE advisory lock — real-DB race (integration, spec §5.5)', () => {
  it('two concurrent redemption attempts: exactly one succeeds, the other fails with REUSABLE_COOLDOWN_ACTIVE', async () => {
    const redis = inMemoryRedisShim()
    const ctx   = { ipAddress: '127.0.0.1', userAgent: 'test' }

    // Fire BOTH attempts in parallel. Each call opens its own
    // transaction; the lock keyed on (userId, voucherId) serialises them.
    const [result1, result2] = await Promise.allSettled([
      createRedemption(
        prisma, redis, testUserId,
        { voucherId: testVoucherId, branchId: testBranchId, pin: PIN },
        ctx,
      ),
      createRedemption(
        prisma, redis, testUserId,
        { voucherId: testVoucherId, branchId: testBranchId, pin: PIN },
        ctx,
      ),
    ])

    const succeeded = [result1, result2].filter(r => r.status === 'fulfilled')
    const failed    = [result1, result2].filter(r => r.status === 'rejected')

    // Exactly one of each.
    expect(succeeded.length).toBe(1)
    expect(failed.length).toBe(1)

    // The failed one carries the typed COOLDOWN_ACTIVE error with
    // ISO availableAgainAt.
    const reason = (failed[0] as PromiseRejectedResult).reason
    expect(reason).toBeDefined()
    expect(reason.code).toBe('REUSABLE_COOLDOWN_ACTIVE')
    expect(reason.details).toBeDefined()
    expect(typeof reason.details.availableAgainAt).toBe('string')
    // ISO 8601 sanity check.
    expect(reason.details.availableAgainAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)

    // Exactly one VoucherRedemption row exists in the DB for
    // (userId, voucherId) — proves the lock actually serialised and the
    // failing transaction rolled back cleanly without committing its row.
    const rows = await prisma.voucherRedemption.findMany({
      where: { userId: testUserId, voucherId: testVoucherId },
    })
    expect(rows.length).toBe(1)
  }, 30000)  // generous DB-wait timeout
})
