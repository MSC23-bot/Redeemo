// tests/prisma/seed-guardrail.test.ts
//
// Real-DB integration test (§BU pattern).  Stage 4 promotes R1 + R4 + R5 +
// R6 + R7 + R8 to ACTIVE (CI-blocking) — these are the rules that Stage 4
// cleanup actually closed.  R2 / R3 / R9 stay `it.skip` until Stage 3
// closes the real-merchant media + opening hours + Google-Places coord
// verification (4 R2 + 2 R3 + 0 R9 residual failures known to remain
// on dev DB pre-Stage-3).
//
// See docs/superpowers/plans/2026-05-20-seed-merchant-enrichment.md
// "Stage 4 owner-locked scope" section + the post-merge addendum for
// the rationale on the R2 / R3 / R9 deferral.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { LEAKED_FIXTURE_PREFIXES } from '../api/_shared/fixtureSweep'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const REAL_MERCHANT_IDS = new Set([
  'tax-merchant-karaara-001',
  'tax-merchant-mykerala-001',
  'tax-merchant-covelum-001',
])

beforeAll(async () => { await prisma.$queryRaw`SELECT 1` }, 15000)
afterAll(async () => { await prisma.$disconnect() })

// Stage 4 (2026-05-20) — R1 + R4 + R5 + R6 + R7 + R8 are now ACTIVE
// (CI-blocking).  R2 / R3 / R9 stay `it.skip` until Stage 3 closes
// real-merchant media + opening hours + Google-Places coord verification.
describe('seed-guardrail (R1/R4/R5/R6/R7/R8 active; R2/R3/R9 await Stage 3)', () => {
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

  it.skip('R2: every customer-visible merchant has logoUrl AND bannerUrl — un-skip on Stage 3 merge', async () => {
    const merchants = await prisma.merchant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, businessName: true, logoUrl: true, bannerUrl: true },
    })
    const offenders = merchants
      .filter(m => !m.logoUrl || !m.bannerUrl)
      .map(m => m.businessName)
    expect(offenders, `Merchants missing logoUrl or bannerUrl: ${offenders.join(', ')}`).toEqual([])
  })

  it.skip('R3: every active branch has at least one BranchOpeningHours row — un-skip on Stage 3 merge', async () => {
    const branches = await prisma.branch.findMany({
      where: { isActive: true, merchant: { status: 'ACTIVE' } },
      select: { id: true, name: true, openingHours: { select: { id: true } } },
    })
    const offenders = branches.filter(b => b.openingHours.length === 0).map(b => b.name)
    expect(offenders, `Branches with 0 BranchOpeningHours rows: ${offenders.join(', ')}`).toEqual([])
  })

  it('R4: every active branch has redemptionPin set', async () => {
    const branches = await prisma.branch.findMany({
      where: { isActive: true, merchant: { status: 'ACTIVE' } },
      select: { id: true, name: true, redemptionPin: true },
    })
    const offenders = branches.filter(b => !b.redemptionPin).map(b => b.name)
    expect(offenders, `Branches with null redemptionPin: ${offenders.join(', ')}`).toEqual([])
  })

  it('R5: every active branch has address (addressLine1, city, postcode, country)', async () => {
    const branches = await prisma.branch.findMany({
      where: { isActive: true, merchant: { status: 'ACTIVE' } },
      select: { id: true, name: true, addressLine1: true, city: true, postcode: true, country: true },
    })
    const offenders = branches
      .filter(b => !b.addressLine1 || !b.city || !b.postcode || !b.country)
      .map(b => b.name)
    expect(offenders, `Branches missing addressLine1/city/postcode/country: ${offenders.join(', ')}`).toEqual([])
  })

  it('R6: every active branch has phone OR email contact', async () => {
    const branches = await prisma.branch.findMany({
      where: { isActive: true, merchant: { status: 'ACTIVE' } },
      select: { id: true, name: true, phone: true, email: true },
    })
    const offenders = branches.filter(b => !b.phone && !b.email).map(b => b.name)
    expect(offenders, `Branches with phone AND email both null: ${offenders.join(', ')}`).toEqual([])
  })

  it('R7: every customer-visible merchant has primaryCategoryId set', async () => {
    const merchants = await prisma.merchant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, businessName: true, primaryCategoryId: true },
    })
    const offenders = merchants.filter(m => !m.primaryCategoryId).map(m => m.businessName)
    expect(offenders, `Merchants with null primaryCategoryId: ${offenders.join(', ')}`).toEqual([])
  })

  it('R8: no leaked-test-fixture-prefix merchants are ACTIVE', async () => {
    const merchants = await prisma.merchant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, businessName: true },
    })
    const offenders = merchants
      .filter(m => LEAKED_FIXTURE_PREFIXES.some(p => m.businessName.startsWith(p)))
      .map(m => m.businessName)
    expect(offenders, `Leaked-fixture-prefix merchants still ACTIVE: ${offenders.join(', ')}`).toEqual([])
  })

  it.skip('R9: real merchants have MANUALLY_CONFIRMED branches with non-null coords — un-skip on Stage 3 merge', async () => {
    const branches = await prisma.branch.findMany({
      where: { isActive: true, merchant: { id: { in: Array.from(REAL_MERCHANT_IDS) } } },
      select: { id: true, name: true, latitude: true, longitude: true, locationConfidence: true },
    })
    const offenders = branches
      .filter(b => b.locationConfidence !== 'MANUALLY_CONFIRMED' || b.latitude === null || b.longitude === null)
      .map(b => b.name)
    expect(offenders, `Real-merchant branches not MANUALLY_CONFIRMED or with null coords: ${offenders.join(', ')}`).toEqual([])
  })
})
