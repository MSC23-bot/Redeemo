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
  firstName: 'Shebin',
  area: 'Shoreditch',
  city: 'London',
  onSearchPress: jest.fn(),
  onAvatarPress: jest.fn(),
  onNotificationPress: jest.fn(),
}

describe('HomeCollapsedHeader', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders the location + search icon + avatar', () => {
    const { getByTestId, getByText } = render(<HomeCollapsedHeader {...baseProps} />)
    expect(getByTestId('home-collapsed-header')).toBeTruthy()
    expect(getByTestId('home-collapsed-search')).toBeTruthy()
    expect(getByTestId('home-collapsed-bell')).toBeTruthy()
    expect(getByTestId('home-collapsed-avatar')).toBeTruthy()
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
})
