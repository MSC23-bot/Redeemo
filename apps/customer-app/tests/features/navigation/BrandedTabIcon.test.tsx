import React from 'react'
import { StyleSheet } from 'react-native'
import { render } from '@testing-library/react-native'
import { BrandedTabIcon } from '@/features/navigation/BrandedTabIcon'
import { NAV_ICON_SIZE, NAV_INK } from '@/features/navigation/navTokens'

describe('BrandedTabIcon (outline inactive → filled active, same size)', () => {
  it('active: filled gradient glyph + indicator capsule, no outline', () => {
    const { getByTestId, queryByTestId } = render(<BrandedTabIcon name="home" focused />)
    expect(getByTestId('branded-tab-indicator-home')).toBeTruthy()
    expect(getByTestId('branded-tab-glyph-home')).toBeTruthy()
    expect(queryByTestId('branded-tab-outline-home')).toBeNull()
  })

  it('inactive: warm-ink outline glyph, no filled glyph, no indicator', () => {
    const { getByTestId, queryByTestId } = render(<BrandedTabIcon name="map" focused={false} />)
    const outline = getByTestId('branded-tab-outline-map')
    expect(outline).toBeTruthy()
    expect(outline.props.width).toBe(NAV_ICON_SIZE)
    expect(queryByTestId('branded-tab-glyph-map')).toBeNull()
    expect(queryByTestId('branded-tab-indicator-map')).toBeNull()
  })

  it('inactive outline is filled with the warm-ink colour', () => {
    const { UNSAFE_getByProps } = render(<BrandedTabIcon name="favourites" focused={false} />)
    // The single <Path> inside the inactive outline carries the ink fill.
    expect(UNSAFE_getByProps({ fill: NAV_INK })).toBeTruthy()
  })

  it('icon slot is the SAME fixed size in both states — active never shrinks', () => {
    const flatten = (node: { props: { style: unknown } }) =>
      StyleSheet.flatten(node.props.style) as { width?: number; height?: number }
    const active = render(<BrandedTabIcon name="profile" focused />)
    const inactive = render(<BrandedTabIcon name="profile" focused={false} />)
    expect(flatten(active.getByTestId('branded-tab-icon-profile'))).toMatchObject({
      width: NAV_ICON_SIZE,
      height: NAV_ICON_SIZE,
    })
    expect(flatten(inactive.getByTestId('branded-tab-icon-profile'))).toMatchObject({
      width: NAV_ICON_SIZE,
      height: NAV_ICON_SIZE,
    })
  })
})
