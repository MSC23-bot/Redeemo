// tests/api/customer/discovery/seed-data-exclusion.test.ts
//
// SEC-C3 (Gate-PR-4b) — FUNCTIONAL exclusion proof (real DB).
//
// Creates two parallel merchant→branch→voucher fixtures at the same
// Huddersfield coordinate: one REAL (isTestData=false) and one TEST
// (isTestData=true). Then asserts every customer-facing discovery surface
// returns the real supply and never the test supply.
//
// The test merchant also gets a (real, isTestData=false) VoucherRedemption at
// its TEST branch — this is the precise construction the Trending/Popular raw
// SQL guards with `AND b."isTestData" = false`: a redemption exists, but its
// branch is test data, so the merchant must not surface in /home.
//
// Mirrors the real-DB fixture+sweep pattern of voucher-search.test.ts. Cleanup
// uses the shared prefix sweep (merchant/branch/voucher/redemption) plus an
// explicit User delete (the sweep only maps the P1Test- user class).

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../../src/api/app'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { sweepFixturesByPrefixes } from '../../_shared/fixtureSweep'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const PREFIX = 'sec-c3-'
const USER_PREFIX = 'sec-c3-user-'
const TOKEN = 'zqxwvtest' // rare token so q=TOKEN matches only these fixtures
const TOKEN2 = 'mixedtoken' // for the real-merchant-with-test-voucher cases
const HUD = { lat: 53.6463, lng: -1.7809 }

const ID = {
  realMerchant: `${PREFIX}m-real`,
  realBranch: `${PREFIX}b-real`,
  realVoucher: `${PREFIX}v-real`,
  testMerchant: `${PREFIX}m-test`,
  testBranch: `${PREFIX}b-test`,
  testVoucher: `${PREFIX}v-test`,
  // A REAL merchant carrying BOTH a real voucher and a test voucher (Codex
  // mixed-case findings): the test voucher must not appear on merchant detail,
  // and its high saving must not pull the merchant into a minSaving search.
  mixedMerchant: `${PREFIX}m-mixed`,
  mixedBranch: `${PREFIX}b-mixed`,
  mixedRealVoucher: `${PREFIX}v-mixed-real`,
  mixedTestVoucher: `${PREFIX}v-mixed-test`,
}

function branchData(suffix: string, isTestData: boolean) {
  return {
    id: `${PREFIX}b-${suffix}`,
    name: 'SEC-C3 Branch',
    addressLine1: '1 Test St',
    city: 'Huddersfield',
    postcode: 'HD1 1AA',
    country: 'United Kingdom',
    isActive: true,
    isTestData,
    locationConfidence: 'MANUALLY_CONFIRMED' as const,
    latitude: HUD.lat,
    longitude: HUD.lng,
    ladDistrict: 'Kirklees',
    adminCounty: 'West Yorkshire',
    region: 'Yorkshire and the Humber',
    locationCountry: 'England',
  }
}

function voucherData(suffix: 'real' | 'test', isTestData: boolean) {
  return {
    id: `${PREFIX}v-${suffix}`,
    code: `${PREFIX}V-${suffix}`,
    title: `${TOKEN} offer ${suffix}`,
    type: 'FREEBIE' as const,
    estimatedSaving: 5,
    status: 'ACTIVE' as const,
    approvalStatus: 'APPROVED' as const,
    isTestData,
  }
}

let app: FastifyInstance

async function cleanup() {
  await sweepFixturesByPrefixes(prisma, [PREFIX])
  await prisma.user.deleteMany({ where: { email: { startsWith: USER_PREFIX } } })
}

beforeAll(async () => {
  app = await buildApp()
  app.decorate('prisma', prisma as any)
  await app.ready()
  await cleanup()

  const cat = await prisma.category.findFirst({ where: { parentId: null }, select: { id: true } })
  const primaryCategoryId = cat?.id

  await prisma.merchant.create({
    data: {
      id: ID.realMerchant,
      businessName: `${PREFIX}${TOKEN} Real Co`,
      status: 'ACTIVE',
      isTestData: false,
      ...(primaryCategoryId ? { primaryCategoryId } : {}),
      branches: { create: [branchData('real', false)] },
      vouchers: { create: [voucherData('real', false)] },
    },
  })

  await prisma.merchant.create({
    data: {
      id: ID.testMerchant,
      businessName: `${PREFIX}${TOKEN} Test Co`,
      status: 'ACTIVE',
      isTestData: true,
      ...(primaryCategoryId ? { primaryCategoryId } : {}),
      branches: { create: [branchData('test', true)] },
      vouchers: { create: [voucherData('test', true)] },
    },
  })

  // REAL merchant with a MIXED voucher set: one real voucher (saving 5) + one
  // test voucher (saving 99). Proves (1) merchant detail hides the test voucher,
  // and (2) the test voucher's high saving does NOT pull the merchant into a
  // minSaving=50 search (only the real saving-5 voucher counts).
  await prisma.merchant.create({
    data: {
      id: ID.mixedMerchant,
      businessName: `${PREFIX}${TOKEN2} Mixed Co`,
      status: 'ACTIVE',
      isTestData: false,
      ...(primaryCategoryId ? { primaryCategoryId } : {}),
      branches: { create: [branchData('mixed', false)] },
      vouchers: {
        create: [
          {
            id: ID.mixedRealVoucher,
            code: `${PREFIX}V-mixed-real`,
            title: `${TOKEN2} real voucher`,
            type: 'FREEBIE',
            estimatedSaving: 5,
            status: 'ACTIVE',
            approvalStatus: 'APPROVED',
            isTestData: false,
          },
          {
            id: ID.mixedTestVoucher,
            code: `${PREFIX}V-mixed-test`,
            title: `${TOKEN2} TEST voucher`,
            type: 'FREEBIE',
            estimatedSaving: 99,
            status: 'ACTIVE',
            approvalStatus: 'APPROVED',
            isTestData: true,
          },
        ],
      },
    },
  })

  // Non-QA real user + a (real) redemption at the TEST branch — exercises the
  // Trending/Popular raw SQL: redemption exists, branch is test → must not surface.
  const user = await prisma.user.create({
    data: { email: `${USER_PREFIX}${Date.now()}@example.test`, passwordHash: 'x', status: 'ACTIVE' },
  })
  await prisma.voucherRedemption.create({
    data: {
      userId: user.id,
      voucherId: ID.testVoucher,
      branchId: ID.testBranch,
      redemptionCode: `SECC3${Date.now().toString(36).toUpperCase().slice(-6)}`,
      redeemedAt: new Date(),
      estimatedSaving: 5,
      isValidated: true,
      isTestData: false,
    },
  })
}, 60_000)

afterAll(async () => {
  await cleanup()
  if (app) await app.close()
  await prisma.$disconnect()
})

describe('SEC-C3 — seed/test supply excluded from customer-facing discovery API', () => {
  it('search returns the real merchant and excludes the test merchant', { timeout: 30_000 }, async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/search?q=${TOKEN}&lat=${HUD.lat}&lng=${HUD.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const merchantIds = (body.branches ?? []).map((b: any) => b.merchant?.id)
    expect(merchantIds).toContain(ID.realMerchant)
    expect(merchantIds).not.toContain(ID.testMerchant)
  })

  it('in-area (map bbox) returns the real branch and excludes the test branch', { timeout: 30_000 }, async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/discovery/in-area?minLat=53.6&maxLat=53.7&minLng=-1.85&maxLng=-1.75&lat=${HUD.lat}&lng=${HUD.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const branchIds = (body.branches ?? []).map((b: any) => b.id)
    expect(branchIds).toContain(ID.realBranch)
    expect(branchIds).not.toContain(ID.testBranch)
  })

  it('merchant detail: real → 200, test → not found/unavailable', { timeout: 30_000 }, async () => {
    const real = await app.inject({ method: 'GET', url: `/api/v1/customer/merchants/${ID.realMerchant}` })
    expect(real.statusCode).toBe(200)
    expect(JSON.parse(real.body).id ?? JSON.parse(real.body).merchant?.id).toBe(ID.realMerchant)

    const test = await app.inject({ method: 'GET', url: `/api/v1/customer/merchants/${ID.testMerchant}` })
    expect(test.statusCode).not.toBe(200)
  })

  it('merchant branch list: test merchant is unavailable', { timeout: 30_000 }, async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/customer/merchants/${ID.testMerchant}/branches` })
    expect(res.statusCode).not.toBe(200)
  })

  it('voucher detail: real → 200, test → not found', { timeout: 30_000 }, async () => {
    const real = await app.inject({ method: 'GET', url: `/api/v1/customer/vouchers/${ID.realVoucher}` })
    expect(real.statusCode).toBe(200)

    const test = await app.inject({ method: 'GET', url: `/api/v1/customer/vouchers/${ID.testVoucher}` })
    expect(test.statusCode).not.toBe(200)
  })

  it('home feed (incl. Trending/Popular raw SQL via the test-branch redemption) never surfaces test ids', { timeout: 30_000 }, async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/customer/home?lat=${HUD.lat}&lng=${HUD.lng}` })
    expect(res.statusCode).toBe(200)
    // The unique fixture ids must appear nowhere in the entire home payload —
    // covers Featured / Trending / Popular / NearbyByCategory rails + legacy fields.
    expect(res.body).not.toContain(ID.testMerchant)
    expect(res.body).not.toContain(ID.testBranch)
  })

  it('Codex Finding 1 — merchant detail of a REAL merchant returns its real voucher but NOT its test voucher', { timeout: 30_000 }, async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/customer/merchants/${ID.mixedMerchant}` })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain(ID.mixedRealVoucher)       // real voucher surfaces
    expect(res.body).not.toContain(ID.mixedTestVoucher)   // test voucher must NOT
  })

  it('Codex Finding 2 — a REAL merchant is not pulled into a minSaving search by its TEST voucher', { timeout: 30_000 }, async () => {
    // Findable by name with no saving filter (it is a real merchant).
    const found = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/search?q=${TOKEN2}&lat=${HUD.lat}&lng=${HUD.lng}`,
    })
    expect(found.statusCode).toBe(200)
    const foundIds = (JSON.parse(found.body).branches ?? []).map((b: any) => b.merchant?.id)
    expect(foundIds).toContain(ID.mixedMerchant)

    // minSaving=50: the only voucher >= 50 is the TEST one (saving 99, excluded);
    // the real voucher is saving 5. The merchant must NOT match the saving filter.
    const filtered = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/search?q=${TOKEN2}&minSaving=50&lat=${HUD.lat}&lng=${HUD.lng}`,
    })
    expect(filtered.statusCode).toBe(200)
    const filteredIds = (JSON.parse(filtered.body).branches ?? []).map((b: any) => b.merchant?.id)
    expect(filteredIds).not.toContain(ID.mixedMerchant)
  })
})
