import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { HomeHeader } from '@/features/home/components/HomeHeader'

describe('HomeHeader', () => {
  it('renders greeting with first name', () => {
    const { getByText } = render(
      <HomeHeader firstName="Shebin" area="Shoreditch" city="London" onSearchPress={jest.fn()} onAvatarPress={jest.fn()} />
    )
    expect(getByText(/Shebin/)).toBeTruthy()
  })

  it('renders location label', () => {
    const { getByText } = render(
      <HomeHeader firstName="Shebin" area="Shoreditch" city="London" onSearchPress={jest.fn()} onAvatarPress={jest.fn()} />
    )
    expect(getByText(/Shoreditch/)).toBeTruthy()
  })

  it('shows morning greeting before noon', () => {
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(9)
    const { getByText } = render(
      <HomeHeader firstName="Shebin" area={null} city={null} onSearchPress={jest.fn()} onAvatarPress={jest.fn()} />
    )
    expect(getByText(/morning/)).toBeTruthy()
    jest.restoreAllMocks()
  })

  // Batch 2 M2 — dead Filter button removed (spec §9.1; it had a no-op handler).
  it('does NOT render a Filter button (Batch 2 M2 removal)', () => {
    const { queryByLabelText } = render(
      <HomeHeader firstName="Shebin" area={null} city={null} onSearchPress={jest.fn()} onAvatarPress={jest.fn()} />
    )
    expect(queryByLabelText('Filter')).toBeNull()
  })

  // Batch 2 M2 — avatar is tappable and routes to Profile (parent owns routing).
  it('avatar is tappable, exposes the Profile label, and fires onAvatarPress', () => {
    const onAvatarPress = jest.fn()
    const { getByTestId, getByLabelText } = render(
      <HomeHeader firstName="Shebin" area={null} city={null} onSearchPress={jest.fn()} onAvatarPress={onAvatarPress} />
    )
    expect(getByLabelText('Profile')).toBeTruthy()
    fireEvent.press(getByTestId('home-header-avatar'))
    expect(onAvatarPress).toHaveBeenCalledTimes(1)
  })

  // Profile Stabilisation Hotfix — avatar render pin (preserved through Batch 2 M2).
  // The avatarUrl image branch must survive the tappable/gradient rework.
  it('renders the profile photo when avatarUrl is provided (not the initial)', () => {
    const { queryByTestId } = render(
      <HomeHeader
        firstName="Jane"
        area={null}
        city={null}
        avatarUrl="data:image/jpeg;base64,Zm9v"
        onSearchPress={jest.fn()}
        onAvatarPress={jest.fn()}
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
        onAvatarPress={jest.fn()}
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
        onAvatarPress={jest.fn()}
      />
    )
    expect(queryByTestId('home-header-avatar-image')).toBeNull()
    expect(queryByTestId('home-header-avatar-initial')).toBeTruthy()
  })

  // PR A (sticky header) — Option A expanded layout adds a full-width
  // tap-through search bar in place of the old top-right search icon.
  it('renders the full-width search bar (Option A)', () => {
    const { getByTestId } = render(
      <HomeHeader firstName="Shebin" area={null} city={null} onSearchPress={jest.fn()} onAvatarPress={jest.fn()} />
    )
    expect(getByTestId('home-search-bar')).toBeTruthy()
  })

  it('search bar tap fires onSearchPress', () => {
    const onSearchPress = jest.fn()
    const { getByTestId } = render(
      <HomeHeader firstName="Shebin" area={null} city={null} onSearchPress={onSearchPress} onAvatarPress={jest.fn()} />
    )
    fireEvent.press(getByTestId('home-search-bar'))
    expect(onSearchPress).toHaveBeenCalledTimes(1)
  })

  it('reports its height via onHeightChange (drives fadeEndY)', () => {
    const onHeightChange = jest.fn()
    const { getByTestId } = render(
      <HomeHeader firstName="Shebin" area={null} city={null} onSearchPress={jest.fn()} onAvatarPress={jest.fn()} onHeightChange={onHeightChange} />
    )
    fireEvent(getByTestId('home-header'), 'layout', { nativeEvent: { layout: { height: 180 } } })
    expect(onHeightChange).toHaveBeenCalledWith(180)
  })
})
