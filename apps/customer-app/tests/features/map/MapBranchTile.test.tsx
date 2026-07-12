// Phase 2.5 — MapBranchTile carousel consumes BranchTile[] and
// each card is branch-keyed.  Two branches of the same merchant
// render as two distinct cards (Covelum bug closure on the carousel
// surface).  Tap fires `onBranchPress(branch.id)` — the shared
// `<BranchTile>` consumer reads branch.id directly and propagates
// branch identity naturally (no adapter required).

import React from 'react'
import { ScrollView } from 'react-native'
import { render as rtlRender, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  MapBranchTile,
  shouldClaimDismissGesture,
  shouldDismissOnRelease,
  PAGE_INSET,
  CARD_GAP,
  CARD_PEEK,
  CARD_WIDTH,
  SNAP_INTERVAL,
  CAROUSEL_SCREEN_WIDTH,
} from '@/features/map/components/MapBranchTile'
import { makeBranchTile } from '../../fixtures/branchTile'

function flattenStyle(style: any): any {
  if (!style) return {}
  if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean).map(flattenStyle))
  return style
}

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

  // Map Phase 2 W2b (F11) — the carousel card is redesigned
  // (<BranchCarouselCard>): its body reads name + "category · locality ·
  // distance" + a single value line. The proximity-band clause ("In your
  // area") is intentionally NOT part of the redesigned card, so the old
  // proximity-chip pin is REPLACED (not silently dropped) by this
  // meta-line assertion.
  it('renders the redesigned card body: name + "category · locality · distance", no proximity clause', () => {
    const tile = makeBranchTile({
      id:                 'brn-near',
      branchName:         'Soho',
      branchLocalityName: 'Soho',
      branchLatitude:     51.5,
      branchLongitude:    -0.1,
      distance:           500,
      proximityBand:      'IN_YOUR_AREA',
      merchant: {
        id:              'm-near',
        businessName:    'In Your Area Cafe',
        primaryCategory: { id: 'c1', name: 'Food & Drink', pinColour: null, pinIcon: null, parentId: null },
      },
    })
    const { getByText, queryByText } = render(
      <MapBranchTile
        branches={[tile]}
        activeIndex={0}
        onClose={jest.fn()}
        onIndexChange={jest.fn()}
        onBranchPress={jest.fn()}
      />,
    )
    expect(getByText('In Your Area Cafe')).toBeTruthy()
    // Meta line reflects the branch's category + locality (single node).
    expect(getByText(/Food & Drink · Soho/)).toBeTruthy()
    // The proximity-band clause is not part of the redesigned card.
    expect(queryByText('In your area')).toBeNull()
  })

  // ──────────────────────────────────────────────────────────────────────
  // Map P2 W1 (F5) — carousel snap geometry.
  //
  // Walkthrough finding F5: the active card rendered left-clipped with the
  // next card crammed at a tiny gap. These pins the corrected peek-
  // carousel geometry: a single snap mechanism (snapToInterval, no
  // pagingEnabled), an even inset, a consistent gap, and a modest peek
  // that all sum to the screen width so the active card is always fully
  // visible.
  // ──────────────────────────────────────────────────────────────────────
  describe('F5: peek-carousel snap geometry', () => {
    it('the inset + card + gap + peek exactly tile the screen width (active card fully visible, next card peeks)', () => {
      expect(PAGE_INSET + CARD_WIDTH + CARD_GAP + CARD_PEEK).toBe(CAROUSEL_SCREEN_WIDTH)
      expect(CARD_WIDTH).toBeGreaterThan(0)
      expect(CARD_PEEK).toBeGreaterThan(0)
      expect(CARD_GAP).toBeGreaterThan(0)
    })

    it('snapToInterval is one card advance (card width + gap), in lockstep with the index math', () => {
      expect(SNAP_INTERVAL).toBe(CARD_WIDTH + CARD_GAP)
    })

    it('the ScrollView uses a single snap mechanism: snapToInterval + start alignment, NOT pagingEnabled', () => {
      const { UNSAFE_getByType } = render(
        <MapBranchTile
          branches={[mockBranchA, mockBranchB]}
          activeIndex={0}
          onClose={jest.fn()}
          onIndexChange={jest.fn()}
          onBranchPress={jest.fn()}
        />,
      )
      const sv = UNSAFE_getByType(ScrollView)
      expect(sv.props.snapToInterval).toBe(SNAP_INTERVAL)
      expect(sv.props.snapToAlignment).toBe('start')
      expect(sv.props.decelerationRate).toBe('fast')
      // pagingEnabled was the conflicting second snap mechanism — gone.
      expect(sv.props.pagingEnabled).toBeFalsy()
      // The active card is inset via content padding, not container padding,
      // so the ScrollView spans full width and the next card can peek.
      expect(flattenStyle(sv.props.contentContainerStyle).paddingHorizontal).toBe(PAGE_INSET)
    })

    it('each card is CARD_WIDTH wide with a consistent trailing gap', () => {
      const { UNSAFE_getByType } = render(
        <MapBranchTile
          branches={[mockBranchA, mockBranchB]}
          activeIndex={0}
          onClose={jest.fn()}
          onIndexChange={jest.fn()}
          onBranchPress={jest.fn()}
        />,
      )
      const sv = UNSAFE_getByType(ScrollView)
      const cardWrappers = React.Children.toArray(sv.props.children)
      expect(cardWrappers).toHaveLength(2)
      for (const wrapper of cardWrappers as any[]) {
        const s = flattenStyle(wrapper.props.style)
        expect(s.width).toBe(CARD_WIDTH)
        expect(s.marginRight).toBe(CARD_GAP)
      }
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // Swipe-down-to-dismiss (Map Phase 2 S2 Task 4, spec §7.6).
  //
  // `PanResponder`'s `panHandlers` recompute gesture state internally
  // from raw native touch events — there's no way to inject a synthetic
  // gestureState through the rendered element's props for a unit test.
  // The actual claim/dismiss DECISIONS are exported as plain pure
  // functions from `MapBranchTile.tsx` (`shouldClaimDismissGesture` /
  // `shouldDismissOnRelease`) specifically so they're testable in
  // isolation; a lightweight render-level test below confirms the
  // gesture is actually wired onto the container.
  // ──────────────────────────────────────────────────────────────────────

  describe('swipe-down-to-dismiss — gesture decision functions', () => {
    it('shouldClaimDismissGesture: does NOT claim a mostly-horizontal drag (card-swipe shape)', () => {
      expect(shouldClaimDismissGesture({ dy: 5, dx: 40 })).toBe(false)
    })

    it('shouldClaimDismissGesture: does NOT claim small jitter below the threshold', () => {
      expect(shouldClaimDismissGesture({ dy: 3, dx: 0 })).toBe(false)
    })

    it('shouldClaimDismissGesture: claims a clearly downward-dominant drag', () => {
      expect(shouldClaimDismissGesture({ dy: 30, dx: 2 })).toBe(true)
    })

    it('shouldClaimDismissGesture: does NOT claim a diagonal drag that is not steep enough', () => {
      // dy > 8 passes, but dy is not > 1.5x |dx| (30 vs 1.5*25=37.5).
      expect(shouldClaimDismissGesture({ dy: 30, dx: 25 })).toBe(false)
    })

    it('shouldDismissOnRelease: dismisses past the distance threshold', () => {
      expect(shouldDismissOnRelease({ dy: 120, vy: 0 })).toBe(true)
    })

    it('shouldDismissOnRelease: dismisses on a fast flick even under the distance threshold', () => {
      expect(shouldDismissOnRelease({ dy: 20, vy: 1.2 })).toBe(true)
    })

    it('shouldDismissOnRelease: does NOT dismiss below BOTH thresholds', () => {
      expect(shouldDismissOnRelease({ dy: 30, vy: 0.1 })).toBe(false)
    })
  })

  describe('swipe-down-to-dismiss — gesture wiring', () => {
    it('the outer container carries the PanResponder gesture handlers', () => {
      const { getByTestId } = render(
        <MapBranchTile
          branches={[mockBranchA]}
          activeIndex={0}
          onClose={jest.fn()}
          onIndexChange={jest.fn()}
          onBranchPress={jest.fn()}
        />,
      )
      const container = getByTestId('map-branch-tile-container')
      expect(typeof container.props.onMoveShouldSetResponder).toBe('function')
      expect(typeof container.props.onResponderRelease).toBe('function')
    })

    it('the X close button still calls onClose directly (unchanged)', () => {
      const onClose = jest.fn()
      const { getByLabelText } = render(
        <MapBranchTile
          branches={[mockBranchA]}
          activeIndex={0}
          onClose={onClose}
          onIndexChange={jest.fn()}
          onBranchPress={jest.fn()}
        />,
      )
      fireEvent.press(getByLabelText('Close merchant tile'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })
})
