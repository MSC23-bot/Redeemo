import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getMerchantDetail } from '../../../src/api/admin/merchants/service'

// Option B B2.1-read + B2.2: real-DB proof that getMerchantDetail returns the
// editable + display fields PLUS the read-only registered-identity fields
// (vatNumber/companyNumber, B2.2), EXCLUDES soft-deleted branches, and NEVER
// leaks the branch redemptionPin.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const PREFIX = `b21-read-it-${Date.now()}`
const PIN_SENTINEL = 'REDPIN-SENTINEL-DO-NOT-LEAK'
const VAT_VALUE = 'GB-VAT-B22-READONLY'
const COMPANY_VALUE = 'COMPANY-B22-READONLY'
let merchantId = ''

beforeAll(async () => {
  const m = await prisma.merchant.create({
    data: {
      businessName: `${PREFIX} Co`,
      tradingName: `${PREFIX} Trading`,
      status: 'ACTIVE',
      websiteUrl: 'https://b21read.example.com',
      vatNumber: VAT_VALUE,
      companyNumber: COMPANY_VALUE,
      isTestData: true,
    },
  })
  merchantId = m.id
  // Active main branch with the B2.1-editable contact fields + a redemptionPin sentinel.
  await prisma.branch.create({
    data: {
      merchantId: m.id, name: `${PREFIX} Main`, isMainBranch: true,
      addressLine1: '1 Old Street', city: 'London', postcode: 'EC1A 1BB',
      localityName: 'City of London',
      phone: '+44 20 1234 5678', email: 'main@b21read.example.com',
      websiteUrl: 'https://branch.example.com', isActive: true,
      redemptionPin: PIN_SENTINEL,
    },
  })
  // Soft-deleted branch (must be excluded from the detail).
  await prisma.branch.create({
    data: {
      merchantId: m.id, name: `${PREFIX} Closed`, isMainBranch: false,
      addressLine1: '2 Gone Road', city: 'London', postcode: 'EC1A 1BB',
      isActive: false, deletedAt: new Date(),
    },
  })
})

afterAll(async () => {
  const ids = (
    await prisma.merchant.findMany({ where: { businessName: { startsWith: PREFIX } }, select: { id: true } })
  ).map((m) => m.id)
  if (ids.length) {
    await prisma.branch.deleteMany({ where: { merchantId: { in: ids } } })
    await prisma.merchant.deleteMany({ where: { id: { in: ids } } })
  }
  await prisma.$disconnect()
}, 60000)

describe('getMerchantDetail (real DB)', () => {
  it('returns the merchant websiteUrl + read-only vat/company + the active branch fields', async () => {
    const res = await getMerchantDetail(prisma, merchantId)
    expect(res.merchant.id).toBe(merchantId)
    expect(res.merchant.websiteUrl).toBe('https://b21read.example.com')
    // B2.2: registered-identity fields returned read-only.
    expect(res.merchant.vatNumber).toBe(VAT_VALUE)
    expect(res.merchant.companyNumber).toBe(COMPANY_VALUE)
    expect(res.branches).toHaveLength(1) // soft-deleted excluded
    const b = res.branches[0]
    expect(b.name).toBe(`${PREFIX} Main`)
    expect(b.isMainBranch).toBe(true)
    expect(b.phone).toBe('+44 20 1234 5678')
    expect(b.email).toBe('main@b21read.example.com')
    expect(b.websiteUrl).toBe('https://branch.example.com')
    expect(b.isActive).toBe(true)
    expect(b.localityName).toBe('City of London')
    expect(b.locationConfidence).toBeDefined() // default POSTCODE_CENTROID
  })

  it('NEVER leaks the branch redemptionPin (secret redaction)', async () => {
    const res = await getMerchantDetail(prisma, merchantId)
    const serialized = JSON.stringify(res)
    expect(serialized).not.toContain(PIN_SENTINEL) // redemptionPin never selected
    expect(res.branches[0]).not.toHaveProperty('redemptionPin')
  })

  it('excludes soft-deleted branches', async () => {
    const res = await getMerchantDetail(prisma, merchantId)
    expect(res.branches.every((b) => b.name !== `${PREFIX} Closed`)).toBe(true)
  })

  it('throws MERCHANT_NOT_FOUND for an unknown id', async () => {
    await expect(
      getMerchantDetail(prisma, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ code: 'MERCHANT_NOT_FOUND' })
  })
})
