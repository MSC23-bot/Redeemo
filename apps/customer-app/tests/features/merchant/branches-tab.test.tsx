import React from 'react'
import { render } from '@testing-library/react-native'

// Plan §12 self-review: "distance-aware branches sort, distance-null fallback"
// Mock BranchCard to surface the order in which branches are rendered, then
// assert: nearest-pinned branch first, distance-aware order for the rest,
// null distance treated as Infinity (sorted last).

jest.mock('@/features/merchant/components/BranchCard', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return {
    BranchCard: ({ branch, isNearest }: any) =>
      React.createElement(
        Text,
        { accessibilityLabel: `branch-${branch.id}` },
        `${branch.id}${isNearest ? '!' : ''}`,
      ),
  }
})

import { BranchesTab } from '@/features/merchant/components/BranchesTab'

const mk = (over: Partial<{ id: string; distance: number | null; name: string }> = {}) => ({
  id: 'b', name: 'Branch', distance: null, addressLine1: null, addressLine2: null,
  city: null, postcode: null, latitude: null, longitude: null, phone: null, email: null,
  isOpenNow: true, avgRating: null, reviewCount: 0,
  ...over,
})

describe('BranchesTab sorting', () => {
  it('places the nearest-pinned branch first regardless of distance', () => {
    const branches = [
      mk({ id: 'a', distance: 100 }),     // closest by metres
      mk({ id: 'b', distance: 5000 }),    // farther but pinned
      mk({ id: 'c', distance: 200 }),
    ]
    const { getAllByLabelText } = render(<BranchesTab branches={branches} nearestBranchId="b" />)
    const order = getAllByLabelText(/^branch-/).map(el => (el.props.accessibilityLabel as string).replace('branch-', ''))
    expect(order[0]).toBe('b')
    // Remaining sorted by distance ASC.
    expect(order.slice(1)).toEqual(['a', 'c'])
  })

  it('sorts purely by distance when no nearest is pinned', () => {
    const branches = [
      mk({ id: 'a', distance: 500 }),
      mk({ id: 'b', distance: 100 }),
      mk({ id: 'c', distance: 1000 }),
    ]
    const { getAllByLabelText } = render(<BranchesTab branches={branches} nearestBranchId={null} />)
    const order = getAllByLabelText(/^branch-/).map(el => (el.props.accessibilityLabel as string).replace('branch-', ''))
    expect(order).toEqual(['b', 'a', 'c'])
  })

  it('treats null distance as Infinity (sorts to the end)', () => {
    const branches = [
      mk({ id: 'a', distance: null }),
      mk({ id: 'b', distance: 1000 }),
      mk({ id: 'c', distance: null }),
      mk({ id: 'd', distance: 200 }),
    ]
    const { getAllByLabelText } = render(<BranchesTab branches={branches} nearestBranchId={null} />)
    const order = getAllByLabelText(/^branch-/).map(el => (el.props.accessibilityLabel as string).replace('branch-', ''))
    expect(order[0]).toBe('d')   // distance 200
    expect(order[1]).toBe('b')   // distance 1000
    // a and c (both null) sort to the tail; relative order between them
    // is implementation-defined under sort stability — assert membership only.
    expect(new Set(order.slice(2))).toEqual(new Set(['a', 'c']))
  })

  it('flags only the pinned branch with isNearest', () => {
    const branches = [mk({ id: 'a', distance: 100 }), mk({ id: 'b', distance: 200 })]
    const { getByText } = render(<BranchesTab branches={branches} nearestBranchId="a" />)
    expect(getByText('a!')).toBeTruthy()   // pinned
    expect(getByText('b')).toBeTruthy()    // not pinned (no '!')
  })
})
