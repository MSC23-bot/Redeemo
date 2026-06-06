import React from 'react'
import { View, StyleSheet } from 'react-native'
import { render } from '@testing-library/react-native'
import { BrandedTabIcon } from '@/features/navigation/BrandedTabIcon'

const BRAND_ROSE = '#E20C04' // color.brandRose
const INK = '#4B5563' // color.text.secondary / NAV_INK

// Probe records its received `color` into a queryable style.
const ProbeIcon = ({ color }: { color?: string; size?: number; strokeWidth?: number }) => (
  <View testID="probe" style={{ borderColor: color }} />
)
const probeColor = (node: { props: { style: unknown } }): string =>
  (StyleSheet.flatten(node.props.style) as { borderColor?: string }).borderColor ?? ''

describe('BrandedTabIcon (M1 — ink/brand outline)', () => {
  it('active icon is brand-red', () => {
    const { getByTestId } = render(<BrandedTabIcon Icon={ProbeIcon} name="home" focused />)
    expect(getByTestId('branded-tab-icon-home')).toBeTruthy()
    expect(probeColor(getByTestId('probe'))).toBe(BRAND_ROSE)
  })

  it('inactive icon is warm-ink', () => {
    const { getByTestId } = render(<BrandedTabIcon Icon={ProbeIcon} name="map" focused={false} />)
    expect(probeColor(getByTestId('probe'))).toBe(INK)
  })
})
