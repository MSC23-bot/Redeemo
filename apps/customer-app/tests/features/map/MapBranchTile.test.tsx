// Phase 2.5 — MapBranchTile carousel consumes BranchTile[] and
// each card is branch-keyed.  Two branches of the same merchant
// render as two distinct cards (Covelum bug closure on the carousel
// surface).  Tap fires `onBranchPress(branch.id)` — the shared
// `<BranchTile>` consumer reads branch.id directly and propagates
// branch identity naturally (no adapter required).

import React from 'react'
import { render as rtlRender, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MapBranchTile } from '@/features/map/components/MapBranchTile'
import { makeBranchTile } from '../../fixtures/branchTile'

// Phase 3C.1g M2.7/M2.8 — MapBranchTile composes the shared `<BranchTile>`
// which renders `<FavouriteHeart>`; the heart calls `useFavourite()` →
// `useQueryClient()`.  Wrap render here so existing test bodies stay
// untouched.
function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

const mockBranchA = makeBranchTile({
  id:              'brn-bella-soho',
  branchName:      'Soho',
  branchLatitude:  51.5141,
  branchLongitude: -0.1310,
  distance:        500,
  avgRating:       4.2,
  reviewCount:     30,
  isFavourited:    false,
  merchant: {
    id:                 'm-bella-italia',
    businessName:       'Bella Italia',
    primaryCategory:    { id: 'c1', name: 'Food & Drink', pinColour: null, pinIcon: null, parentId: null },
    voucherCount:       2,
    maxEstimatedSaving: 20,
  },
})

const mockBranchB = makeBranchTile({
  id:              'brn-nails-westend',
  branchName:      'West End',
  branchLatitude:  51.5145,
  branchLongitude: -0.1300,
  distance:        1200,
  isFavourited:    true,
  merchant: {
    id:                 'm-nails-beauty',
    businessName:       'Nails & Beauty',
    primaryCategory:    { id: 'c2', name: 'Beauty & Wellness', pinColour: null, pinIcon: null, parentId: null },
    voucherCount:       1,
    maxEstimatedSaving: 10,
  },
})

describe('MapBranchTile', () => {
  it('renders merchant name (sourced from branch.merchant.businessName)', () => {
    const onClose = jest.fn()
    const onBranchPress = jest.fn()
    const onIndexChange = jest.fn()
    const { getByText } = render(
      <MapBranchTile
        branches={[mockBranchA]}
        activeIndex={0}
        onClose={onClose}
        onIndexChange={onIndexChange}
        onBranchPress={onBranchPress}
      />,
    )
    expect(getByText('Bella Italia')).toBeTruthy()
  })

  it('calls onClose when X is pressed', () => {
    const onClose = jest.fn()
    const onBranchPress = jest.fn()
    const onIndexChange = jest.fn()
    const { getByLabelText } = render(
      <MapBranchTile
        branches={[mockBranchA]}
        activeIndex={0}
        onClose={onClose}
        onIndexChange={onIndexChange}
        onBranchPress={onBranchPress}
      />,
    )
    const closeBtn = getByLabelText('Close merchant tile')
    fireEvent.press(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders multiple branches with dot indicators', () => {
    const onClose = jest.fn()
    const onBranchPress = jest.fn()
    const onIndexChange = jest.fn()
    const { getByText } = render(
      <MapBranchTile
        branches={[mockBranchA, mockBranchB]}
        activeIndex={0}
        onClose={onClose}
        onIndexChange={onIndexChange}
        onBranchPress={onBranchPress}
      />,
    )
    expect(getByText('Bella Italia')).toBeTruthy()
  })

  // ──────────────────────────────────────────────────────────────────────
  // One-card-per-branch cardinality (Covelum bug closure, §M / Phase C).
  //
  // Two branches of the same merchant (Covelum Brightlingsea +
  // Colchester both under `m-covelum`) must render as TWO distinct
  // carousel cards. Pre-Phase-C the carousel collapsed to merchant
  // identity → only one Covelum card showed. Phase C: each branch
  // gets its own card.
  // ──────────────────────────────────────────────────────────────────────

  it('§M: two branches of the same merchant render two distinct carousel cards', () => {
    const brightlingsea = makeBranchTile({
      id:              'brn-covelum-bri',
      branchName:      'Brightlingsea',
      branchLatitude:  51.8054,
      branchLongitude: 1.0244,
      distance:        163_000,
      merchant: {
        id:                 'm-covelum',
        businessName:       'Covelum Restaurant',
        primaryCategory:    { id: 'c1', name: 'Food & Drink', pinColour: null, pinIcon: null, parentId: null },
        voucherCount:       2,
        maxEstimatedSaving: 20,
      },
    })
    const colchester = makeBranchTile({
      id:              'brn-covelum-col',
      branchName:      'Colchester',
      branchLatitude:  51.8959,
      branchLongitude: 0.8919,
      distance:        158_000,
      merchant: {
        id:                 'm-covelum',
        businessName:       'Covelum Restaurant',
        primaryCategory:    { id: 'c1', name: 'Food & Drink', pinColour: null, pinIcon: null, parentId: null },
        voucherCount:       2,
        maxEstimatedSaving: 20,
      },
    })
    const { UNSAFE_getAllByType } = render(
      <MapBranchTile
        branches={[brightlingsea, colchester]}
        activeIndex={0}
        onClose={jest.fn()}
        onIndexChange={jest.fn()}
        onBranchPress={jest.fn()}
      />,
    )
    // The shared <BranchTile> is the unit of render per card.
    // Two branches of the same merchant must render two
    // distinct <BranchTile> instances at distinct positions.
    const { BranchTile: BranchTileComponent } = require('@/features/shared/BranchTile')
    const branchTiles = UNSAFE_getAllByType(BranchTileComponent)
    expect(branchTiles).toHaveLength(2)
  })

  it('§M: tap fires onBranchPress with the tapped CARD\'s branch.id (not the merchant.id)', () => {
    const brightlingsea = makeBranchTile({
      id:              'brn-covelum-bri',
      branchLatitude:  51.8054,
      branchLongitude: 1.0244,
      merchant:        { id: 'm-covelum', businessName: 'Covelum' },
    })
    const colchester = makeBranchTile({
      id:              'brn-covelum-col',
      branchLatitude:  51.8959,
      branchLongitude: 0.8919,
      merchant:        { id: 'm-covelum', businessName: 'Covelum' },
    })
    const onBranchPress = jest.fn()
    const { UNSAFE_getAllByType } = render(
      <MapBranchTile
        branches={[brightlingsea, colchester]}
        activeIndex={0}
        onClose={jest.fn()}
        onIndexChange={jest.fn()}
        onBranchPress={onBranchPress}
      />,
    )
    // Locate both PressableScale roots (one per card) and tap the second.
    const { PressableScale } = require('@/design-system/motion/PressableScale')
    const pressables = UNSAFE_getAllByType(PressableScale)
    expect(pressables.length).toBeGreaterThanOrEqual(2)
    // Each PressableScale's onPress is wired directly with the BranchTile's
    // branch.id — the callback fires with the BRANCH id (load-bearing
    // identity for the `?branch=` URL contract).
    pressables[1]!.props.onPress()
    expect(onBranchPress).toHaveBeenCalledWith('brn-covelum-col')
    expect(onBranchPress).not.toHaveBeenCalledWith('m-covelum')
  })

  // Plan 4 M3b — proves the inner shared BranchTile receives the
  // proximityBand prop unaltered through the Map carousel wrapper.
  // BranchTile's own chip-matrix test covers all band variants;
  // this is the integration pin specifically for the Map render path.
  it('surfaces the proximity chip on the selected map card (branch-level proximityBand)', () => {
    const tile = makeBranchTile({
      id:             'brn-near',
      branchName:     'In Your Area',
      branchLatitude: 51.5,
      branchLongitude: -0.1,
      proximityBand:  'IN_YOUR_AREA',
      merchant: {
        id:           'm-near',
        businessName: 'In Your Area Cafe',
      },
    })
    const { getByText, getAllByText } = render(
      <MapBranchTile
        branches={[tile]}
        activeIndex={0}
        onClose={jest.fn()}
        onIndexChange={jest.fn()}
        onBranchPress={jest.fn()}
      />,
    )
    expect(getByText('In Your Area Cafe')).toBeTruthy()
    // Batch 1B: 'In your area' inline clause inside info-line Text node.
    // Case-sensitive exact match still distinguishes from 'In Your Area Cafe'
    // (merchant name). Defence-in-depth: assert single render so a future
    // regression that double-renders both chip + inline would fail loudly.
    expect(getAllByText('In your area')).toHaveLength(1)
  })
})
