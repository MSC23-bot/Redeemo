// tests/api/customer/discovery/tag-search.test.ts
//
// Plan 4 M4.3 — curated `Tag.label` + `MerchantHighlight.tag.label`
// exact-match step in `searchBranches`.
//
// Pins the new `tryTagMatch` step (per §M4-AMENDMENT-2026-05-22 A7,
// exact-only case-insensitive — no fuzzy in this PR):
//   - When `q` exactly matches a curated `Tag.label`, the matched Tag
//     drives an additional predicate branch in `where.OR`:
//       { tags:       { some: { tagId: tagMatch.id } } }
//       { highlights: { some: { highlightTagId: tagMatch.id } } }
//   - Merchants tagged with that Tag (via MerchantTag OR
//     MerchantHighlight) surface even if the merchant's name / category
//     / description doesn't carry the query string.
//   - Response `meta.searchChip` carries
//     `{ mode: 'TAG', label: matchedTag.label }`.
//   - Place-match wins over tag-match — `tryPlaceMatch` runs first.
//
// Real-DB integration; same decoration pattern as
// `place-search.test.ts`.

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

describe('Plan 4 M4.3 — Tag detection in searchBranches', () => {
  it('q=Brunch returns Bean & Brew (curated MerchantTag.tag.label match)', async () => {
    // Bean & Brew (Shoreditch) carries the curated Brunch tag via
    // MerchantTag.  Pre-M4.3 this query returned zero — `searchBranches`
    // didn't traverse `Tag.label` (only the free-text
    // `MerchantSuggestedTag.tag`).  M4.3 closes that gap.
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=Brunch&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    const businessNames = (body.branches as { merchant: { businessName: string } }[])
      .map(b => b.merchant.businessName.toLowerCase())
    expect(businessNames.some(n => n.includes('bean & brew'))).toBe(true)

    // searchChip surfaces the matched Tag.label.
    expect(body.branchMeta?.searchChip).toEqual({
      mode:  'TAG',
      label: 'Brunch',
    })
  })

  it('q=Halal returns Karaara (MerchantHighlight curated tag match)', async () => {
    // Karaara (Huddersfield) carries Halal as a MerchantHighlight (the
    // structured taxonomy uses Tag rows for highlights too, via
    // MerchantHighlight.highlightTagId -> Tag.id).  M4.3's predicate
    // branch `{ highlights: { some: { highlightTagId: tagMatch.id } } }`
    // is what surfaces this case.
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=Halal&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    const businessNames = (body.branches as { merchant: { businessName: string } }[])
      .map(b => b.merchant.businessName.toLowerCase())
    expect(businessNames.some(n => n.includes('karaara'))).toBe(true)
    expect(body.branchMeta?.searchChip).toEqual({
      mode:  'TAG',
      label: 'Halal',
    })
  })
})
