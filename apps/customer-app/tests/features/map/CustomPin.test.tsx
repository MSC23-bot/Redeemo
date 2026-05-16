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
// These tests render `CustomPin` directly (the export is intentional
// — see comment on the CustomPin export in MapPins.tsx). Rendering
// the whole MapPins tree through the mocked Marker would either need
// the mock to forward children (which slows other suites under jest's
// parallel workers because every marker's §BC `setTimeout` is now
// scheduled) or require fake-timer plumbing here. Direct CustomPin
// render avoids both.

import React from 'react'
import { render } from '@testing-library/react-native'
import { View } from 'react-native'
import { CustomPin } from '@/features/map/components/MapPins'
import { makeMerchantTile } from '../../fixtures/merchantTile'

function flatten(style: any): any {
  if (!style) return {}
  if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean).map(flatten))
  return style
}

describe('CustomPin — §BF stable marker dimensions', () => {
  it('outer container has constant width = 42 regardless of selected state', () => {
    const tile = makeMerchantTile({ id: 'm1' })
    const { getByTestId, rerender } = render(<CustomPin merchant={tile} selected={false} />)

    const unselectedOuter = flatten(getByTestId('custom-pin-m1').props.style)
    expect(unselectedOuter.width).toBe(42)

    rerender(<CustomPin merchant={tile} selected={true} />)
    const selectedOuter = flatten(getByTestId('custom-pin-m1').props.style)
    expect(selectedOuter.width).toBe(42)
  })

  it('outer container has constant height regardless of selected state', () => {
    const tile = makeMerchantTile({ id: 'm1' })
    const { getByTestId, rerender } = render(<CustomPin merchant={tile} selected={false} />)

    const unselectedOuter = flatten(getByTestId('custom-pin-m1').props.style)
    const unselectedHeight = unselectedOuter.height
    expect(typeof unselectedHeight).toBe('number')
    expect(unselectedHeight).toBeGreaterThan(0)

    rerender(<CustomPin merchant={tile} selected={true} />)
    const selectedOuter = flatten(getByTestId('custom-pin-m1').props.style)
    expect(selectedOuter.height).toBe(unselectedHeight)
  })

  it('selected state applies transform: scale(1) on inner circle', () => {
    const tile = makeMerchantTile({ id: 'm1' })
    const { UNSAFE_getAllByType } = render(<CustomPin merchant={tile} selected={true} />)
    const scales = UNSAFE_getAllByType(View)
      .map(v => flatten(v.props.style).transform)
      .filter((t): t is any[] => Array.isArray(t))
      .flatMap(t => t.filter((e: any) => 'scale' in e))
      .map((e: any) => e.scale)

    expect(scales.length).toBeGreaterThan(0)
    expect(scales.every(s => s === 1.0)).toBe(true)
  })

  it('unselected state applies transform: scale < 1 on inner circle (preserves the old 34px-vs-42px feel)', () => {
    const tile = makeMerchantTile({ id: 'm1' })
    const { UNSAFE_getAllByType } = render(<CustomPin merchant={tile} selected={false} />)
    const scales = UNSAFE_getAllByType(View)
      .map(v => flatten(v.props.style).transform)
      .filter((t): t is any[] => Array.isArray(t))
      .flatMap(t => t.filter((e: any) => 'scale' in e))
      .map((e: any) => e.scale)

    expect(scales.length).toBeGreaterThan(0)
    expect(scales.every(s => s < 1.0 && s > 0)).toBe(true)
  })

  it('inner circle has constant width and height across selected state (only transform changes)', () => {
    const tile = makeMerchantTile({ id: 'm1' })
    const { UNSAFE_getAllByType, rerender } = render(<CustomPin merchant={tile} selected={false} />)
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

    rerender(<CustomPin merchant={tile} selected={true} />)
    const selectedCircle = getCircleSize()
    expect(selectedCircle.width).toBe(42)
    expect(selectedCircle.height).toBe(42)
  })
})
