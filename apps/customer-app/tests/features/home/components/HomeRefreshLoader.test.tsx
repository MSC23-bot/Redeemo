import React from 'react'
import { render } from '@testing-library/react-native'
import { HomeRefreshLoader } from '@/features/home/components/HomeRefreshLoader'

// Drive useMotionScale per test (matches the project convention).
let mockMotionScale: 0 | 1 = 1
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => mockMotionScale }))

beforeEach(() => {
  mockMotionScale = 1
})

describe('HomeRefreshLoader', () => {
  it('mounts the branded loader while refreshing', () => {
    const { getByTestId } = render(<HomeRefreshLoader refreshing seamY={300} />)
    expect(getByTestId('home-refresh-loader')).toBeTruthy()
  })

  it('is absent when not refreshing', () => {
    const { queryByTestId } = render(<HomeRefreshLoader refreshing={false} seamY={300} />)
    expect(queryByTestId('home-refresh-loader')).toBeNull()
  })

  it('reduced motion: still mounts while refreshing (static loader)', () => {
    mockMotionScale = 0
    const { getByTestId } = render(<HomeRefreshLoader refreshing seamY={300} />)
    expect(getByTestId('home-refresh-loader')).toBeTruthy()
  })

  it('seam-height guard: absent even while refreshing until seamY is measured (> 0)', () => {
    const { queryByTestId } = render(<HomeRefreshLoader refreshing seamY={0} />)
    expect(queryByTestId('home-refresh-loader')).toBeNull()
  })
})
