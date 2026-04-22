import React from 'react'
import { render } from '@testing-library/react-native'
import { TopPlaces } from '@/features/savings/components/TopPlaces'

jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: { View: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })) },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
  }
})
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => 1 }))

describe('TopPlaces', () => {
  it('renders up to 2 merchants', () => {
    const { getByText } = render(
      <TopPlaces merchants={[
        { merchantId: 'm1', businessName: 'Pizza Place', logoUrl: null, saving: 15, count: 3 },
        { merchantId: 'm2', businessName: 'Coffee Shop', logoUrl: null, saving: 8, count: 2 },
      ]} />,
    )
    expect(getByText('Pizza Place')).toBeTruthy()
    expect(getByText('Coffee Shop')).toBeTruthy()
  })

  it('renders 1 merchant without placeholder', () => {
    const { getByText, queryByText } = render(
      <TopPlaces merchants={[
        { merchantId: 'm1', businessName: 'Pizza Place', logoUrl: null, saving: 15, count: 3 },
      ]} />,
    )
    expect(getByText('Pizza Place')).toBeTruthy()
    expect(queryByText('Coffee Shop')).toBeNull()
  })

  it('returns null when merchants is empty', () => {
    const { toJSON } = render(<TopPlaces merchants={[]} />)
    expect(toJSON()).toBeNull()
  })
})
