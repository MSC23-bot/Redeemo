import React from 'react'
import { StyleSheet } from 'react-native'
import { render } from '@testing-library/react-native'
import { BrandedTabIcon } from '@/features/navigation/BrandedTabIcon'
import { NAV_ICON_SIZE } from '@/features/navigation/navTokens'

describe('BrandedTabIcon (filled twin — same glyph + size both states)', () => {
  it('active: gradient glyph + indicator capsule, no ink fill', () => {
    const { getByTestId, queryByTestId } = render(<BrandedTabIcon name="home" focused />)
    expect(getByTestId('branded-tab-indicator-home')).toBeTruthy()
    expect(getByTestId('branded-tab-glyph-home')).toBeTruthy()
    expect(queryByTestId('branded-tab-ink-home')).toBeNull()
  })

  it('inactive: ink-filled glyph, no gradient glyph, no indicator', () => {
    const { getByTestId, queryByTestId } = render(<BrandedTabIcon name="map" focused={false} />)
    expect(getByTestId('branded-tab-ink-map')).toBeTruthy()
    expect(queryByTestId('branded-tab-glyph-map')).toBeNull()
    expect(queryByTestId('branded-tab-indicator-map')).toBeNull()
  })

  it('inactive icon renders at NAV_ICON_SIZE (same nominal size as the active glyph)', () => {
    const { getByTestId } = render(<BrandedTabIcon name="favourites" focused={false} />)
    expect(getByTestId('branded-tab-ink-favourites').props.width).toBe(NAV_ICON_SIZE)
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
