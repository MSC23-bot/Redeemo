import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import type { SharedValue } from 'react-native-reanimated'
import { HomeCollapsedHeader } from '@/features/home/components/HomeCollapsedHeader'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}))

// Reanimated worklets are not evaluated under jest, so the opacity
// interpolation / fade threshold is device-QA-verified, not unit-asserted.
// A plain {value} stub is sufficient — the worklet never runs here.
const scrollY = { value: 0 } as unknown as SharedValue<number>

const baseProps = {
  scrollY,
  fadeEndY: 120,
  // Review fix: `active` gates pointer events + a11y exposure. Default to the
  // shown state for the render/handler assertions below; the gate itself is
  // pinned in its own test.
  active: true,
  firstName: 'Shebin',
  area: 'Shoreditch',
  city: 'London',
  onSearchPress: jest.fn(),
  onAvatarPress: jest.fn(),
  onNotificationPress: jest.fn(),
  onLocationPress: jest.fn(),
}

describe('HomeCollapsedHeader', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders the location + search icon + avatar', () => {
    const { getByTestId, getByText } = render(<HomeCollapsedHeader {...baseProps} />)
    expect(getByTestId('home-collapsed-header')).toBeTruthy()
    expect(getByTestId('home-collapsed-search')).toBeTruthy()
    expect(getByTestId('home-collapsed-bell')).toBeTruthy()
    expect(getByTestId('home-collapsed-avatar')).toBeTruthy()
    // Review fix: the collapsed location button carries a DISTINCT testID so it
    // doesn't collide with the expanded header's button.
    expect(getByTestId('home-collapsed-location-button')).toBeTruthy()
    expect(getByText('Shoreditch, London')).toBeTruthy()
  })

  it('search + avatar fire their handlers', () => {
    const { getByTestId } = render(<HomeCollapsedHeader {...baseProps} />)
    fireEvent.press(getByTestId('home-collapsed-search'))
    fireEvent.press(getByTestId('home-collapsed-bell'))
    fireEvent.press(getByTestId('home-collapsed-avatar'))
    expect(baseProps.onSearchPress).toHaveBeenCalledTimes(1)
    expect(baseProps.onNotificationPress).toHaveBeenCalledTimes(1)
    expect(baseProps.onAvatarPress).toHaveBeenCalledTimes(1)
  })

  // Review fix — the pinned bar overlaps the expanded header's top band, so
  // while hidden it must NOT be touch-live or screen-reader-visible.
  it('gates pointer events + accessibility on `active`', () => {
    const hidden = render(<HomeCollapsedHeader {...baseProps} active={false} />)
    const hiddenBar = hidden.getByTestId('home-collapsed-header', { includeHiddenElements: true })
    expect(hiddenBar.props.pointerEvents).toBe('none')
    expect(hiddenBar.props.accessibilityElementsHidden).toBe(true)
    expect(hiddenBar.props.importantForAccessibility).toBe('no-hide-descendants')

    const shown = render(<HomeCollapsedHeader {...baseProps} active />)
    const shownBar = shown.getByTestId('home-collapsed-header')
    expect(shownBar.props.pointerEvents).toBe('box-none')
    expect(shownBar.props.accessibilityElementsHidden).toBe(false)
    expect(shownBar.props.importantForAccessibility).toBe('auto')
  })
})
