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
