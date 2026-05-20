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

import React from 'react'
import { render } from '@testing-library/react-native'
import { View } from 'react-native'
import { CustomPin } from '@/features/map/components/MapPins'
import { color } from '@/design-system'
import { makeBranchTile } from '../../fixtures/branchTile'

function flatten(style: any): any {
  if (!style) return {}
  if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean).map(flatten))
  return style
}

describe('CustomPin — §BF stable marker dimensions', () => {
  it('outer container has constant width = 42 regardless of selected state', () => {
    const tile = makeBranchTile({ id: 'brn1' })
    const { getByTestId, rerender } = render(<CustomPin branch={tile} selected={false} />)

    const unselectedOuter = flatten(getByTestId('custom-pin-brn1').props.style)
    expect(unselectedOuter.width).toBe(42)

    rerender(<CustomPin branch={tile} selected={true} />)
    const selectedOuter = flatten(getByTestId('custom-pin-brn1').props.style)
    expect(selectedOuter.width).toBe(42)
  })

  it('outer container has constant height regardless of selected state', () => {
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

  it('selected state applies transform: scale(1) on inner circle', () => {
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

  it('unselected state applies transform: scale < 1 on inner circle (preserves the old 34px-vs-42px feel)', () => {
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

  it('inner circle has constant width and height across selected state (only transform changes)', () => {
    const tile = makeBranchTile({ id: 'brn1' })
    const { UNSAFE_getAllByType, rerender } = render(<CustomPin branch={tile} selected={false} />)
    const getCircleSize = () => {
      const circles = UNSAFE_getAllByType(View)
        .map(v => flatten(v.props.style))
        .filter(s => typeof s.borderRadius === 'number' && s.borderRadius > 0 && s.width === s.height)
      return circles[0]
    }

    const unselectedCircle = getCircleSize()
    expect(unselectedCircle).toBeDefined()
    expect(unselectedCircle.width).toBe(42)
    expect(unselectedCircle.height).toBe(42)

    rerender(<CustomPin branch={tile} selected={true} />)
    const selectedCircle = getCircleSize()
    expect(selectedCircle.width).toBe(42)
    expect(selectedCircle.height).toBe(42)
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
// Tests render CustomPin directly (same pattern as the §BF dimensional
// tests above) — the react-native-maps Marker mock in MapPins.test.tsx
// does NOT forward children, so a marker-level render can't inspect
// the inner-circle backgroundColor.
// ────────────────────────────────────────────────────────────────────────

describe('CustomPin — Fold 1 backend pinColour', () => {
  function findCircleBackgroundColor(views: any[]): string | undefined {
    return views
      .map(v => flatten(v.props.style))
      .filter(s => typeof s.borderRadius === 'number' && s.borderRadius > 0 && s.width === s.height)
      .map(s => s.backgroundColor as string | undefined)
      .find(c => typeof c === 'string')
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
    const { UNSAFE_getAllByType } = render(<CustomPin branch={tile} selected={false} />)
    expect(findCircleBackgroundColor(UNSAFE_getAllByType(View))).toBe('#5C6BC0')
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
    const { UNSAFE_getAllByType } = render(<CustomPin branch={tile} selected={false} />)
    expect(findCircleBackgroundColor(UNSAFE_getAllByType(View))).toBe(color.pin.foodDrink)
  })

  it('Fold 1: defaults to color.pin.default when no category or pinColour is available', () => {
    // No primaryCategory at all → ultimate fallback.
    const tile = makeBranchTile({
      id:       'brn-bare',
      merchant: { id: 'm-bare', businessName: 'No Category Shop', primaryCategory: null },
    })
    const { UNSAFE_getAllByType } = render(<CustomPin branch={tile} selected={false} />)
    expect(findCircleBackgroundColor(UNSAFE_getAllByType(View))).toBe(color.pin.default)
  })
})
