// Tier 1 polish PR (2026-05-22) — §CN pin.
//
// CampaignCarousel previously ignored `campaign.bannerImageUrl` entirely;
// every campaign rendered with the default gradient even when the seed
// data shipped real Unsplash banners.  This pin locks the post-fix
// contract:
//   - bannerImageUrl set    → expo-image renders the photo with a navy
//                              gradient overlay (rgba(1,12,53,0.4)) for
//                              text legibility
//   - bannerImageUrl null   → existing gradient-only render preserved
//
// Out of scope: routing the campaign-tap (still no-op per §CL),
// gradientStart/gradientEnd polish, or any product change to which
// campaigns appear on Home.

import React from 'react'
import { render } from '@testing-library/react-native'
import { processColor } from 'react-native'
import { CampaignCarousel } from '@/features/home/components/CampaignCarousel'
import type { CampaignTile } from '@/lib/api/discovery'

const baseCampaign: CampaignTile = {
  id:              'c1',
  name:            'Summer Sips',
  description:     'Cool drinks',
  gradientStart:   null,
  gradientEnd:     null,
  ctaText:         null,
  bannerImageUrl:  null,
}

describe('CampaignCarousel — bannerImageUrl render (§CN)', () => {
  it('renders the expo-image banner with the URI when bannerImageUrl is set', () => {
    const campaigns: CampaignTile[] = [
      { ...baseCampaign, bannerImageUrl: 'https://example.com/c1.jpg' },
    ]
    const { getByTestId } = render(
      <CampaignCarousel campaigns={campaigns} onCampaignPress={() => {}} />,
    )
    const banner = getByTestId('campaign-banner-image-c1')
    expect(banner.props.source).toEqual([{ uri: 'https://example.com/c1.jpg' }])
    expect(banner.props.transition).toEqual({ duration: 180 })
  })

  it('renders the navy gradient overlay rgba(1,12,53,0.4) when banner image is present', () => {
    const campaigns: CampaignTile[] = [
      { ...baseCampaign, bannerImageUrl: 'https://example.com/c1.jpg' },
    ]
    const { getByTestId } = render(
      <CampaignCarousel campaigns={campaigns} onCampaignPress={() => {}} />,
    )
    const overlay = getByTestId('campaign-banner-overlay-c1')
    // expo-linear-gradient under jest-expo normalises colour strings through
    // React Native's processColor (32-bit integer encoding).  Compare against
    // the same conversion to pin the intended values regardless of encoding.
    expect(overlay.props.colors).toEqual([
      processColor('transparent'),
      processColor('rgba(1,12,53,0.4)'),
    ])
  })

  it('renders gradient-only (no banner image) when bannerImageUrl is null', () => {
    const { queryByTestId, getByTestId } = render(
      <CampaignCarousel campaigns={[baseCampaign]} onCampaignPress={() => {}} />,
    )
    expect(queryByTestId('campaign-banner-image-c1')).toBeNull()
    expect(queryByTestId('campaign-banner-overlay-c1')).toBeNull()
    // gradient-only path still renders the campaign body
    expect(getByTestId('campaign-tile-c1')).toBeTruthy()
  })

  it('preserves text + CTA on both render paths', () => {
    const withBanner: CampaignTile[] = [
      { ...baseCampaign, bannerImageUrl: 'https://example.com/c1.jpg' },
    ]
    const { getByText, rerender } = render(
      <CampaignCarousel campaigns={withBanner} onCampaignPress={() => {}} />,
    )
    expect(getByText('Summer Sips')).toBeTruthy()
    expect(getByText('Cool drinks')).toBeTruthy()
    expect(getByText('Learn More')).toBeTruthy()

    rerender(
      <CampaignCarousel campaigns={[baseCampaign]} onCampaignPress={() => {}} />,
    )
    expect(getByText('Summer Sips')).toBeTruthy()
    expect(getByText('Cool drinks')).toBeTruthy()
    expect(getByText('Learn More')).toBeTruthy()
  })
})
