import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getCustomerMerchant } from '../../../src/api/customer/discovery/service'

// Integration test against the worktree's Neon DB. Locks the privacy contract
// for /api/v1/customer/merchants/:id: contact details (phone/email) live on
// Branch only, never at the top-level Merchant. This caught a real bug where
// the Prisma select included phone/email keys on Merchant — fields that don't
// exist there.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

let devMerchantId: string

beforeAll(async () => {
  const m = await prisma.merchant.findFirst({
    where: { id: 'dev-merchant-001' },
    select: { id: true },
  })
  if (!m) throw new Error('dev-merchant-001 not seeded — run `npx prisma db seed` first')
  devMerchantId = m.id
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('getCustomerMerchant — phone/email privacy contract', () => {
  it('does not throw on a valid merchant id (no schema-drift on the select)', async () => {
    await expect(getCustomerMerchant(prisma, devMerchantId, null)).resolves.toBeDefined()
  })

  it('does not expose phone or email at the top level of the response', async () => {
    const result = await getCustomerMerchant(prisma, devMerchantId, null)
    expect(result).not.toHaveProperty('phone')
    expect(result).not.toHaveProperty('email')
  })

  it('exposes phone + email on each branch (correct location for contact details)', async () => {
    const result = await getCustomerMerchant(prisma, devMerchantId, null)
    expect(Array.isArray(result.branches)).toBe(true)
    expect(result.branches.length).toBeGreaterThan(0)
    for (const branch of result.branches) {
      expect(branch).toHaveProperty('phone')
      expect(branch).toHaveProperty('email')
    }
  })
})
