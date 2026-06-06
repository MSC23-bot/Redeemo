jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

import React from 'react'
import { StyleSheet } from 'react-native'
import { render, fireEvent } from '@testing-library/react-native'
import { BrandedTabButton } from '@/features/navigation/BrandedTabButton'
import { NAV_INK, NAV_ACTIVE_INK } from '@/features/navigation/navTokens'

const colorOf = (node: { props: { style: unknown } }) =>
  (StyleSheet.flatten(node.props.style) as { color?: string }).color

describe('BrandedTabButton (renders the label react-navigation could not fit)', () => {
  it('renders the visible label text', () => {
    const { getByText } = render(
      <BrandedTabButton name="home" label="Home" accessibilityState={{ selected: false }} testID="tab-home" />,
    )
    expect(getByText('Home')).toBeTruthy()
  })

  it('inactive: warm-ink label + outline icon, no filled glyph', () => {
    const { getByText, getByTestId, queryByTestId } = render(
      <BrandedTabButton name="map" label="Map" accessibilityState={{ selected: false }} testID="tab-map" />,
    )
    expect(colorOf(getByText('Map'))).toBe(NAV_INK)
    expect(getByTestId('branded-tab-outline-map')).toBeTruthy()
    expect(queryByTestId('branded-tab-glyph-map')).toBeNull()
  })

  it('active: brand-red label + filled glyph + indicator', () => {
    const { getByText, getByTestId } = render(
      <BrandedTabButton name="savings" label="Savings" accessibilityState={{ selected: true }} testID="tab-savings" />,
    )
    expect(colorOf(getByText('Savings'))).toBe(NAV_ACTIVE_INK)
    expect(getByTestId('branded-tab-glyph-savings')).toBeTruthy()
    expect(getByTestId('branded-tab-indicator-savings')).toBeTruthy()
  })

  it('forwards press to navigation (onPress)', () => {
    const onPress = jest.fn()
    const { getByTestId } = render(
      <BrandedTabButton
        name="profile"
        label="Profile"
        accessibilityState={{ selected: false }}
        onPress={onPress}
        testID="tab-profile"
      />,
    )
    fireEvent.press(getByTestId('tab-profile'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
