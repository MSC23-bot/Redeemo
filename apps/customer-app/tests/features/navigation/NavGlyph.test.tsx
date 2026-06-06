import React from 'react'
import { render } from '@testing-library/react-native'
import { NavGlyph } from '@/features/navigation/icons/NavGlyph'
import { REDEEMO_NAV_ICONS } from '@/features/navigation/icons/navIconPaths'
import { NAV_INK, NAV_OUTLINE_STROKE } from '@/features/navigation/navTokens'

describe('NavGlyph', () => {
  it('outline: strokes the outline path with warm ink, no fill', () => {
    const { getByTestId, UNSAFE_getByProps } = render(
      <NavGlyph name="map" weight="outline" size={20} testID="g" />,
    )
    const svg = getByTestId('g')
    expect(svg.props.width).toBe(20)
    // The single <Path> carries the ink stroke, round caps/joins, and no fill.
    const path = UNSAFE_getByProps({ d: REDEEMO_NAV_ICONS.map.outline })
    expect(path.props.stroke).toBe(NAV_INK)
    expect(path.props.fill).toBe('none')
    expect(path.props.strokeWidth).toBe(NAV_OUTLINE_STROKE)
    expect(path.props.strokeLinecap).toBe('round')
    expect(path.props.strokeLinejoin).toBe('round')
  })

  it('filled: renders the filled path (no ink stroke)', () => {
    const { getByTestId, UNSAFE_getByProps } = render(
      <NavGlyph name="map" weight="filled" size={20} testID="g" />,
    )
    expect(getByTestId('g')).toBeTruthy()
    // The filled path is present and is NOT stroked with the inactive ink.
    const path = UNSAFE_getByProps({ d: REDEEMO_NAV_ICONS.map.filled })
    expect(path.props.stroke).toBeUndefined()
  })
})
