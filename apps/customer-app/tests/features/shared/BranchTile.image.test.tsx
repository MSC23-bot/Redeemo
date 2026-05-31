// Tier 1 polish PR (2026-05-22) — §CV Phase A pin.
//
// Locks the shared `<BranchTile>` image-loading behaviour:
// 1. Banner uses expo-image with cream (#FFF6EE) placeholder + 180ms transition.
// 2. Logo uses expo-image with cream placeholder + 180ms transition when set.
// 3. Gradient banner fallback survives when bannerUrl is null.
// 4. Initials logo fallback survives when logoUrl is null.
//
// `<BranchTile>` is consumed by Home Featured / Trending / NearbyByCategory,
// Search Category Results, AND the Map carousel (via MapBranchTile), so this
// pin protects the placeholder + transition behaviour across all 5 surfaces.

import React from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BranchTile } from '@/features/shared/BranchTile'
import { makeBranchTile } from '../../fixtures/branchTile'

// Phase 3C.1g M2.7 — `<BranchTile>` now renders `<FavouriteHeart>`
// which calls `useFavourite()` → `useQueryClient()`.  Every render
// must run inside a `<QueryClientProvider>`; intercept `render` here
// so the existing test bodies stay untouched.
function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

describe('BranchTile — image render (§CV Phase A)', () => {
  it('banner uses expo-image with the bannerUrl source when set', () => {
    const tile = makeBranchTile({
      merchant: {
        businessName: 'Pino',
        bannerUrl:    'https://example.com/banner.jpg',
        logoUrl:      null,
      },
    })
    const { getByTestId } = render(<BranchTile branch={tile} onPress={() => {}} />)
    const banner = getByTestId('branch-tile-banner-image')
    // expo-image normalises `source={{ uri }}` to `[{ uri }]` in the prop tree.
    expect(banner.props.source).toEqual([{ uri: 'https://example.com/banner.jpg' }])
    // expo-image normalises numeric `transition={180}` to `{ duration: 180 }`.
    expect(banner.props.transition).toEqual({ duration: 180 })
  })

  it('banner has cream (#FFF6EE) placeholder backgroundColor when bannerUrl is set', () => {
    const tile = makeBranchTile({
      merchant: {
        businessName: 'Pino',
        bannerUrl:    'https://example.com/banner.jpg',
      },
    })
    const { getByTestId } = render(<BranchTile branch={tile} onPress={() => {}} />)
    const banner = getByTestId('branch-tile-banner-image')
    const flat   = Array.isArray(banner.props.style)
      ? Object.assign({}, ...banner.props.style.filter(Boolean))
      : banner.props.style
    expect(flat.backgroundColor).toBe('#FFF6EE')
  })

  it('renders LinearGradient fallback when bannerUrl is null (NOT an Image)', () => {
    const tile = makeBranchTile({
      merchant: {
        businessName: 'Local Cafe',
        bannerUrl:    null,
        logoUrl:      null,
      },
    })
    const { queryByTestId, getByTestId } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(queryByTestId('branch-tile-banner-image')).toBeNull()
    expect(getByTestId('branch-tile-banner-fallback')).toBeTruthy()
  })

  it('logo uses expo-image with the logoUrl source + 180ms transition when set', () => {
    const tile = makeBranchTile({
      merchant: {
        businessName: 'Pino',
        bannerUrl:    null,
        logoUrl:      'https://example.com/logo.png',
      },
    })
    const { getByTestId } = render(<BranchTile branch={tile} onPress={() => {}} />)
    const logo = getByTestId('branch-tile-logo-image')
    expect(logo.props.source).toEqual([{ uri: 'https://example.com/logo.png' }])
    expect(logo.props.transition).toEqual({ duration: 180 })
  })

  it('renders initials block when logoUrl is null', () => {
    const tile = makeBranchTile({
      merchant: {
        businessName: 'Pino',
        logoUrl:      null,
      },
    })
    const { queryByTestId, getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(queryByTestId('branch-tile-logo-image')).toBeNull()
    expect(getByText('P')).toBeTruthy()
  })
})
