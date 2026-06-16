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
let categoryId = ''
let lockedMerchantId = ''

beforeAll(async () => {
  // B2.3-read: a throwaway category so the merchant has a primaryCategoryId to expose.
  const cat = await prisma.category.create({ data: { name: `${PREFIX} Category`, isActive: true } })
  categoryId = cat.id

  const m = await prisma.merchant.create({
    data: {
      businessName: `${PREFIX} Co`,
      tradingName: `${PREFIX} Trading`,
      status: 'ACTIVE',
      websiteUrl: 'https://b21read.example.com',
      vatNumber: VAT_VALUE,
      companyNumber: COMPANY_VALUE,
      primaryCategoryId: categoryId,
      description: 'We sell coffee',
      isTestData: true,
    },
  })
  merchantId = m.id

  // B2.3-read: a second merchant with an ACTIVE RMV so categoryLocked is true.
  // B2.5: also give it a PENDING identity edit so hasPendingIdentityEdit is true.
  const locked = await prisma.merchant.create({
    data: { businessName: `${PREFIX} Locked Co`, status: 'ACTIVE', primaryCategoryId: categoryId, isTestData: true },
  })
  lockedMerchantId = locked.id
  await prisma.merchantPendingEdit.create({
    data: { merchantId: locked.id, proposedChanges: { businessName: `${PREFIX} New` } as any, status: 'PENDING' },
  })
  await prisma.voucher.create({
    data: {
      merchantId: locked.id, code: `${PREFIX}-RMV-1`, type: 'DISCOUNT_FIXED', title: 'RMV', estimatedSaving: 5,
      isRmv: true, isMandatory: true, status: 'ACTIVE', isTestData: true,
    },
  })
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
    await prisma.voucher.deleteMany({ where: { merchantId: { in: ids } } })
    await prisma.merchantPendingEdit.deleteMany({ where: { merchantId: { in: ids } } })
    await prisma.branch.deleteMany({ where: { merchantId: { in: ids } } })
    await prisma.merchant.deleteMany({ where: { id: { in: ids } } })
  }
  // Category last: merchants FK-reference it via primaryCategoryId.
  await prisma.category.deleteMany({ where: { name: { startsWith: PREFIX } } })
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
    // B2.3-read: primaryCategoryId exposed; categoryLocked false (no RMV).
    expect(res.merchant.primaryCategoryId).toBe(categoryId)
    expect(res.merchant.categoryLocked).toBe(false)
    // B2.5: description exposed; hasPendingIdentityEdit false (no pending edit).
    expect(res.merchant.description).toBe('We sell coffee')
    expect(res.merchant.hasPendingIdentityEdit).toBe(false)
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

  it('categoryLocked is true for a merchant with a submitted/live RMV (B2.3-read)', async () => {
    const res = await getMerchantDetail(prisma, lockedMerchantId)
    expect(res.merchant.categoryLocked).toBe(true)
  })

  it('hasPendingIdentityEdit is true for a merchant with a PENDING identity edit (B2.5)', async () => {
    const res = await getMerchantDetail(prisma, lockedMerchantId)
    expect(res.merchant.hasPendingIdentityEdit).toBe(true)
  })

  it('throws MERCHANT_NOT_FOUND for an unknown id', async () => {
    await expect(
      getMerchantDetail(prisma, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ code: 'MERCHANT_NOT_FOUND' })
  })
})
