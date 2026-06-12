// tests/api/customer/discovery/trending-searches.test.ts
//
// Plan 4 M4.4 — Trending searches return non-empty against seed.
//
// Pins each of the 6 customer-app trending tags (see
// `apps/customer-app/src/features/search/components/TrendingSearches.tsx`)
// against the live `/api/v1/customer/search` endpoint to assert the seed
// DB carries at least one branch matching the query.
//
// Sequencing per §M4-AMENDMENT-2026-05-22 A5: this test file ran as a
// pre-flight against current `main` BEFORE any predicate changes from
// M4.2 / M4.3 land.
//
// Pre-flight result (2026-05-22, against main at 73b3149):
//   - Pizza / Nail salon / Barber / Gym / Coffee → ALL PASS
//     (surface via current direct-match paths: businessName / category /
//      MerchantSuggestedTag / branch.localityName / branch.postTown)
//   - Brunch                                     → CURRENTLY FAILS
//     (M4.3-DEPENDENT — see Owner-direction below).
//
// Owner-direction (2026-05-22 Option A locked):
//   The Brunch failure is exactly the predicate gap M4.3 is built to close.
//   `searchBranches.where.OR` on current main does NOT traverse curated
//   `Tag.label` (it only matches `MerchantSuggestedTag.tag` — the
//   free-text user-submitted field, NOT the structured taxonomy).
//   Once M4.3 lands `tryTagMatch` + the `{ tags: { some: { tagId } } }`
//   predicate branch, q=Brunch surfaces Bean & Brew (the curated
//   Brunch-tagged Shoreditch fixture) at platform-scope cascade.  The
//   Huddersfield user gets the existing `expanded_to_wider` banner
//   ("Closest matches for 'Brunch' near Huddersfield") which is the
//   expected UX — no seed enrichment required.
//
//   §SE Stage 3 remains the natural home for any future Huddersfield-area
//   Brunch fixture enrichment.  Not in M4 scope.
//
//   After M4.3 ships, this file is re-run to confirm 6/6 pass.  If
//   Brunch still fails, pause + surface the new diagnosis.
//
// Geography: Huddersfield GPS — the M1 trending fixtures are concentrated
// in Huddersfield (Karaara + extended seed merchants per §SE Stage 2).
// Real-DB integration pattern, mirrors `routes-additive-shape.test.ts`.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../../src/api/app'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

// Trending tags exactly mirror `TRENDING_TAGS` in the customer-app component.
//
// Brunch was `it.skip`-gated through M4.2 because the curated-tag predicate
// (M4.3) hadn't shipped yet — the Brunch fixture (Bean & Brew Shoreditch)
// is reachable only via `Tag.label`.  M4.3 unblocked it; all 6 now run.
const TRENDING = ['Pizza', 'Brunch', 'Nail salon', 'Barber', 'Gym', 'Coffee'] as const

// Huddersfield centre (Karaara's neighbourhood — used by §SE Stage 2 seed
// merchants).  Avoids the Brightlingsea/Colchester cluster on the south
// coast (used by other discovery tests) so trending behaviour is tested
// against the populated Huddersfield supply pool.
const GPS = { lat: 53.6458, lng: -1.785 }

let app: FastifyInstance

beforeAll(async () => {
  // `buildApp()` in test mode skips the prisma + redis plugins (see
  // src/api/app.ts:33). Mirror the routes-additive-shape pattern and
  // decorate manually with a real Prisma client + a redis stub.
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

describe('Plan 4 M4.4 — trending searches return non-empty', () => {
  for (const term of TRENDING) {
    it(`q=${term} returns at least one branch against seed (Huddersfield GPS)`, async () => {
      const res = await app.inject({
        method: 'GET',
        url:    `/api/v1/customer/search?q=${encodeURIComponent(term)}&lat=${GPS.lat}&lng=${GPS.lng}&limit=30`,
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      // Customer-app reads `branches[]` (branch-first contract).  Pin against
      // that shape — if backend regresses to merchants-only, this test surfaces it.
      expect(Array.isArray(body.branches)).toBe(true)
      expect(body.branches.length).toBeGreaterThan(0)
    })
  }
})
