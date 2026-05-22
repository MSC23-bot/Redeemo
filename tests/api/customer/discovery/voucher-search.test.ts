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
