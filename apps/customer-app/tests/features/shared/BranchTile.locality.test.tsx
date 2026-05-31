/**
 * §DH Tier 1 always-show locality (locked 2026-05-31 after PR #137)
 *
 * Owner ask: surface branch locality on the shared `<BranchTile>` so
 * multi-branch merchants are distinguishable when the same merchant
 * surfaces twice on the same rail.  Canonical case: Covelum
 * Brightlingsea vs Covelum Colchester on the Brightlingsea Featured
 * rail.
 *
 * Wire fallback per the backend `branchTileSchema`:
 *   branchLocalityName > branchPostTown > branchCity
 *
 * Order: descriptor → locality → distance.  Owner-locked rationale
 * (refined post-device-QA 2026-05-31): the category/subcategory
 * descriptor tells users WHAT the place is; the locality
 * DISAMBIGUATES which branch when the merchant has multiple;
 * distance comes last.  Pure presentation change — wire fields were
 * already exposed by Plan 4 M1; this just consumes them.
 *
 * `<BranchTile>` is the shared card across Home Featured / Trending /
 * Popular / NearbyByCategory + Search results + Map carousel (via
 * `MapBranchTile`) + Category results.  Locality now lands on every
 * one of those surfaces.
 */

import React from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BranchTile } from '@/features/shared/BranchTile'
import { makeBranchTile } from '../../fixtures/branchTile'

// `<BranchTile>` mounts `<FavouriteHeart>` which needs a QueryClient.
function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

describe('BranchTile — §DH branch locality in info row', () => {
  it('renders branchLocalityName when set (the primary wire field)', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Brightlingsea',
      branchPostTown:     'Colchester',
      branchCity:         'Essex',
      distance:           1932,
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    // Locality renders after the descriptor in the info row; primary
    // wire field wins over the lower-precedence fallbacks.
    expect(getByText(/Italian Restaurant · Brightlingsea · 1\.2 miles away/)).toBeTruthy()
    // Defensive: the lower-precedence fallbacks must NOT also appear.
    expect(queryByText(/· Colchester ·/)).toBeNull()
    expect(queryByText(/· Essex ·/)).toBeNull()
  })

  it('falls back to branchPostTown when branchLocalityName is null', () => {
    const tile = makeBranchTile({
      branchLocalityName: null,
      branchPostTown:     'Colchester',
      branchCity:         'Essex',
      distance:           2414,
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText(/Italian Restaurant · Colchester · 1\.5 miles away/)).toBeTruthy()
    expect(queryByText(/· Essex ·/)).toBeNull()
  })

  it('falls back to branchCity when branchLocalityName + branchPostTown are both null', () => {
    const tile = makeBranchTile({
      branchLocalityName: null,
      branchPostTown:     null,
      branchCity:         'Manchester',
      distance:           804,
      merchant:           { businessName: 'Iron Forge Gym', descriptor: 'Gym' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText(/Gym · Manchester · 0\.5 miles away/)).toBeTruthy()
  })

  it('all three locality fields null → no locality prefix + NO double-separator junk in the info row', () => {
    const tile = makeBranchTile({
      branchLocalityName: null,
      branchPostTown:     null,
      branchCity:         null,
      distance:           1207,
      merchant:           { businessName: 'No Locality', descriptor: 'Café' },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    // Info row renders descriptor + distance only — no leading " · "
    // separator (the `.filter(Boolean)` upstream drops the empty
    // locality string before the join).
    expect(getByText(/^Café · 0\.7 miles away$/)).toBeTruthy()
    // Defensive: no leading-separator junk and no orphaned
    // "branchLocalityName" string leaking through.
    expect(queryByText(/^ · /)).toBeNull()
    expect(queryByText(/branchLocalityName/)).toBeNull()
  })

  it('order: descriptor → locality → distance (full-string anchor)', () => {
    // Owner-locked rationale (refined 2026-05-31): descriptor LEADS
    // because the category tells users WHAT the place is; locality
    // FOLLOWS as the multi-branch disambiguator; distance comes
    // LAST.  Anchor on the full string so any reordering surfaces
    // here.
    const tile = makeBranchTile({
      branchLocalityName: 'Brightlingsea',
      distance:           1609,
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText('Italian Restaurant · Brightlingsea · 1.0 miles away')).toBeTruthy()
  })

  it('accessibility label includes locality when present (screen-reader disambiguation)', () => {
    const tile = makeBranchTile({
      id:                 'brn-covelum-bse',
      branchLocalityName: 'Brightlingsea',
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByLabelText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    // A11y label mirrors the visual order: businessName, descriptor,
    // locality.  Screen-reader users hear merchant identity first,
    // then category, then disambiguating locality.
    expect(getByLabelText('Covelum, Italian Restaurant, Brightlingsea')).toBeTruthy()
  })

  it('accessibility label omits the locality segment cleanly when all wire fields are null', () => {
    const tile = makeBranchTile({
      id:                 'brn-no-locality',
      branchLocalityName: null,
      branchPostTown:     null,
      branchCity:         null,
      merchant:           { businessName: 'Plainsville', descriptor: 'Café' },
    })
    const { getByLabelText, queryByLabelText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByLabelText('Plainsville, Café')).toBeTruthy()
    // Defensive: no orphaned ", , " from a leading-empty-locality
    // bug if the conditional were collapsed wrongly in future.
    expect(queryByLabelText(/, , /)).toBeNull()
  })

  // §DH-realistic (added 2026-05-31 from owner's PR #139 diagnostic
  // ask) — drive `<BranchTile>` through the EXPORTED
  // `homeFeedResponseSchema` parse path, not just the synthesized
  // `makeBranchTile` fixture.  This proves:
  //   1. The customer-app schema does NOT silently strip the three
  //      locality wire fields if the backend emits them.
  //   2. The parsed branch object reaches `<BranchTile>` with the
  //      locality fields intact.
  //   3. End-to-end render pipeline (realistic JSON wire payload →
  //      Zod parse → React props → DOM text) renders the locality.
  //
  // Backend `branch-tile-contract.test.ts` proves the wire emits the
  // three fields populated from real seeded Covelum-like fixtures
  // (added §DH asserts in the same PR).  This pin closes the
  // customer-app side of the end-to-end story so a future change to
  // the customer-app Zod schema can't silently drop these fields
  // without a test failing.
  it('§DH-realistic — drives <BranchTile> from an actual homeFeedResponseSchema.parse() result (proves JSON → Zod → props → render)', () => {
    const { homeFeedResponseSchema } = require('@/lib/api/discovery') as typeof import('@/lib/api/discovery')

    // Realistic Home feed wire payload — shape mirrors what the live
    // /api/v1/customer/home endpoint emits for the seeded Covelum-
    // Brightlingsea branch.  Only the minimal fields needed for
    // schema validation + this assertion are populated; the rest
    // default to schema-allowed null / 0 / [].
    const wireJson = {
      locationContext: { source: 'coordinates', city: 'Brightlingsea', localityId: null },
      campaigns:       [],
      featuredBranches: [{
        id:                       'tax-branch-covelum-001',
        branchName:               'Brightlingsea',
        branchLocalityId:         'loc-brightlingsea',
        branchLocalityName:       'Brightlingsea',      // §DH primary
        branchPostTown:           'Brightlingsea',      // §DH secondary
        branchCity:               'Brightlingsea',      // §DH tertiary
        branchLatitude:           51.8066,
        branchLongitude:          1.0231,
        branchLocationConfidence: 'MANUALLY_CONFIRMED',
        isOpenNow:                true,
        closesAtLocal:            null,
        distance:                 0,
        distanceMetres:           0,
        isFavourited:             false,
        avgRating:                4.3,
        reviewCount:              7,
        supplyRung:               'NEARBY',
        proximityBand:            'IN_YOUR_AREA',
        matchContext:             null,
        merchant: {
          id:                   'tax-merchant-covelum-001',
          businessName:         'Covelum Restaurant',
          tradingName:          'Covelum',
          logoUrl:              null,
          bannerUrl:            null,
          primaryCategory:      { id: 'cat-food', name: 'Food & Drink', parentId: null, pinColour: null },
          primaryDescriptorTag: null,
          subcategory:          null,
          descriptor:           'Indian Restaurant',
          highlights:           [],
          voucherCount:         6,
          maxEstimatedSaving:   9,
          totalEstimatedSaving: 9,
        },
      }],
      trendingBranches:         [],
      nearbyByCategoryBranches: [],
    }

    // Parse via the EXPORTED customer-app schema — fails loudly if
    // the schema rejects the realistic payload OR strips locality.
    const parsed = homeFeedResponseSchema.parse(wireJson)
    const branch = parsed.featuredBranches[0]!

    // Sanity: the parse round-trip preserved all three locality fields.
    expect(branch.branchLocalityName).toBe('Brightlingsea')
    expect(branch.branchPostTown).toBe('Brightlingsea')
    expect(branch.branchCity).toBe('Brightlingsea')

    // End-to-end render — feed the parsed branch through the same
    // `<BranchTile>` consumed by Home Featured / Trending / Popular /
    // NBC / Category / Map carousel.
    const { getByText, getByLabelText } = render(<BranchTile branch={branch} onPress={() => {}} />)
    expect(getByText(/^Indian Restaurant · Brightlingsea/)).toBeTruthy()
    expect(getByLabelText('Covelum Restaurant, Indian Restaurant, Brightlingsea')).toBeTruthy()
  })

  // Sibling pin for the Colchester case — confirms two-branch
  // disambiguation works end-to-end through the parse pipeline.
  it('§DH-realistic — Covelum Colchester realistic payload renders "Colchester · …" through the same pipeline', () => {
    const { homeFeedResponseSchema } = require('@/lib/api/discovery') as typeof import('@/lib/api/discovery')

    const wireJson = {
      locationContext: { source: 'coordinates', city: 'Brightlingsea', localityId: null },
      campaigns:       [],
      featuredBranches: [],
      trendingBranches: [{
        id:                       'tax-branch-covelum-002',
        branchName:               'Colchester',
        branchLocalityId:         'loc-colchester',
        branchLocalityName:       'Colchester',
        branchPostTown:           'Colchester',
        branchCity:               'Colchester',
        branchLatitude:           51.8859,
        branchLongitude:          0.9035,
        branchLocationConfidence: 'MANUALLY_CONFIRMED',
        isOpenNow:                true,
        closesAtLocal:            null,
        distance:                 12070,
        distanceMetres:           12070,
        isFavourited:             false,
        avgRating:                5,
        reviewCount:              1,
        supplyRung:               'CATCHMENT',
        proximityBand:            'IN_YOUR_AREA',
        matchContext:             null,
        merchant: {
          id:                   'tax-merchant-covelum-001',
          businessName:         'Covelum Restaurant',
          tradingName:          'Covelum',
          logoUrl:              null,
          bannerUrl:            null,
          primaryCategory:      { id: 'cat-food', name: 'Food & Drink', parentId: null, pinColour: null },
          primaryDescriptorTag: null,
          subcategory:          null,
          descriptor:           'Indian Restaurant',
          highlights:           [],
          voucherCount:         6,
          maxEstimatedSaving:   9,
          totalEstimatedSaving: 9,
        },
      }],
      nearbyByCategoryBranches: [],
    }

    const parsed = homeFeedResponseSchema.parse(wireJson)
    const branch = parsed.trendingBranches[0]!

    const { getByText } = render(<BranchTile branch={branch} onPress={() => {}} />)
    // Confirms the canonical owner-flagged "two Covelum cards on the
    // same rail" scenario renders disambiguated locality on EACH card
    // (descriptor → locality → distance order).
    expect(getByText(/^Indian Restaurant · Colchester/)).toBeTruthy()
  })
})
