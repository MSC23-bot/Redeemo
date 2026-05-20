// tests/prisma/seed-guardrail.test.ts
//
// Real-DB integration test (§BU pattern) — runs the same audit script
// inline against the connected DB. Stage 1 ships this as NON-BLOCKING:
// the test exists, is skipped by default via `describe.skip`, and can
// be flipped to `describe` for manual local QA.  Stage 4 promotes it
// to active (un-skipped) once Stages 2/3 have closed the rule failures.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const REAL_MERCHANT_IDS = new Set([
  'tax-merchant-karaara-001',
  'tax-merchant-mykerala-001',
  'tax-merchant-covelum-001',
])

const LEAKED_FIXTURE_PREFIXES = [
  'P1Test-', 'SummaryTest-', 'SummaryTestOther-', 'TEST ',
  'UpsertRevive-', 'Revive-', 'Drift-', 'FilterFlip-',
] as const

beforeAll(async () => { await prisma.$queryRaw`SELECT 1` }, 15000)
afterAll(async () => { await prisma.$disconnect() })

// Stage 1 ships as describe.skip — non-blocking until Stage 2/3 close the gaps.
// Stage 4 flips this to `describe` to make it CI-blocking.
describe.skip('seed-guardrail (Stage 4 will un-skip)', () => {
  it('R1: every active branch of an ACTIVE merchant has >=1 approved voucher', async () => {
    const merchants = await prisma.merchant.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true, businessName: true,
        branches: { where: { isActive: true }, select: { id: true } },
        vouchers: { where: { status: 'ACTIVE', approvalStatus: 'APPROVED' }, select: { id: true } },
      },
    })
    const offenders = merchants
      .filter(m => m.branches.length > 0 && m.vouchers.length === 0)
      .map(m => m.businessName)
    expect(offenders, `Merchants with active branches but 0 approved vouchers: ${offenders.join(', ')}`).toEqual([])
  })

  it('R2: every customer-visible merchant has logoUrl AND bannerUrl', async () => {
    const merchants = await prisma.merchant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, businessName: true, logoUrl: true, bannerUrl: true },
    })
    const offenders = merchants
      .filter(m => !m.logoUrl || !m.bannerUrl)
      .map(m => m.businessName)
    expect(offenders).toEqual([])
  })

  it('R3: every active branch has at least one BranchOpeningHours row', async () => {
    const branches = await prisma.branch.findMany({
      where: { isActive: true, merchant: { status: 'ACTIVE' } },
      select: { id: true, name: true, openingHours: { select: { id: true } } },
    })
    const offenders = branches.filter(b => b.openingHours.length === 0).map(b => b.name)
    expect(offenders).toEqual([])
  })

  it('R4: every active branch has redemptionPin set', async () => {
    const branches = await prisma.branch.findMany({
      where: { isActive: true, merchant: { status: 'ACTIVE' } },
      select: { id: true, name: true, redemptionPin: true },
    })
    const offenders = branches.filter(b => !b.redemptionPin).map(b => b.name)
    expect(offenders).toEqual([])
  })

  it('R5: every active branch has address (addressLine1, city, postcode, country)', async () => {
    const branches = await prisma.branch.findMany({
      where: { isActive: true, merchant: { status: 'ACTIVE' } },
      select: { id: true, name: true, addressLine1: true, city: true, postcode: true, country: true },
    })
    const offenders = branches
      .filter(b => !b.addressLine1 || !b.city || !b.postcode || !b.country)
      .map(b => b.name)
    expect(offenders).toEqual([])
  })

  it('R6: every active branch has phone OR email contact', async () => {
    const branches = await prisma.branch.findMany({
      where: { isActive: true, merchant: { status: 'ACTIVE' } },
      select: { id: true, name: true, phone: true, email: true },
    })
    const offenders = branches.filter(b => !b.phone && !b.email).map(b => b.name)
    expect(offenders).toEqual([])
  })

  it('R7: every customer-visible merchant has primaryCategoryId set', async () => {
    const merchants = await prisma.merchant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, businessName: true, primaryCategoryId: true },
    })
    const offenders = merchants.filter(m => !m.primaryCategoryId).map(m => m.businessName)
    expect(offenders).toEqual([])
  })

  it('R8: no leaked-test-fixture-prefix merchants are ACTIVE', async () => {
    const merchants = await prisma.merchant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, businessName: true },
    })
    const offenders = merchants
      .filter(m => LEAKED_FIXTURE_PREFIXES.some(p => m.businessName.startsWith(p)))
      .map(m => m.businessName)
    expect(offenders).toEqual([])
  })

  it('R9: real merchants have MANUALLY_CONFIRMED branches with non-null coords', async () => {
    const branches = await prisma.branch.findMany({
      where: { isActive: true, merchant: { id: { in: Array.from(REAL_MERCHANT_IDS) } } },
      select: { id: true, name: true, latitude: true, longitude: true, locationConfidence: true },
    })
    const offenders = branches
      .filter(b => b.locationConfidence !== 'MANUALLY_CONFIRMED' || b.latitude === null || b.longitude === null)
      .map(b => b.name)
    expect(offenders).toEqual([])
  })
})
