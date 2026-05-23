import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { HomeNoLocationBanner } from '@/features/home/components/HomeNoLocationBanner'

// Task F.1 — Spec §8.6 + §11.3.
//
// `<HomeNoLocationBanner>` is the top-of-Home banner mounted when
// `feed.locationContext.source === 'none'`.  Two CTAs:
//   - Primary L9 "Allow location" → useUserLocation().requestPermission()
//   - Secondary L10 "Set my area" → router.push('/(auth)/profile-completion/address')
//
// Copy locked from §8.2 phrase library:
//   L4: "Set your area to see nearby offers" (headline)
//   L8: "Allow location or set your saved area so we can show you what's nearby." (body)
//   L9: "Allow location" (primary CTA)
//   L10: "Set my area"   (secondary CTA)
//
// HomeScreen wiring for source='none' is in Task F.3. This test renders
// the component unconditionally — it just verifies the component renders
// correctly when mounted.

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockRequestPermission = jest.fn()
jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    status: 'idle',
    location: null,
    requestPermission: mockRequestPermission,
  }),
}))

describe('<HomeNoLocationBanner>', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockRequestPermission.mockClear()
  })

  it('renders headline L4 (Set your area to see nearby offers)', () => {
    const { getByText } = render(<HomeNoLocationBanner />)
    expect(getByText('Set your area to see nearby offers')).toBeTruthy()
  })

  it('renders body L8', () => {
    const { getByText } = render(<HomeNoLocationBanner />)
    expect(
      getByText(
        "Allow location or set your saved area so we can show you what's nearby.",
      ),
    ).toBeTruthy()
  })

  it('primary button L9 invokes useUserLocation().requestPermission()', () => {
    const { getByText } = render(<HomeNoLocationBanner />)
    fireEvent.press(getByText('Allow location'))
    expect(mockRequestPermission).toHaveBeenCalledTimes(1)
  })

  it('secondary button L10 navigates to PC2 address screen', () => {
    const { getByText } = render(<HomeNoLocationBanner />)
    fireEvent.press(getByText('Set my area'))
    expect(mockPush).toHaveBeenCalledWith('/(auth)/profile-completion/address')
  })

  it('testID home-no-location-banner present', () => {
    const { getByTestId } = render(<HomeNoLocationBanner />)
    expect(getByTestId('home-no-location-banner')).toBeTruthy()
  })
})
