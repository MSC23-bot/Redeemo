import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

let testMerchantId: string

beforeAll(async () => {
  // Create a throwaway merchant so the test does not mutate any seeded
  // merchant's highlight set. Required fields per prisma/schema.prisma
  // Merchant model: only `businessName` is non-nullable without a default.
  // `status` defaults to REGISTERED; we set ACTIVE to mirror the plan's
  // intent (the trigger fires regardless of status).
  const m = await prisma.merchant.create({
    data: {
      businessName: 'TEST 3-cap trigger merchant — auto-generated',
      tradingName: 'TEST 3-cap trigger',
      status: 'ACTIVE',
    },
  })
  testMerchantId = m.id
})

afterAll(async () => {
  // Cleanup runs even if the test fails. Delete the highlights first so the
  // FK from MerchantHighlight → Merchant does not block the merchant delete.
  await prisma.merchantHighlight.deleteMany({ where: { merchantId: testMerchantId } })
  await prisma.merchant.delete({ where: { id: testMerchantId } })
  await prisma.$disconnect()
})

describe('MerchantHighlight 3-cap trigger', () => {
  it('rejects insertion of a 4th highlight for the same merchant', async () => {
    const highlights = await prisma.tag.findMany({ where: { type: 'HIGHLIGHT' }, take: 4 })
    expect(highlights.length).toBe(4)

    // Insert 3 — should succeed
    for (let i = 0; i < 3; i++) {
      await prisma.merchantHighlight.create({
        data: {
          merchantId: testMerchantId,
          highlightTagId: highlights[i].id,
          sortOrder: i,
        },
      })
    }

    // Insert 4th — should throw with the named exception raised by the trigger
    await expect(
      prisma.merchantHighlight.create({
        data: {
          merchantId: testMerchantId,
          highlightTagId: highlights[3].id,
          sortOrder: 3,
        },
      }),
    ).rejects.toThrow(/merchant_highlight_cap_exceeded/)
  })
})
