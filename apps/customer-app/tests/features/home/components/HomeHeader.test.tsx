import React from 'react'
import { render } from '@testing-library/react-native'
import { HomeHeader } from '@/features/home/components/HomeHeader'

describe('HomeHeader', () => {
  it('renders greeting with first name', () => {
    const { getByText } = render(
      <HomeHeader firstName="Shebin" area="Shoreditch" city="London" onSearchPress={jest.fn()} onFilterPress={jest.fn()} />
    )
    expect(getByText(/Shebin/)).toBeTruthy()
  })

  it('renders location label', () => {
    const { getByText } = render(
      <HomeHeader firstName="Shebin" area="Shoreditch" city="London" onSearchPress={jest.fn()} onFilterPress={jest.fn()} />
    )
    expect(getByText(/Shoreditch/)).toBeTruthy()
  })

  it('shows morning greeting before noon', () => {
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(9)
    const { getByText } = render(
      <HomeHeader firstName="Shebin" area={null} city={null} onSearchPress={jest.fn()} onFilterPress={jest.fn()} />
    )
    expect(getByText(/morning/)).toBeTruthy()
    jest.restoreAllMocks()
  })

  // Profile Stabilisation Hotfix — avatar render pin.
  // Pre-fix HomeHeader accepted the avatarUrl prop but the render branch
  // was never built; the avatar circle always showed the firstName
  // initial. Users who uploaded a profile photo still saw the navy "J"
  // circle on Home. The fix wires expo-image's <Image> into the avatar
  // circle when avatarUrl is provided, falling back to the initial only
  // when avatarUrl is null/undefined.

  it('renders the profile photo when avatarUrl is provided (not the initial)', () => {
    const { queryByTestId } = render(
      <HomeHeader
        firstName="Jane"
        area={null}
        city={null}
        avatarUrl="data:image/jpeg;base64,Zm9v"
        onSearchPress={jest.fn()}
        onFilterPress={jest.fn()}
      />
    )
    expect(queryByTestId('home-header-avatar-image')).toBeTruthy()
    expect(queryByTestId('home-header-avatar-initial')).toBeNull()
  })

  it('falls back to the firstName initial when avatarUrl is null', () => {
    const { queryByTestId, getByText } = render(
      <HomeHeader
        firstName="Jane"
        area={null}
        city={null}
        avatarUrl={null}
        onSearchPress={jest.fn()}
        onFilterPress={jest.fn()}
      />
    )
    expect(queryByTestId('home-header-avatar-image')).toBeNull()
    expect(queryByTestId('home-header-avatar-initial')).toBeTruthy()
    expect(getByText('J')).toBeTruthy()
  })

  it('falls back to the firstName initial when avatarUrl is omitted entirely', () => {
    const { queryByTestId } = render(
      <HomeHeader
        firstName="Jane"
        area={null}
        city={null}
        onSearchPress={jest.fn()}
        onFilterPress={jest.fn()}
      />
    )
    expect(queryByTestId('home-header-avatar-image')).toBeNull()
    expect(queryByTestId('home-header-avatar-initial')).toBeTruthy()
  })
})
