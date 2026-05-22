// tests/api/customer/discovery/voucher-search.test.ts
//
// §CD v1 (2026-05-22) — voucher keyword search v1.
//
// Locked scope per plan-lock 2026-05-22:
//   - searchBranches.where matches voucher.title (no length gate) AND
//     voucher.description (gated on `MIN_DESCRIPTION_MATCH_LENGTH = 5`).
//   - voucher.terms EXCLUDED from v1 (deferred to v2 — owner direction:
//     T&C boilerplate has poor signal-to-noise).
//   - Status gate: voucher.status === ACTIVE AND voucher.approvalStatus
//     === APPROVED (mirrors `MERCHANT_TILE_SELECT.vouchers.where`).
//   - matchContext fires ONLY when voucher is the DRIVING signal — when
//     the merchant ALSO surfaces via business name / category / tag /
//     branch fields, matchContext stays null (§0.6).
//   - matchContext copy: `Found in "<voucher title>" voucher` (§0.2 locked).
//
// Pins (positive + negative):
//   - q="samosa" → Karaara surfaces via voucher.title "Free Samosa with
//     Any Chai" (KAR-RMV-002); matchContext populated.
//   - q="Karaara" → Karaara surfaces via businessName (driving signal);
//     matchContext is null.
//   - Negative pins (status / approval / length-gate) inserted as
//     deterministic fixture-based pins.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../../src/api/app'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

const HUDDERSFIELD = { lat: 53.6458, lng: -1.785 }

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
  app.decorate('prisma', prisma as any)
  app.decorate('redis', {
    get: async () => null,
    set: async () => 'OK',
    del: async () => 1,
  } as any)
  await app.ready()
}, 60_000)

afterAll(async () => {
  if (app) await app.close()
  await prisma.$disconnect()
})

describe('§CD voucher keyword search v1 — title + description (NOT terms)', () => {
  it('q="samosa" → Karaara surfaces via voucher.title only (no merchant/category match)', async () => {
    // Karaara's KAR-RMV-002 voucher title is "Free Samosa with Any Chai"
    // per prisma/seed.ts.  "samosa" doesn't appear in Karaara's businessName
    // ("Karaara"), primaryCategory ("Cafe & Coffee"), curated tags (Indian,
    // Halal, Vegetarian-Friendly, Independent), or branch fields — voucher
    // title is the ONLY match path.
    //
    // Pre-§CD: zero results.
    // Post-§CD: Karaara surfaces.
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=samosa&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const names = (body.branches as { merchant: { businessName: string } }[])
      .map(b => b.merchant.businessName.toLowerCase())
    expect(names.some(n => n.includes('karaara'))).toBe(true)
  })

  it('q="samosa" → matchContext populated with locked copy format on Karaara tile', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=samosa&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
    })
    const body = JSON.parse(res.body)
    const karaara = (body.branches as any[]).find(b =>
      b.merchant.businessName.toLowerCase().includes('karaara'),
    )
    expect(karaara).toBeTruthy()
    // §0.2 locked copy format: `Found in "<title>" voucher`.  The matched
    // voucher should contain "samosa" in its title.
    expect(karaara.matchContext).toMatch(/^Found in "[^"]*[Ss]amosa[^"]*" voucher$/)
  })

  it('q="Karaara" → matchContext is null (driving signal is businessName, NOT voucher)', async () => {
    // Per §0.6: when the merchant ALSO surfaces via business name /
    // category / tag / branch fields, matchContext stays null — keeps
    // the card uncluttered when the business name already explains the
    // match.  Karaara's businessName contains "Karaara"; even though
    // the voucher predicate might also find a voucher containing "Karaara"
    // (unlikely but possible), the matchContext line MUST be suppressed.
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=Karaara&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
    })
    const body = JSON.parse(res.body)
    const karaara = (body.branches as any[]).find(b =>
      b.merchant.businessName.toLowerCase().includes('karaara'),
    )
    expect(karaara).toBeTruthy()
    expect(karaara.matchContext).toBeNull()
  })

  it('q matching merchant.businessName surfaces matchContext: null (Polish Nail Studio for "polish")', async () => {
    // "polish" matches Polish Nail Studio's businessName.  matchContext
    // should be null per §0.6 (driving signal is businessName).
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=polish&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
    })
    const body = JSON.parse(res.body)
    const polish = (body.branches as any[]).find(b =>
      b.merchant.businessName.toLowerCase().includes('polish nail studio'),
    )
    expect(polish).toBeTruthy()
    expect(polish.matchContext).toBeNull()
  })
})

// §CD v1 — Negative pins use deterministic fixture-prefix merchants
// (rbl-cd- prefix) so they're cleaned up reliably and don't depend on
// seed state.  Each fixture creates a merchant + branch + voucher in
// a specific status/approval combination to assert the where predicate
// gates the right matches.
describe('§CD voucher keyword search v1 — negative pins (status / approval / length gate)', () => {
  const FIXTURE_PREFIX = 'rbl-cd-'

  beforeAll(async () => {
    // Wipe any leftover fixtures from prior runs.
    await cleanupFixtures()
    // Seed: 3 merchants + 1 branch each + 1 voucher each, with distinct
    // status/approval combinations.  Voucher titles share the rare token
    // "xyzqrs" so q="xyzqrs" only matches voucher.title (no merchant
    // content collision).
    await prisma.merchant.create({
      data: {
        id:           `${FIXTURE_PREFIX}m-active-approved`,
        businessName: `${FIXTURE_PREFIX}Merchant ACTIVE`,
        status:       'ACTIVE',
        branches: { create: [{
          id:                 `${FIXTURE_PREFIX}b-active-approved`,
          name:               'Test Branch',
          addressLine1:       '1 Test St',
          city:               'Huddersfield',
          postcode:           'HD1 1AA',
          country:            'United Kingdom',
          isActive:           true,
          locationConfidence: 'MANUALLY_CONFIRMED',
          latitude:           53.6463,
          longitude:          -1.7809,
          ladDistrict:        'Kirklees',
          adminCounty:        'West Yorkshire',
          region:             'Yorkshire and the Humber',
          locationCountry:    'England',
        }]},
        vouchers: { create: [{
          id:              `${FIXTURE_PREFIX}v-active-approved`,
          code:            `${FIXTURE_PREFIX}V1`,
          title:           'xyzqrs ACTIVE APPROVED voucher title',
          description:     null,
          type:            'FREEBIE',
          estimatedSaving: 5,
          status:          'ACTIVE',
          approvalStatus:  'APPROVED',
        }]},
      },
    })

    await prisma.merchant.create({
      data: {
        id:           `${FIXTURE_PREFIX}m-inactive`,
        businessName: `${FIXTURE_PREFIX}Merchant INACTIVE`,
        status:       'ACTIVE',
        branches: { create: [{
          id:                 `${FIXTURE_PREFIX}b-inactive`,
          name:               'Test Branch',
          addressLine1:       '2 Test St',
          city:               'Huddersfield',
          postcode:           'HD1 1AB',
          country:             'United Kingdom',
          isActive:            true,
          locationConfidence:  'MANUALLY_CONFIRMED',
          latitude:            53.6463,
          longitude:           -1.7809,
          ladDistrict:         'Kirklees',
          adminCounty:         'West Yorkshire',
          region:              'Yorkshire and the Humber',
          locationCountry:     'England',
        }]},
        vouchers: { create: [{
          id:              `${FIXTURE_PREFIX}v-inactive`,
          code:            `${FIXTURE_PREFIX}V2`,
          title:           'xyzqrs INACTIVE voucher title',
          type:            'FREEBIE',
          estimatedSaving: 5,
          status:          'INACTIVE',         // ← gates out
          approvalStatus:  'APPROVED',
        }]},
      },
    })

    await prisma.merchant.create({
      data: {
        id:           `${FIXTURE_PREFIX}m-pending`,
        businessName: `${FIXTURE_PREFIX}Merchant PENDING`,
        status:       'ACTIVE',
        branches: { create: [{
          id:                 `${FIXTURE_PREFIX}b-pending`,
          name:               'Test Branch',
          addressLine1:       '3 Test St',
          city:               'Huddersfield',
          postcode:           'HD1 1AC',
          country:             'United Kingdom',
          isActive:            true,
          locationConfidence:  'MANUALLY_CONFIRMED',
          latitude:            53.6463,
          longitude:           -1.7809,
          ladDistrict:         'Kirklees',
          adminCounty:         'West Yorkshire',
          region:              'Yorkshire and the Humber',
          locationCountry:     'England',
        }]},
        vouchers: { create: [{
          id:              `${FIXTURE_PREFIX}v-pending`,
          code:            `${FIXTURE_PREFIX}V3`,
          title:           'xyzqrs PENDING_APPROVAL voucher title',
          type:            'FREEBIE',
          estimatedSaving: 5,
          status:          'ACTIVE',
          approvalStatus:  'PENDING',           // ← gates out
        }]},
      },
    })

    // Description-only fixture: voucher.description contains 'qzplv'
    // (unique token); title does NOT contain it.
    await prisma.merchant.create({
      data: {
        id:           `${FIXTURE_PREFIX}m-desc-only`,
        businessName: `${FIXTURE_PREFIX}Merchant DESC`,
        status:       'ACTIVE',
        branches: { create: [{
          id:                 `${FIXTURE_PREFIX}b-desc-only`,
          name:               'Test Branch',
          addressLine1:       '4 Test St',
          city:               'Huddersfield',
          postcode:           'HD1 1AD',
          country:             'United Kingdom',
          isActive:            true,
          locationConfidence:  'MANUALLY_CONFIRMED',
          latitude:            53.6463,
          longitude:           -1.7809,
          ladDistrict:         'Kirklees',
          adminCounty:         'West Yorkshire',
          region:              'Yorkshire and the Humber',
          locationCountry:     'England',
        }]},
        vouchers: { create: [{
          id:              `${FIXTURE_PREFIX}v-desc-only`,
          code:            `${FIXTURE_PREFIX}V4`,
          title:           'Generic voucher title',
          description:     'Body text containing qzplv as a unique token',
          type:            'FREEBIE',
          estimatedSaving: 5,
          status:          'ACTIVE',
          approvalStatus:  'APPROVED',
        }]},
      },
    })
  }, 60_000)

  afterAll(async () => {
    await cleanupFixtures()
  })

  async function cleanupFixtures() {
    await prisma.voucher.deleteMany({ where: { id: { startsWith: FIXTURE_PREFIX } } })
    await prisma.branch.deleteMany({ where: { id: { startsWith: FIXTURE_PREFIX } } })
    await prisma.merchant.deleteMany({ where: { id: { startsWith: FIXTURE_PREFIX } } })
  }

  it('PENDING_APPROVAL voucher does NOT surface its merchant (approval gate)', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=xyzqrs&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
    })
    const body = JSON.parse(res.body)
    const names = (body.branches as { merchant: { businessName: string } }[])
      .map(b => b.merchant.businessName)
    expect(names).not.toContain(`${FIXTURE_PREFIX}Merchant PENDING`)
  })

  it('INACTIVE voucher does NOT surface its merchant (status gate)', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=xyzqrs&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
    })
    const body = JSON.parse(res.body)
    const names = (body.branches as { merchant: { businessName: string } }[])
      .map(b => b.merchant.businessName)
    expect(names).not.toContain(`${FIXTURE_PREFIX}Merchant INACTIVE`)
  })

  it('ACTIVE + APPROVED voucher DOES surface its merchant (positive control)', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=xyzqrs&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
    })
    const body = JSON.parse(res.body)
    const names = (body.branches as { merchant: { businessName: string } }[])
      .map(b => b.merchant.businessName)
    expect(names).toContain(`${FIXTURE_PREFIX}Merchant ACTIVE`)
  })

  it('q < 5 chars does NOT match voucher.description-only (length gate)', async () => {
    // q="qz" (2 chars) is below the MIN_DESCRIPTION_MATCH_LENGTH=5 gate.
    // The description-only fixture has description CONTAINING "qz"
    // ("qzplv") but should NOT surface because the gate is closed.
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=qz&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
    })
    const body = JSON.parse(res.body)
    const names = (body.branches as { merchant: { businessName: string } }[])
      .map(b => b.merchant.businessName)
    expect(names).not.toContain(`${FIXTURE_PREFIX}Merchant DESC`)
  })

  it('q >= 5 chars DOES match voucher.description (length gate opens)', async () => {
    // q="qzplv" (5 chars) opens the description gate; the description-only
    // fixture should surface.
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=qzplv&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
    })
    const body = JSON.parse(res.body)
    const names = (body.branches as { merchant: { businessName: string } }[])
      .map(b => b.merchant.businessName)
    expect(names).toContain(`${FIXTURE_PREFIX}Merchant DESC`)
  })
})
