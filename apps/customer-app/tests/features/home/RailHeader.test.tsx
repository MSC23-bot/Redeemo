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
  ])('renders copy %j → %s', (props, expected) => {
    const { getByText } = render(<RailHeader {...(props as any)} />)
    expect(getByText(expected)).toBeTruthy()
  })

  it('renders subtitle when provided', () => {
    const { getByText } = render(<RailHeader meta={featuredCascade} railKind="featured" subtitle="Here are the closest matches we have" />)
    expect(getByText('Here are the closest matches we have')).toBeTruthy()
  })
})
