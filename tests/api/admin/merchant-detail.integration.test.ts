import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getMerchantDetail } from '../../../src/api/admin/merchants/service'

// Option B B2.1-read: real-DB proof that getMerchantDetail returns the editable
// + display fields, EXCLUDES soft-deleted branches, and NEVER leaks the branch
// redemptionPin or the high-risk merchant fields (vatNumber/companyNumber).

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const PREFIX = `b21-read-it-${Date.now()}`
const PIN_SENTINEL = 'REDPIN-SENTINEL-DO-NOT-LEAK'
const VAT_SENTINEL = 'GB-VAT-SHOULD-NOT-LEAK'
const COMPANY_SENTINEL = 'COMPANY-SHOULD-NOT-LEAK'
let merchantId = ''

beforeAll(async () => {
  const m = await prisma.merchant.create({
    data: {
      businessName: `${PREFIX} Co`,
      tradingName: `${PREFIX} Trading`,
      status: 'ACTIVE',
      websiteUrl: 'https://b21read.example.com',
      vatNumber: VAT_SENTINEL,
      companyNumber: COMPANY_SENTINEL,
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
  it('returns the merchant websiteUrl + the active branch contact/display fields', async () => {
    const res = await getMerchantDetail(prisma, merchantId)
    expect(res.merchant.id).toBe(merchantId)
    expect(res.merchant.websiteUrl).toBe('https://b21read.example.com')
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

  it('NEVER leaks redemptionPin or the high-risk merchant fields (redaction)', async () => {
    const res = await getMerchantDetail(prisma, merchantId)
    const serialized = JSON.stringify(res)
    expect(serialized).not.toContain(PIN_SENTINEL) // redemptionPin never selected
    expect(serialized).not.toContain(VAT_SENTINEL) // vatNumber excluded (B2.2)
    expect(serialized).not.toContain(COMPANY_SENTINEL) // companyNumber excluded (B2.2)
    expect(res.branches[0]).not.toHaveProperty('redemptionPin')
    expect(res.merchant).not.toHaveProperty('vatNumber')
    expect(res.merchant).not.toHaveProperty('companyNumber')
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
