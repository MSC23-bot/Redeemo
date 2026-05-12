import 'dotenv/config'
import { describe, expect, it, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * REUSABLE v1 Task 1 (D51 Amendment 2) — defensive CHECK constraints on
 * `Voucher.cooldownSeconds`.
 *
 *   1. Floor:        cooldownSeconds IS NULL OR cooldownSeconds >= 1800
 *   2. Scope check:  type = 'REUSABLE' OR cooldownSeconds IS NULL
 *
 * Same defence-in-depth pattern as the existing §AG3
 * `RedemptionScreenshotEvent_platform_check` constraint
 * (see tests/prisma/redemption-screenshot-event-platform-check.test.ts).
 *
 * Note (deviation from plan): the plan's listing imports
 * `from '../../../src/lib/prisma'`, but no such module exists in this
 * codebase. Following the established sibling-test pattern under
 * `tests/prisma/` — real PrismaClient + PrismaPg adapter, configured
 * inline from `process.env.DATABASE_URL`. Test scenarios + assertions
 * are kept verbatim as in plan Step 1.6.
 *
 * Spec §4.1, §4.3, D1, D3.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Voucher.cooldownSeconds — DB CHECK constraints', () => {
  it('rejects cooldownSeconds < 1800 (floor)', async () => {
    // Try to insert a REUSABLE voucher with cooldownSeconds = 1799 — should fail.
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Voucher" (
          "id", "merchantId", "code", "type", "title",
          "estimatedSaving", "status", "approvalStatus",
          "cooldownSeconds", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(),
          (SELECT id FROM "Merchant" LIMIT 1),
          'TEST-COOLDOWN-FLOOR', 'REUSABLE', 'Test',
          0, 'DRAFT', 'PENDING',
          1799,
          now(), now()
        )
      `
    ).rejects.toThrow(/Voucher_cooldownSeconds_min_check/)
  })

  it('rejects non-null cooldownSeconds on non-REUSABLE voucher (scope check)', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Voucher" (
          "id", "merchantId", "code", "type", "title",
          "estimatedSaving", "status", "approvalStatus",
          "cooldownSeconds", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(),
          (SELECT id FROM "Merchant" LIMIT 1),
          'TEST-COOLDOWN-SCOPE', 'BOGO', 'Test',
          0, 'DRAFT', 'PENDING',
          3600,
          now(), now()
        )
      `
    ).rejects.toThrow(/Voucher_cooldownSeconds_reusable_only_check/)
  })

  it('accepts cooldownSeconds = 1800 (floor inclusive)', async () => {
    // Should succeed.
    const ids = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "Voucher" (
        "id", "merchantId", "code", "type", "title",
        "estimatedSaving", "status", "approvalStatus",
        "cooldownSeconds", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        (SELECT id FROM "Merchant" LIMIT 1),
        'TEST-COOLDOWN-OK-FLOOR', 'REUSABLE', 'Test',
        0, 'DRAFT', 'PENDING',
        1800,
        now(), now()
      ) RETURNING id
    `
    expect(ids.length).toBe(1)
    await prisma.voucher.delete({ where: { id: ids[0]!.id } })
  })

  it('accepts cooldownSeconds = null on REUSABLE', async () => {
    const ids = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "Voucher" (
        "id", "merchantId", "code", "type", "title",
        "estimatedSaving", "status", "approvalStatus",
        "cooldownSeconds", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        (SELECT id FROM "Merchant" LIMIT 1),
        'TEST-COOLDOWN-OK-NULL-REUSABLE', 'REUSABLE', 'Test',
        0, 'DRAFT', 'PENDING',
        NULL,
        now(), now()
      ) RETURNING id
    `
    expect(ids.length).toBe(1)
    await prisma.voucher.delete({ where: { id: ids[0]!.id } })
  })

  it('accepts cooldownSeconds = null on non-REUSABLE', async () => {
    const ids = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "Voucher" (
        "id", "merchantId", "code", "type", "title",
        "estimatedSaving", "status", "approvalStatus",
        "cooldownSeconds", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        (SELECT id FROM "Merchant" LIMIT 1),
        'TEST-COOLDOWN-OK-NULL-BOGO', 'BOGO', 'Test',
        0, 'DRAFT', 'PENDING',
        NULL,
        now(), now()
      ) RETURNING id
    `
    expect(ids.length).toBe(1)
    await prisma.voucher.delete({ where: { id: ids[0]!.id } })
  })
})
