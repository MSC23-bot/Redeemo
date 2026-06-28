import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  makeTestPrisma,
  newFixtureIds,
  seedScenario,
  seedRedemption,
  cleanup,
  type FixtureIds,
} from './testDb'
import type { PrismaClient } from '../../../../../generated/prisma/client'

// Insights PR-A harness end-to-end smoke (REAL local DB).
//
// Proves the harness + the isolated local Postgres (redeemo_insights_test on
// 127.0.0.1:54329) actually work together: makeTestPrisma() opens a loopback
// client, the seed helpers create a real (isTestData=false) merchant + branch +
// user + voucher + redemption with unique ids, the rows read back, and cleanup()
// removes exactly those rows in FK-safe order. If this passes, every later
// Insights integration test can rely on the harness.

describe('Insights harness smoke (real local DB)', () => {
  let prisma: PrismaClient
  let ids: FixtureIds
  let merchantId: string
  let branchId: string
  let userId: string
  let voucherId: string
  let redemptionId: string

  beforeAll(async () => {
    prisma = makeTestPrisma()
    ids = newFixtureIds()
    const s = await seedScenario(prisma, ids)
    merchantId = s.merchantId
    branchId = s.branchId
    userId = s.userId
    voucherId = s.voucherId
    redemptionId = await seedRedemption(prisma, ids, {
      userId,
      voucherId,
      branchId,
      isValidated: true,
      validatedAt: new Date(),
      validationMethod: 'PIN',
      estimatedSaving: 7.5,
    })
  })

  afterAll(async () => {
    await cleanup(prisma, ids)
    await prisma.$disconnect()
  })

  it('seeds a real eligible scenario and reads it back via the branch join', async () => {
    const row = await prisma.voucherRedemption.findUnique({
      where: { id: redemptionId },
      include: { branch: { include: { merchant: true } }, user: true, voucher: true },
    })

    expect(row).not.toBeNull()
    expect(row!.branchId).toBe(branchId)
    expect(row!.userId).toBe(userId)
    expect(row!.voucherId).toBe(voucherId)
    // Eligible defaults: real (not test) data across the join.
    expect(row!.isTestData).toBe(false)
    expect(row!.branch.isTestData).toBe(false)
    expect(row!.branch.merchant.isTestData).toBe(false)
    expect(row!.branch.merchant.id).toBe(merchantId)
    expect(row!.branch.merchant.status).toBe('ACTIVE')
    expect(row!.user.status).toBe('ACTIVE')
    // Confirmed row: isValidated=true is the counting-model discriminator.
    expect(row!.isValidated).toBe(true)
    expect(Number(row!.estimatedSaving)).toBe(7.5)
  })

  it('cleanup deletes exactly the tracked rows in FK-safe order', async () => {
    // Use a throwaway ledger so this assertion does not disturb the suite's
    // afterAll cleanup of the primary fixtures.
    const scratch = newFixtureIds()
    const s = await seedScenario(prisma, scratch)
    const rid = await seedRedemption(prisma, scratch, {
      userId: s.userId,
      voucherId: s.voucherId,
      branchId: s.branchId,
    })

    expect(await prisma.voucherRedemption.findUnique({ where: { id: rid } })).not.toBeNull()

    await cleanup(prisma, scratch)

    expect(await prisma.voucherRedemption.findUnique({ where: { id: rid } })).toBeNull()
    expect(await prisma.voucher.findUnique({ where: { id: s.voucherId } })).toBeNull()
    expect(await prisma.branch.findUnique({ where: { id: s.branchId } })).toBeNull()
    expect(await prisma.merchant.findUnique({ where: { id: s.merchantId } })).toBeNull()
    expect(await prisma.user.findUnique({ where: { id: s.userId } })).toBeNull()
  })
})
