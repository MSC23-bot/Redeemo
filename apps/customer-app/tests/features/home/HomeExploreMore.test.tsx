import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { HomeExploreMore } from '@/features/home/components/HomeExploreMore'

// Task F.2 — Spec §8.5 + §11.5.
//
// `<HomeExploreMore>` is the page-bottom soft CTA mounted when supply
// near the user is sparse.  It is intentionally a gentle nudge (lower
// visual weight than `<NearbySectionEmpty>`).  The sparse-supply
// heuristic + v1.2 dedup mutual exclusion with `<NearbySectionEmpty>`
// and `<HomeNoLocationBanner>` is enforced at the HomeScreen level in
// Task F.3 — this component does not know about dedup.
//
// Copy locked from §8.2 phrase library:
//   L3:  "Explore more on Redeemo" (CTA → Search tab)
//   L11: "Looking for more? Explore offers across Redeemo." (body)

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

describe('<HomeExploreMore>', () => {
  beforeEach(() => {
    mockPush.mockClear()
  })

  it('renders body L11 (Looking for more? Explore offers across Redeemo.)', () => {
    const { getByText } = render(<HomeExploreMore />)
    expect(getByText('Looking for more? Explore offers across Redeemo.')).toBeTruthy()
  })

  it('renders CTA label L3 (Explore more on Redeemo)', () => {
    const { getByText } = render(<HomeExploreMore />)
    expect(getByText('Explore more on Redeemo')).toBeTruthy()
  })

  it('CTA navigates to Search tab', () => {
    const { getByText } = render(<HomeExploreMore />)
    fireEvent.press(getByText('Explore more on Redeemo'))
    expect(mockPush).toHaveBeenCalledWith('/(app)/search')
  })

  it('testID home-explore-more present', () => {
    const { getByTestId } = render(<HomeExploreMore />)
    expect(getByTestId('home-explore-more')).toBeTruthy()
  })
})
