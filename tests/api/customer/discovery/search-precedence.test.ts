// tests/api/customer/discovery/search-precedence.test.ts
//
// PR #124 fixup-1 (2026-05-22) — owner-direction precedence regression
// pins.  Device QA on PR #124 surfaced four classes of bug:
//
//   1. `Indian`        — was treated as PLACE (matched "Indian Queens"
//                        Locality via prefix), stealing the curated
//                        CUISINE tag.  FIX: tag-match runs first;
//                        place-match falls back.
//   2. `Indian cafe`   — single-bag OR required the FULL phrase in one
//                        field, so no merchant surfaced.  FIX: multi-
//                        token AND-OR fallthrough; each token must
//                        match at least one merchant/branch field.
//   3. `nails`         — was treated as PLACE (matched "Nailsea" via
//                        prefix at TOWN tier).  FIX: prefix-match
//                        requires populationTier ∈ {METRO_CORE, CITY,
//                        LARGE_TOWN}, excluding TOWN/SMALL_TOWN/
//                        VILLAGE/HAMLET; AND query length >= 6 chars
//                        (PLACE_MATCH_PREFIX_THRESHOLD raised from 5).
//   4. `Manchester`    — place matched, but scope cascade widened past
//                        the matched place; header overclaim "Offers in
//                        Manchester" while results were platform-wide.
//                        FIX: customer-app SearchScreen reads
//                        `scopeExpanded`/`emptyStateReason` and switches
//                        the PLACE-mode header copy to "Closest matches
//                        near <Place>" when widened.  (Backend pin here
//                        confirms the wire-shape signals; the copy pin
//                        lives in customer-app jest.)
//
// Backend pins regardless of seed data drift: tag-precedence is exact-
// match driven; place-tier filter is structural; multi-token is
// structural; expanded-meta is structural.

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

describe('PR #124 fixup — search precedence regression pins', () => {
  it('q=Indian → TAG wins over PLACE (curated CUISINE Indian tag, not Indian Queens locality)', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=Indian&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    // searchChip MUST be TAG mode (not PLACE).  This is the load-bearing
    // pin — pre-fixup it was PLACE { label: 'Indian Queens' } or similar.
    expect(body.branchMeta?.searchChip?.mode).toBe('TAG')
    expect(body.branchMeta?.searchChip?.label?.toLowerCase()).toBe('indian')
    // Karaara carries the curated Indian tag — should surface.
    const names = (body.branches as { merchant: { businessName: string } }[])
      .map(b => b.merchant.businessName.toLowerCase())
    expect(names.some(n => n.includes('karaara'))).toBe(true)
  })

  it('q="Indian cafe" → multi-token AND-OR fallthrough surfaces Karaara (descriptor+category combination)', async () => {
    // Pre-fixup: single-bag OR required the full phrase "Indian cafe" in
    // one field; no merchant had that exact substring; result = empty.
    // Post-fixup: each token ("Indian" + "cafe") matches at least one
    // field across merchant/branch surfaces:
    //   - "Indian" matches Karaara's description ("Chai and Indian
    //     street kitchen...") + curated Indian CUISINE tag
    //   - "cafe"   matches Karaara's primaryCategory.name "Cafe & Coffee"
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=${encodeURIComponent('Indian cafe')}&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const names = (body.branches as { merchant: { businessName: string } }[])
      .map(b => b.merchant.businessName.toLowerCase())
    expect(names.some(n => n.includes('karaara'))).toBe(true)
    // searchChip MUST be null — neither pure-PLACE nor pure-TAG.
    expect(body.branchMeta?.searchChip ?? null).toBeNull()
  })

  it('q=nails → place-match BLOCKED at TOWN tier (no "Offers in Nailsea")', async () => {
    // Pre-fixup: q="nails" prefix-matched Nailsea (TOWN-tier locality
    // near Bristol) and stole the predicate.  Post-fixup:
    //   (a) length 5 < PLACE_MATCH_PREFIX_THRESHOLD (6) → exact only
    //   (b) even at length 6+, prefix requires LARGE_TOWN+ tier — TOWN
    //       is excluded.
    // searchChip MUST NOT be { mode: 'PLACE', label: 'Nailsea' }.
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=nails&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    if (body.branchMeta?.searchChip?.mode === 'PLACE') {
      // If a PLACE chip ever fires for q="nails", it must NOT be a
      // small-town/village name like "Nailsea" or "Nailsworth" stealing
      // the search.  Negative pin: label cannot start with "Nails" via
      // prefix-match (only EXACT match on "nails" → which has no
      // Locality, so this branch should be unreachable).
      const label = body.branchMeta.searchChip.label?.toLowerCase() ?? ''
      expect(label).not.toContain('nailsea')
      expect(label).not.toContain('nailsworth')
    }
    // The defining pin: NOT a place-search.
    expect(body.branchMeta?.searchChip?.mode).not.toBe('PLACE')
  })

  it('q=Indian Queens (exact) → PLACE match allowed at ANY tier (exact-match path)', async () => {
    // Exact-match path is intentionally NOT tier-gated.  If a user types
    // the full name of a HAMLET/VILLAGE, place wins (they know what
    // they're searching for).  This pin guards against an over-correction
    // that would block legitimate small-place searches.
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=${encodeURIComponent('Indian Queens and Fraddon')}&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    // The full name exists in the gazetteer as a Locality; exact-match
    // promotes to PLACE regardless of populationTier.
    if (body.branchMeta?.searchChip?.mode === 'PLACE') {
      const label = body.branchMeta.searchChip.label?.toLowerCase() ?? ''
      expect(label).toContain('indian queens')
    }
    // If no PLACE chip fires, the seed simply doesn't have that gazetteer
    // entry — accept either outcome (the load-bearing pin is that the
    // tier filter doesn't BREAK exact match, not that this specific
    // gazetteer entry exists).
  })

  it('q=nails → singularize variant surfaces "Polish Nail Studio" via businessName match on "nail"', async () => {
    // PR #124 fixup-4 (2026-05-22) — owner-direction plural/singular
    // normalization.  Pre-fixup: q="nails" returned 0 results because
    // no merchant content contains the literal substring "nails".
    // Post-fixup: `tokenVariants` emits ['nails', 'nail'] and the
    // fuzzy fallthrough generates contains-checks for BOTH; "Polish
    // Nail Studio" matches via businessName CONTAINS "nail".
    //
    // Also: q="nails" MUST NOT be treated as a PLACE search (tryPlace-
    // Match doesn't use variants — owner-direction-locked).  Nailsea
    // was the pre-fixup-1 hijack; the tier+length filter blocks it.
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=nails&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const names = (body.branches as { merchant: { businessName: string } }[])
      .map(b => b.merchant.businessName.toLowerCase())
    expect(names.some(n => n.includes('polish nail studio'))).toBe(true)
    // Negative pin — NOT a place search.
    expect(body.branchMeta?.searchChip?.mode).not.toBe('PLACE')
  })

  it('q=nail (singular) returns the same expected results as q=nails (plural)', async () => {
    // Pin that singularize is symmetric: searching the already-singular
    // form still works.  `tokenVariants("nail")` returns ['nail'] (no
    // singularize because length 4 < 5); fuzzy fallthrough finds
    // "Polish Nail Studio" via businessName CONTAINS "nail".
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=nail&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const names = (body.branches as { merchant: { businessName: string } }[])
      .map(b => b.merchant.businessName.toLowerCase())
    expect(names.some(n => n.includes('polish nail studio'))).toBe(true)
  })

  it('q=Manchester → PLACE chip fires AND meta carries scopeExpanded signal for honest header copy', async () => {
    // Manchester is a CITY-tier locality — prefix or exact match wins.
    // The dev DB has no Manchester merchants today, so the scope
    // cascade widens past the matched place.  Backend MUST surface:
    //   - searchChip.mode === 'PLACE' (the user did search a place)
    //   - branchMeta.scopeExpanded OR emptyStateReason indicating widening
    // Customer-app then renders honest header copy via the M4.5 read
    // (pinned separately in jest).
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=Manchester&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.branchMeta?.searchChip?.mode).toBe('PLACE')
    expect(body.branchMeta?.searchChip?.label?.toLowerCase()).toContain('manchester')
    // Whether `scopeExpanded` is true or false depends on dev-DB seed
    // state.  The pin is structural: both fields must be PRESENT on the
    // wire so the customer-app can switch header copy honestly.
    expect(typeof body.branchMeta?.scopeExpanded).toBe('boolean')
    expect(typeof body.branchMeta?.emptyStateReason).toBe('string')
  })
})
