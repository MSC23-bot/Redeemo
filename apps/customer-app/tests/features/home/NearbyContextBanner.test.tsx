import React from 'react'
import { render } from '@testing-library/react-native'
import { NearbyContextBanner } from '@/features/home/components/NearbyContextBanner'

// v1.5 — PR #126 device-QA-3 owner direction (β2 + β3, 2026-05-23).
//
// <NearbyContextBanner> renders above the NearbyByCategory section when
// at least one category rail has cascaded to platform supply.  Provides
// honest context that local/catchment supply is limited so the user
// understands why category rails carry `{Category} on Redeemo` headers
// + larger distances on tile chips.
//
// Locked copy:
//   cityName="Manchester" →
//     "We're still growing in Manchester. Here are the closest category
//      matches on Redeemo."
//   cityName=null →
//     "Here are the closest category matches on Redeemo."
//
// Mutual exclusion with <NearbySectionEmpty> is enforced at the HomeScreen
// derivation level (showNearbyContextBanner requires hasNearbyRails;
// showNearbySectionEmpty requires !hasNearbyRails).  This component test
// only asserts the render shape; the dedup invariant is pinned in
// HomeScreen.dedupRules.test.tsx.

describe('<NearbyContextBanner>', () => {
  it('renders locality-aware copy when cityName provided', () => {
    const { getByText } = render(<NearbyContextBanner cityName="Manchester" />)
    expect(
      getByText("We're still growing in Manchester. Here are the closest category matches on Redeemo."),
    ).toBeTruthy()
  })

  it('falls back to generic copy when cityName is null', () => {
    const { getByText } = render(<NearbyContextBanner cityName={null} />)
    expect(getByText('Here are the closest category matches on Redeemo.')).toBeTruthy()
  })

  it('falls back to generic copy when cityName is omitted', () => {
    const { getByText } = render(<NearbyContextBanner />)
    expect(getByText('Here are the closest category matches on Redeemo.')).toBeTruthy()
  })

  it('testID home-nearby-context-banner present', () => {
    const { getByTestId } = render(<NearbyContextBanner cityName="Manchester" />)
    expect(getByTestId('home-nearby-context-banner')).toBeTruthy()
  })
})
