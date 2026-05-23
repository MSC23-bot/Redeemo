import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { NearbySectionEmpty } from '@/features/home/components/NearbySectionEmpty'

// Task E.2 — Spec §8.4 + §11.4.
//
// `<NearbySectionEmpty>` is the section-level friendly empty card mounted
// in the "nearby" zone when `nearbyByCategoryRails.length === 0` AND
// `locationContext.source !== 'none'`.  Two CTAs route to Categories +
// Search tabs (per §8.2 phrase library lines L6 / L7).
//
// PR #126 device-QA B.1 (owner direction 2026-05-23): body line L5 is
// now locality-aware via the optional `cityName` prop.  When cityName is
// provided, body reads "We're still growing in {City}. Try browsing
// categories or searching to find offers across the UK."  When cityName
// is null/undefined, body falls back to the original generic phrasing
// (defensive — the component is gated on source !== 'none' at the call
// site so locality should always be available in practice).

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

describe('<NearbySectionEmpty>', () => {
  beforeEach(() => {
    mockPush.mockClear()
  })

  it("renders headline L1 (We're still growing near you)", () => {
    const { getByText } = render(<NearbySectionEmpty cityName="Manchester" />)
    expect(getByText("We're still growing near you")).toBeTruthy()
  })

  it('renders locality-aware body L5 when cityName is provided', () => {
    const { getByText } = render(<NearbySectionEmpty cityName="Manchester" />)
    expect(
      getByText("We're still growing in Manchester. Try browsing categories or searching to find offers across the UK."),
    ).toBeTruthy()
  })

  it('falls back to generic body when cityName is null (defensive)', () => {
    const { getByText } = render(<NearbySectionEmpty cityName={null} />)
    expect(
      getByText('Try browsing categories or searching to find offers across the UK.'),
    ).toBeTruthy()
  })

  it('falls back to generic body when cityName is omitted (defensive)', () => {
    const { getByText } = render(<NearbySectionEmpty />)
    expect(
      getByText('Try browsing categories or searching to find offers across the UK.'),
    ).toBeTruthy()
  })

  it('primary button L6 navigates to Categories tab', () => {
    const { getByText } = render(<NearbySectionEmpty cityName="Manchester" />)
    fireEvent.press(getByText('Browse all categories'))
    expect(mockPush).toHaveBeenCalledWith('/(app)/categories')
  })

  it('secondary button L7 navigates to Search tab', () => {
    const { getByText } = render(<NearbySectionEmpty cityName="Manchester" />)
    fireEvent.press(getByText('Open search'))
    expect(mockPush).toHaveBeenCalledWith('/(app)/search')
  })

  it('testID home-nearby-section-empty present', () => {
    const { getByTestId } = render(<NearbySectionEmpty cityName="Manchester" />)
    expect(getByTestId('home-nearby-section-empty')).toBeTruthy()
  })
})
