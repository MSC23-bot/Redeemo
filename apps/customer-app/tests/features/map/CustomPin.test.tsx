// §BF — stable marker dimensions.
//
// Locked 2026-05-16 after EAS preview QA showed §BC's track-then-freeze
// pattern was necessary but NOT sufficient: on real iOS, the 34→42px
// resize on selection toggle was triggering a native bitmap regeneration
// that left the previously-selected marker in a stuck-invisible state
// until the app was force-quit. The fix is to keep the marker's outer
// layout-bounds CONSTANT across selected/unselected, and express the
// selection visually via a transform scale (a 2D affine compositing
// operation that doesn't change layout bounds). Native marker bitmap
// dimensions stay the same → no regeneration trigger → no stuck-
// invisible pins.
//
// PR-3 Phase B (Discovery Rebaseline Phase 2.2) — `CustomPin` was
// flipped from `merchant: MerchantTile` to `branch: BranchTile` for
// the one-pin-per-branch cardinality migration.  These dimensional
// assertions are unchanged — the §BF layout-bounds contract has no
// shape coupling; flipping the data source does not affect bitmap
// stability.
//
// Map Phase 2 Slice S3 (pin v2, owner-approved Option A, 2026-07-10) —
// UPDATED for the teardrop redesign (was a circle+letter). The §BF
// INVARIANT is unchanged and still asserted here: outer bounds
// constant, inner content scaled via transform. What changed is the
// SHAPE the invariant applies to (SVG teardrop path instead of a
// borderRadius circle View) and the exact constant pixel value (the
// container now also has to fit the pulse-ring halo — see MapPins.tsx's
// "v2" header comment for the worked geometry). The old tests that
// searched for "a View with borderRadius>0 && width===height" (the
// literal circle shape) no longer apply — there is no such View in the
// v2 markup — so those specific assertions are REWRITTEN below to
// check the equivalent v2 properties (the SVG teardrop `Path`'s own
// `fill` prop, found via its `pin-shape-{id}` testID) rather than
// deleted. Every §BF/§BC/§BI invariant these tests protect stays
// covered; MapPins.test.tsx (marker-level §BC/§BI tests) is entirely
// unchanged and still green.

import React from 'react'
import { render } from '@testing-library/react-native'
import { View } from 'react-native'
import Svg from 'react-native-svg'
import { CustomPin } from '@/features/map/components/MapPins'
import { color } from '@/design-system'
import { makeBranchTile } from '../../fixtures/branchTile'

function flatten(style: any): any {
  if (!style) return {}
  if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean).map(flatten))
  return style
}

describe('CustomPin — §BF stable marker dimensions (v2 teardrop)', () => {
  it('outer container has a constant width regardless of selected state', () => {
    const tile = makeBranchTile({ id: 'brn1' })
    const { getByTestId, rerender } = render(<CustomPin branch={tile} selected={false} />)

    const unselectedOuter = flatten(getByTestId('custom-pin-brn1').props.style)
    const unselectedWidth = unselectedOuter.width
    expect(typeof unselectedWidth).toBe('number')
    expect(unselectedWidth).toBeGreaterThan(0)

    rerender(<CustomPin branch={tile} selected={true} />)
    const selectedOuter = flatten(getByTestId('custom-pin-brn1').props.style)
    expect(selectedOuter.width).toBe(unselectedWidth)
  })

  it('outer container has a constant height regardless of selected state', () => {
    const tile = makeBranchTile({ id: 'brn1' })
    const { getByTestId, rerender } = render(<CustomPin branch={tile} selected={false} />)

    const unselectedOuter = flatten(getByTestId('custom-pin-brn1').props.style)
    const unselectedHeight = unselectedOuter.height
    expect(typeof unselectedHeight).toBe('number')
    expect(unselectedHeight).toBeGreaterThan(0)

    rerender(<CustomPin branch={tile} selected={true} />)
    const selectedOuter = flatten(getByTestId('custom-pin-brn1').props.style)
    expect(selectedOuter.height).toBe(unselectedHeight)
  })

  it('selected state applies transform: scale(1) on the inner teardrop', () => {
    const tile = makeBranchTile({ id: 'brn1' })
    const { UNSAFE_getAllByType } = render(<CustomPin branch={tile} selected={true} />)
    const scales = UNSAFE_getAllByType(View)
      .map(v => flatten(v.props.style).transform)
      .filter((t): t is any[] => Array.isArray(t))
      .flatMap(t => t.filter((e: any) => 'scale' in e))
      .map((e: any) => e.scale)

    expect(scales.length).toBeGreaterThan(0)
    expect(scales.every(s => s === 1.0)).toBe(true)
  })

  it('unselected state applies transform: scale < 1 on the inner teardrop (preserves the old 34px-vs-42px feel)', () => {
    const tile = makeBranchTile({ id: 'brn1' })
    const { UNSAFE_getAllByType } = render(<CustomPin branch={tile} selected={false} />)
    const scales = UNSAFE_getAllByType(View)
      .map(v => flatten(v.props.style).transform)
      .filter((t): t is any[] => Array.isArray(t))
      .flatMap(t => t.filter((e: any) => 'scale' in e))
      .map((e: any) => e.scale)

    expect(scales.length).toBeGreaterThan(0)
    expect(scales.every(s => s < 1.0 && s > 0)).toBe(true)
  })

  it('the inner teardrop wrapper has a constant intrinsic width/height across selected state (only its transform changes)', () => {
    // v2 equivalent of the old "inner circle constant size" assertion.
    // The teardrop's wrapping View (and the <Svg> inside it) is always
    // rendered at its SELECTED (intrinsic) size — the visual "smaller
    // when unselected" effect comes entirely from this wrapper's
    // transform:scale, never from resizing the Svg itself.
    const tile = makeBranchTile({ id: 'brn1' })
    const { getByTestId, rerender } = render(<CustomPin branch={tile} selected={false} />)
    const getWrapSize = () => flatten(getByTestId('pin-teardrop-wrap-brn1').props.style)

    const unselectedWrap = getWrapSize()
    expect(unselectedWrap.width).toBeGreaterThan(0)
    expect(unselectedWrap.height).toBeGreaterThan(0)

    rerender(<CustomPin branch={tile} selected={true} />)
    const selectedWrap = getWrapSize()
    expect(selectedWrap.width).toBe(unselectedWrap.width)
    expect(selectedWrap.height).toBe(unselectedWrap.height)
  })
})

// ────────────────────────────────────────────────────────────────────────
// Fold 1 — backend pinColour read (PR-3 Phase B).
//
// Plan §1.5 + §4 delta #5 — `getPinColor()` reads the backend-emitted
// `branch.merchant.primaryCategory.pinColour` first.  Closes a §7.2
// visual-correctness gap where non-Big-Four categories (Pets, Health,
// Auto, Education, etc.) previously fell through to brandRose because
// the hardcoded palette only covered Food & Drink / Beauty & Wellness /
// Fitness & Sport / Shopping. Now any category whose seed has a
// `pinColour` gets that colour. Big-Four categories with null pinColour
// still use the palette fallback for backward-compat.
//
// Map Phase 2 Slice S3 (pin v2, 2026-07-10) — UPDATED lookup: the v1
// circle's `backgroundColor` was on a plain View; v2 fills the SVG
// teardrop `Path` via its `fill` prop instead. Same underlying
// `getPinColor()` resolution being tested — only the DOM/props lookup
// mechanism changed. Tests render CustomPin directly (same pattern as
// the §BF dimensional tests above) — the react-native-maps Marker mock
// in MapPins.test.tsx does NOT forward children, so a marker-level
// render can't inspect the inner Path's fill.
// ────────────────────────────────────────────────────────────────────────

describe('CustomPin — Fold 1 backend pinColour', () => {
  function findTeardropFill(root: ReturnType<typeof render>['UNSAFE_root'], branchId: string): string | undefined {
    return root.findByProps({ testID: `pin-shape-${branchId}` }).props.fill
  }

  it('Fold 1: uses backend pinColour when set on branch.merchant.primaryCategory', () => {
    // A non-Big-Four category with an explicit pinColour. Backend
    // value wins over the hardcoded palette by category name.
    const tile = makeBranchTile({
      id: 'brn-pets',
      merchant: {
        id:           'm-pets',
        businessName: 'Pet Palace',
        primaryCategory: {
          id:        'cat-pets',
          name:      'Pets & Animals',
          pinColour: '#5C6BC0', // Indigo — explicit backend value
          pinIcon:   null,
          parentId:  null,
        },
      },
    })
    const { UNSAFE_root } = render(<CustomPin branch={tile} selected={false} />)
    expect(findTeardropFill(UNSAFE_root, 'brn-pets')).toBe('#5C6BC0')
  })

  it('Fold 1: falls back to hardcoded palette when backend pinColour is null (Big-Four backward-compat)', () => {
    // Big-Four category Food & Drink with pinColour: null (older seed
    // state). The hardcoded palette by category name applies →
    // color.pin.foodDrink takes effect.
    const tile = makeBranchTile({
      id: 'brn-food',
      merchant: {
        id:           'm-food',
        businessName: 'Curry House',
        primaryCategory: {
          id:        'cat-food',
          name:      'Food & Drink',
          pinColour: null,
          pinIcon:   null,
          parentId:  null,
        },
      },
    })
    const { UNSAFE_root } = render(<CustomPin branch={tile} selected={false} />)
    expect(findTeardropFill(UNSAFE_root, 'brn-food')).toBe(color.pin.foodDrink)
  })

  it('Fold 1: defaults to color.pin.default when no category or pinColour is available', () => {
    // No primaryCategory at all → ultimate fallback.
    const tile = makeBranchTile({
      id:       'brn-bare',
      merchant: { id: 'm-bare', businessName: 'No Category Shop', primaryCategory: null },
    })
    const { UNSAFE_root } = render(<CustomPin branch={tile} selected={false} />)
    expect(findTeardropFill(UNSAFE_root, 'brn-bare')).toBe(color.pin.default)
  })
})

// ────────────────────────────────────────────────────────────────────────
// S3 — category pin glyph selection (new v2 contract).
// ────────────────────────────────────────────────────────────────────────

describe('CustomPin — S3 category pin glyph', () => {
  it('renders a glyph icon inside the pin regardless of category state (always resolves, never renders nothing)', () => {
    const tile = makeBranchTile({
      id: 'brn-glyph',
      merchant: { id: 'm-glyph', businessName: 'Glyph Co', primaryCategory: null },
    })
    const { UNSAFE_getAllByType } = render(<CustomPin branch={tile} selected={false} />)
    // Three react-native-svg <Svg> roots render unconditionally: the
    // static pulse ring (two concentric circles), the teardrop shape,
    // and the category glyph (a lucide icon, itself an SVG).
    expect(UNSAFE_getAllByType(Svg)).toHaveLength(3)
  })
})

// ────────────────────────────────────────────────────────────────────────
// S3 — static pulse ring (selected-only, opacity-toggled; see MapPins.tsx
// "Pulse ring safety note" for why this is static rather than animated).
// ────────────────────────────────────────────────────────────────────────

describe('CustomPin — S3 static pulse ring', () => {
  it('the ring is invisible (opacity 0) when unselected', () => {
    const tile = makeBranchTile({ id: 'brn-ring' })
    const { UNSAFE_getAllByType } = render(<CustomPin branch={tile} selected={false} />)
    const opacities = UNSAFE_getAllByType(View)
      .map(v => flatten(v.props.style))
      .map(s => s.opacity)
      .filter((o) => typeof o === 'number')
    expect(opacities).toContain(0)
  })

  it('the ring is visible (opacity 1) when selected', () => {
    const tile = makeBranchTile({ id: 'brn-ring' })
    const { UNSAFE_getAllByType } = render(<CustomPin branch={tile} selected={true} />)
    const opacities = UNSAFE_getAllByType(View)
      .map(v => flatten(v.props.style))
      .map(s => s.opacity)
      .filter((o) => typeof o === 'number')
    expect(opacities).toContain(1)
  })

  it('toggling selected does NOT change the ring element size (opacity-only toggle, no bounds change)', () => {
    const tile = makeBranchTile({ id: 'brn-ring' })
    const { rerender, UNSAFE_getAllByType } = render(<CustomPin branch={tile} selected={false} />)
    const ringSize = () =>
      UNSAFE_getAllByType(View)
        .map(v => flatten(v.props.style))
        .find(s => typeof s.opacity === 'number')

    const unselectedRing = ringSize()
    rerender(<CustomPin branch={tile} selected={true} />)
    const selectedRing = ringSize()

    expect(unselectedRing?.width).toBe(selectedRing?.width)
    expect(unselectedRing?.height).toBe(selectedRing?.height)
  })
})

// ────────────────────────────────────────────────────────────────────────
// Map Phase 2 S5b Task 4a — voucher-count badge.
//
// §BF constant-outer-bounds rule: the badge is anchored at the
// CONTAINER's own top-right corner (`right: 0, top: 0`), which is
// ALREADY inside the container's declared bounds (the teardrop's own
// right edge sits 9px short of the container's right edge — see
// MapPins.tsx's VOUCHER_BADGE_SIZE comment). These tests assert the
// badge's content/visibility rules; the "outer bounds never change"
// contract is already covered by the §BF describe block above (adding
// the badge does not touch `custom-pin-{id}`'s own width/height).
// ────────────────────────────────────────────────────────────────────────

describe('CustomPin — S5b voucher-count badge', () => {
  it('renders the exact voucherCount for single-digit counts', () => {
    const tile = makeBranchTile({ id: 'brn-v2', merchant: { id: 'm1', businessName: 'Two Vouchers', voucherCount: 2 } })
    const { getByTestId, getByText } = render(<CustomPin branch={tile} selected={false} />)
    expect(getByTestId('pin-voucher-badge-brn-v2')).toBeTruthy()
    expect(getByText('2')).toBeTruthy()
  })

  it('caps double-digit counts at "9+"', () => {
    const tile = makeBranchTile({ id: 'brn-v12', merchant: { id: 'm1', businessName: 'Many Vouchers', voucherCount: 12 } })
    const { getByText } = render(<CustomPin branch={tile} selected={false} />)
    expect(getByText('9+')).toBeTruthy()
  })

  it('renders exactly "9" (not "9+") at the cap boundary', () => {
    const tile = makeBranchTile({ id: 'brn-v9', merchant: { id: 'm1', businessName: 'Nine Vouchers', voucherCount: 9 } })
    const { getByText, queryByText } = render(<CustomPin branch={tile} selected={false} />)
    expect(getByText('9')).toBeTruthy()
    expect(queryByText('9+')).toBeNull()
  })

  it('renders "10" as "9+"', () => {
    const tile = makeBranchTile({ id: 'brn-v10', merchant: { id: 'm1', businessName: 'Ten Vouchers', voucherCount: 10 } })
    const { getByText } = render(<CustomPin branch={tile} selected={false} />)
    expect(getByText('9+')).toBeTruthy()
  })

  it('omits the badge entirely when voucherCount is 0 (default fixture — no confusing "0" badge)', () => {
    const tile = makeBranchTile({ id: 'brn-v0' })
    const { queryByTestId } = render(<CustomPin branch={tile} selected={false} />)
    expect(queryByTestId('pin-voucher-badge-brn-v0')).toBeNull()
  })

  it('does NOT grow the outer marker container bounds (§BF invariant preserved)', () => {
    const withBadge = makeBranchTile({ id: 'brn-badge', merchant: { id: 'm1', businessName: 'X', voucherCount: 5 } })
    const withoutBadge = makeBranchTile({ id: 'brn-nobadge', merchant: { id: 'm1', businessName: 'X', voucherCount: 0 } })
    const a = render(<CustomPin branch={withBadge} selected={false} />)
    const b = render(<CustomPin branch={withoutBadge} selected={false} />)
    const styleOf = (el: any) => (Array.isArray(el.props.style) ? Object.assign({}, ...el.props.style.filter(Boolean)) : el.props.style)
    const withBadgeSize = styleOf(a.getByTestId('custom-pin-brn-badge'))
    const withoutBadgeSize = styleOf(b.getByTestId('custom-pin-brn-nobadge'))
    expect(withBadgeSize.width).toBe(withoutBadgeSize.width)
    expect(withBadgeSize.height).toBe(withoutBadgeSize.height)
  })
})

// ────────────────────────────────────────────────────────────────────────
// Map P2 W1 (F2) — voucher badge hugs the teardrop head.
//
// Walkthrough finding F2: the badge was anchored at the container's bare
// top-right corner (`right: 0, top: 0`) while the RESTING teardrop is
// scaled down and pulled toward the wrapper centre — leaving a big gap so
// the number read as detached. These pin that the badge is now positioned
// (via `left`/`top`, not `right`) on the head's top-right shoulder and
// stays ENTIRELY inside the constant 60x63 bounds (so it never re-enters
// the chip zone above the pin and never grows the marker box).
// ────────────────────────────────────────────────────────────────────────
describe('CustomPin — F2 badge hugs the head', () => {
  const CONTAINER_WIDTH = 60
  const CONTAINER_HEIGHT = 63
  const BADGE = 16
  const styleOf = (el: any) =>
    Array.isArray(el.props.style) ? Object.assign({}, ...el.props.style.filter(Boolean)) : el.props.style

  it('is positioned by left/top (not the bare right/top corner) and sits inside the marker bounds', () => {
    const tile = makeBranchTile({ id: 'brn-f2', merchant: { id: 'm1', businessName: 'X', voucherCount: 3 } })
    const { getByTestId } = render(<CustomPin branch={tile} selected={false} />)
    const s = styleOf(getByTestId('pin-voucher-badge-brn-f2'))
    expect(s.right).toBeUndefined()
    expect(typeof s.left).toBe('number')
    expect(typeof s.top).toBe('number')
    // Entirely inside the constant 60x63 bounds — no overflow, no growth.
    expect(s.left).toBeGreaterThanOrEqual(0)
    expect(s.top).toBeGreaterThanOrEqual(0)
    expect(s.left + BADGE).toBeLessThanOrEqual(CONTAINER_WIDTH)
    expect(s.top + BADGE).toBeLessThanOrEqual(CONTAINER_HEIGHT)
  })

  it('hugs the head top-right shoulder (right of centre, above the head centre) rather than the far container corner', () => {
    const tile = makeBranchTile({ id: 'brn-f2b', merchant: { id: 'm1', businessName: 'X', voucherCount: 3 } })
    const { getByTestId } = render(<CustomPin branch={tile} selected={false} />)
    const s = styleOf(getByTestId('pin-voucher-badge-brn-f2b'))
    const centerX = s.left + BADGE / 2
    const centerY = s.top + BADGE / 2
    // Head centre is at container x=30; the shoulder is to its RIGHT.
    expect(centerX).toBeGreaterThan(30)
    // ...and the badge sits pulled DOWN from the container's very top edge
    // toward the (scaled) head, not floating at y≈8 in the old corner.
    expect(centerY).toBeGreaterThan(BADGE / 2)
  })
})

// ────────────────────────────────────────────────────────────────────────
// Map P2 W1 (F7) — tree-resolved pin colour reaches the teardrop.
//
// The tree walk itself is unit-tested in categoryPinGlyph.test.ts; here we
// pin the plumbing: <MapPins> resolves the top-level colour and passes it
// as the `pinColor` prop, which must win over the tree-free
// `getPinColor(branch)` fallback so a subcategory-primary branch (backend
// `pinColour: null`) renders its category colour instead of default red.
// ────────────────────────────────────────────────────────────────────────
describe('CustomPin — F7 pinColor prop', () => {
  function findTeardropFill(root: ReturnType<typeof render>['UNSAFE_root'], branchId: string): string | undefined {
    return root.findByProps({ testID: `pin-shape-${branchId}` }).props.fill
  }

  it('uses the provided pinColor prop (tree-resolved) even when the branch pinColour is null', () => {
    const tile = makeBranchTile({
      id: 'brn-sub',
      merchant: {
        id: 'm-sub',
        businessName: 'Karaara',
        // Subcategory primary with NO own colour (the exact F7 shape).
        primaryCategory: { id: 'cat-cafe', name: 'Cafe & Coffee', pinColour: null, pinIcon: null, parentId: 'cat-food' },
      },
    })
    const { UNSAFE_root } = render(<CustomPin branch={tile} selected={false} pinColor="#E65100" />)
    expect(findTeardropFill(UNSAFE_root, 'brn-sub')).toBe('#E65100')
  })

  it('falls back to the tree-free getPinColor(branch) when no pinColor prop is given (default red for an unmatched subcategory)', () => {
    const tile = makeBranchTile({
      id: 'brn-sub2',
      merchant: {
        id: 'm-sub2',
        businessName: 'Karaara',
        primaryCategory: { id: 'cat-cafe', name: 'Cafe & Coffee', pinColour: null, pinIcon: null, parentId: 'cat-food' },
      },
    })
    const { UNSAFE_root } = render(<CustomPin branch={tile} selected={false} />)
    // Without the tree (direct render, no prop) the leaf name "Cafe &
    // Coffee" matches no top-level keyword → default. This is exactly why
    // the tree resolution in <MapPins> is needed on the real surface.
    expect(findTeardropFill(UNSAFE_root, 'brn-sub2')).toBe(color.pin.default)
  })
})
