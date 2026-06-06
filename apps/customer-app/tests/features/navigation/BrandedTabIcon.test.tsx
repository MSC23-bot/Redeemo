import React from 'react'
import { View, StyleSheet } from 'react-native'
import { render } from '@testing-library/react-native'
import { BrandedTabIcon } from '@/features/navigation/BrandedTabIcon'

const INK = '#4B5563' // NAV_INK / color.text.secondary

// Probe records its received `color` into a queryable style (the inactive outline).
const ProbeIcon = ({ color }: { color?: string; size?: number; strokeWidth?: number }) => (
  <View testID="probe" style={{ borderColor: color }} />
)
const probeColor = (node: { props: { style: unknown } }): string =>
  (StyleSheet.flatten(node.props.style) as { borderColor?: string }).borderColor ?? ''

describe('BrandedTabIcon (M2 — gradient glyph + indicator)', () => {
  it('active: gradient-fill glyph + brand indicator, NOT the outline icon', () => {
    const { getByTestId, queryByTestId } = render(<BrandedTabIcon Icon={ProbeIcon} name="home" focused />)
    expect(getByTestId('branded-tab-indicator-home')).toBeTruthy()
    expect(getByTestId('branded-tab-glyph-home')).toBeTruthy()
    expect(queryByTestId('probe')).toBeNull() // outline icon not used when active
  })

  it('inactive: warm-ink outline icon, no glyph, no indicator', () => {
    const { getByTestId, queryByTestId } = render(<BrandedTabIcon Icon={ProbeIcon} name="map" focused={false} />)
    expect(queryByTestId('branded-tab-indicator-map')).toBeNull()
    expect(queryByTestId('branded-tab-glyph-map')).toBeNull()
    expect(probeColor(getByTestId('probe'))).toBe(INK)
  })
})
