import React from 'react'
import { render } from '@testing-library/react-native'
import { HomeHeaderLocation } from '@/features/home/components/HomeHeaderLocation'

// <LocationStatusLabel> (rendered in the no-GPS-but-context branch) calls
// useRouter() + useUserLocation() internally — mock both so this unit test
// stays presentational.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({ permission: 'granted' }),
}))

describe('HomeHeaderLocation', () => {
  it('renders the area/city row when GPS location is present', () => {
    const { getByText } = render(<HomeHeaderLocation area="Shoreditch" city="London" />)
    expect(getByText('Shoreditch, London')).toBeTruthy()
  })

  it('renders nothing when no location and no context', () => {
    const { toJSON } = render(<HomeHeaderLocation area={null} city={null} />)
    expect(toJSON()).toBeNull()
  })

  it('renders the profile status label when context is provided but no GPS area/city', () => {
    const ctx = { source: 'profile', city: 'Huddersfield' } as any
    const { getByText } = render(
      <HomeHeaderLocation area={null} city={null} locationContext={ctx} />,
    )
    // LocationStatusLabel renders "Using profile location · Huddersfield"
    expect(getByText(/profile location/i)).toBeTruthy()
  })
})
