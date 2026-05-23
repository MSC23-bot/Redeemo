import React from 'react'
import { render } from '@testing-library/react-native'
import { RailHeader } from '@/features/home/components/RailHeader'

const featuredLocal   = { locality: { id: 'l1', name: 'Huddersfield' }, scope: 'city' as const,     scopeExpanded: false, rungCounts: {} }
const featuredCascade = { locality: { id: 'l1', name: 'Huddersfield' }, scope: 'platform' as const, scopeExpanded: true,  rungCounts: {} }
const trendingLocal   = { locality: { id: 'l1', name: 'Huddersfield' }, scope: 'city' as const,     scopeExpanded: false, rungCounts: {} }

describe('<RailHeader>', () => {
  it.each([
    [{ meta: featuredLocal, railKind: 'featured' as const }, 'Featured in Huddersfield'],
    [{ meta: { ...featuredLocal, locality: null }, railKind: 'featured' as const }, 'Featured near you'],
    [{ meta: featuredCascade, railKind: 'featured' as const, subtitle: 'Here are the closest matches we have' }, 'Featured on Redeemo'],
    [{ meta: trendingLocal, fallbackCopy: 'Trending near you' }, 'Trending near you'],
    [{ meta: null, fixedCopy: 'Popular on Redeemo' }, 'Popular on Redeemo'],
    // PR #126 device-QA fixup (2026-05-23): per-category rails render just
    // the category name (no `near you` suffix).  See RailHeader.tsx for the
    // owner direction + rationale.
    [{ meta: trendingLocal, railKind: 'nearbyByCategory' as const, categoryName: 'Restaurant' }, 'Restaurant'],
    [{ meta: trendingLocal, railKind: 'nearbyByCategory' as const, categoryName: 'Cafe & Coffee' }, 'Cafe & Coffee'],
    // v1.5 PR #126 device-QA-3 (β1, 2026-05-23): cascaded category rails
    // render `{Category} on Redeemo` when meta.scopeExpanded === true.
    [{ meta: featuredCascade, railKind: 'nearbyByCategory' as const, categoryName: 'Restaurant' }, 'Restaurant on Redeemo'],
    [{ meta: featuredCascade, railKind: 'nearbyByCategory' as const, categoryName: 'Cafe & Coffee' }, 'Cafe & Coffee on Redeemo'],
    [{ meta: featuredCascade, railKind: 'nearbyByCategory' as const, categoryName: 'Barber' }, 'Barber on Redeemo'],
    // v1.4 PR #126 device-QA-3 (Featured copy honesty): Featured in {City}
    // is reserved for in-locality supply; CATCHMENT/POST_TOWN tier renders
    // "Featured near {City}".
    [{ meta: featuredLocal, railKind: 'featured' as const, allBranchesInLocality: true }, 'Featured in Huddersfield'],
    [{ meta: featuredLocal, railKind: 'featured' as const, allBranchesInLocality: false }, 'Featured near Huddersfield'],
    [{ meta: featuredLocal, railKind: 'featured' as const, allBranchesInLocality: null }, 'Featured in Huddersfield'],
  ])('renders copy %j → %s', (props, expected) => {
    const { getByText } = render(<RailHeader {...(props as any)} />)
    expect(getByText(expected)).toBeTruthy()
  })

  it('renders subtitle when provided', () => {
    const { getByText } = render(<RailHeader meta={featuredCascade} railKind="featured" subtitle="Here are the closest matches we have" />)
    expect(getByText('Here are the closest matches we have')).toBeTruthy()
  })
})
