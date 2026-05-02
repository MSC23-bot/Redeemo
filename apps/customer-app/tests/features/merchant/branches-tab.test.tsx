import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'

// Plan §12 self-review: "distance-aware branches sort, distance-null fallback"
// Mock BranchCard to surface the order in which branches are rendered, then
// assert: nearest-pinned branch first, distance-aware order for the rest,
// null distance treated as Infinity (sorted last).
//
// Bug-fix regression: the outer card press and the Hours button must also
// dispatch through the props (they were both no-ops in the rebaseline). The
// mock exposes two presses — one labelled `card-<id>` for the outer Pressable
// and one labelled `hours-<id>` for the Hours button — so we can assert the
// parent receives the right callback with the right branch id.

jest.mock('@/features/merchant/components/BranchCard', () => {
  const React = require('react')
  const { Text, Pressable } = require('react-native')
  return {
    BranchCard: ({ branch, isNearest, onPress, onHoursPress }: any) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(
          Pressable,
          { accessibilityLabel: `card-${branch.id}`, onPress },
          React.createElement(Text, { accessibilityLabel: `branch-${branch.id}` }, `${branch.id}${isNearest ? '!' : ''}`),
        ),
        React.createElement(
          Pressable,
          { accessibilityLabel: `hours-${branch.id}`, onPress: onHoursPress },
          React.createElement(Text, null, `hours-${branch.id}`),
        ),
      ),
  }
})

import { BranchesTab } from '@/features/merchant/components/BranchesTab'

const mk = (over: Partial<{ id: string; distance: number | null; name: string }> = {}) => ({
  id: 'b', name: 'Branch', isMainBranch: false, isActive: true,
  distance: null, addressLine1: null, addressLine2: null,
  city: null, postcode: null, latitude: null, longitude: null, phone: null, email: null,
  isOpenNow: true, avgRating: null, reviewCount: 0,
  ...over,
})

const noop = () => {}

describe('BranchesTab sorting', () => {
  it('places the nearest-pinned branch first regardless of distance', () => {
    const branches = [
      mk({ id: 'a', distance: 100 }),     // closest by metres
      mk({ id: 'b', distance: 5000 }),    // farther but pinned
      mk({ id: 'c', distance: 200 }),
    ]
    const { getAllByLabelText } = render(
      <BranchesTab branches={branches} nearestBranchId="b" onBranchPress={noop} onHoursPress={noop} />,
    )
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
    const { getAllByLabelText } = render(
      <BranchesTab branches={branches} nearestBranchId={null} onBranchPress={noop} onHoursPress={noop} />,
    )
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
    const { getAllByLabelText } = render(
      <BranchesTab branches={branches} nearestBranchId={null} onBranchPress={noop} onHoursPress={noop} />,
    )
    const order = getAllByLabelText(/^branch-/).map(el => (el.props.accessibilityLabel as string).replace('branch-', ''))
    expect(order[0]).toBe('d')   // distance 200
    expect(order[1]).toBe('b')   // distance 1000
    // a and c (both null) sort to the tail; relative order between them
    // is implementation-defined under sort stability — assert membership only.
    expect(new Set(order.slice(2))).toEqual(new Set(['a', 'c']))
  })

  it('flags only the pinned branch with isNearest', () => {
    const branches = [mk({ id: 'a', distance: 100 }), mk({ id: 'b', distance: 200 })]
    const { getByText } = render(
      <BranchesTab branches={branches} nearestBranchId="a" onBranchPress={noop} onHoursPress={noop} />,
    )
    expect(getByText('a!')).toBeTruthy()   // pinned
    expect(getByText('b')).toBeTruthy()    // not pinned (no '!')
  })
})

// Bug-fix regression: card-tap and Hours button were both no-ops in the
// rebaseline (PR #28). The screen now opens DirectionsSheet for the tapped
// branch, and Hours switches to the About tab — both wired via props.
describe('BranchesTab callbacks', () => {
  it('forwards card-tap to onBranchPress with the tapped branch id', () => {
    const branches = [mk({ id: 'a', distance: 100 }), mk({ id: 'b', distance: 200 })]
    const onBranchPress = jest.fn()
    const { getByLabelText } = render(
      <BranchesTab branches={branches} nearestBranchId="a" onBranchPress={onBranchPress} onHoursPress={noop} />,
    )
    fireEvent.press(getByLabelText('card-b'))
    expect(onBranchPress).toHaveBeenCalledWith('b')
  })

  it('forwards Hours-tap to onHoursPress (no branch id — the About tab is merchant-wide)', () => {
    const branches = [mk({ id: 'a', distance: 100 })]
    const onHoursPress = jest.fn()
    const { getByLabelText } = render(
      <BranchesTab branches={branches} nearestBranchId="a" onBranchPress={noop} onHoursPress={onHoursPress} />,
    )
    fireEvent.press(getByLabelText('hours-a'))
    expect(onHoursPress).toHaveBeenCalledTimes(1)
  })
})
