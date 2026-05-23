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
    // v1.6 PR #126 device-QA-4 (2026-05-23): NearbyByCategory rails are
    // PARENT-category grouped, and the header copy uses `homeCategoryRailLabel`
    // to produce "{Sentence-cased parent} picks".  The cascade-specific
    // `{Category} on Redeemo` variant (v1.5) is RETIRED — local + cascade
    // share the same label rule.  The <NearbyContextBanner> now carries
    // the platform-claim message instead.
    [{ meta: trendingLocal,   railKind: 'nearbyByCategory' as const, categoryName: 'Food & Drink' },      'Food & drink picks'],
    [{ meta: trendingLocal,   railKind: 'nearbyByCategory' as const, categoryName: 'Beauty & Wellness' }, 'Beauty & wellness picks'],
    [{ meta: trendingLocal,   railKind: 'nearbyByCategory' as const, categoryName: 'Health & Fitness' },  'Health & fitness picks'],
    [{ meta: trendingLocal,   railKind: 'nearbyByCategory' as const, categoryName: 'Out & About' },       'Out & about picks'],
    [{ meta: trendingLocal,   railKind: 'nearbyByCategory' as const, categoryName: 'Shopping' },          'Shopping picks'],
    // Cascade rails (scopeExpanded=true) use the SAME label rule — no
    // "on Redeemo" suffix.  The banner does the platform-claim work.
    [{ meta: featuredCascade, railKind: 'nearbyByCategory' as const, categoryName: 'Food & Drink' },      'Food & drink picks'],
    [{ meta: featuredCascade, railKind: 'nearbyByCategory' as const, categoryName: 'Beauty & Wellness' }, 'Beauty & wellness picks'],
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
