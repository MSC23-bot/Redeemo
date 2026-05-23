import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { NearbySectionEmpty } from '@/features/home/components/NearbySectionEmpty'

// Task E.2 — Spec §8.4 + §11.4.
//
// `<NearbySectionEmpty>` is the section-level friendly empty card mounted
// in the "nearby" zone when `nearbyByCategoryRails.length === 0` AND
// `locationContext.source !== 'none'`.  Two CTAs route to Categories +
// Search tabs (per §8.2 phrase library lines L6 / L7).

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

describe('<NearbySectionEmpty>', () => {
  beforeEach(() => {
    mockPush.mockClear()
  })

  it("renders headline L1 (We're still growing near you)", () => {
    const { getByText } = render(<NearbySectionEmpty />)
    expect(getByText("We're still growing near you")).toBeTruthy()
  })

  it('renders body L5', () => {
    const { getByText } = render(<NearbySectionEmpty />)
    expect(
      getByText('Try browsing categories or searching to find offers across the UK.'),
    ).toBeTruthy()
  })

  it('primary button L6 navigates to Categories tab', () => {
    const { getByText } = render(<NearbySectionEmpty />)
    fireEvent.press(getByText('Browse all categories'))
    expect(mockPush).toHaveBeenCalledWith('/(app)/categories')
  })

  it('secondary button L7 navigates to Search tab', () => {
    const { getByText } = render(<NearbySectionEmpty />)
    fireEvent.press(getByText('Open search'))
    expect(mockPush).toHaveBeenCalledWith('/(app)/search')
  })

  it('testID home-nearby-section-empty present', () => {
    const { getByTestId } = render(<NearbySectionEmpty />)
    expect(getByTestId('home-nearby-section-empty')).toBeTruthy()
  })
})
