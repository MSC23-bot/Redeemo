import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { RedemptionRow } from '@/features/savings/components/RedemptionRow'

jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View, Pressable } = require('react-native')
  return {
    __esModule: true,
    default: { View: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })) },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
  }
})
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => 1 }))

const NOW = new Date('2026-04-18T14:00:00Z')

describe('RedemptionRow', () => {
  beforeAll(() => { jest.useFakeTimers({ now: NOW }) })
  afterAll(() => { jest.useRealTimers() })

  const baseRedemption = {
    id: 'r1',
    redeemedAt: '2026-04-18T13:00:00Z', // 1 hour ago
    estimatedSaving: 8.50,
    isValidated: false,
    validatedAt: null,
    merchant: { id: 'm1', businessName: 'Pizza Place', logoUrl: null },
    voucher: { id: 'v1', title: 'Free Dessert', voucherType: 'FREEBIE' as const },
    branch: { id: 'b1', name: 'Central' },
  }

  it('shows "Show to staff" badge when unvalidated and within 24h', () => {
    const { getByText } = render(
      <RedemptionRow redemption={baseRedemption} onPress={() => {}} />,
    )
    expect(getByText('Show to staff')).toBeTruthy()
  })

  it('shows "Validated ✓" badge when validated within 24h', () => {
    const { getByText } = render(
      <RedemptionRow
        redemption={{ ...baseRedemption, isValidated: true, validatedAt: '2026-04-18T13:30:00Z' }}
        onPress={() => {}}
      />,
    )
    expect(getByText('Validated ✓')).toBeTruthy()
  })

  it('shows plain "Redeemed" for items older than 24h', () => {
    const { getByText, queryByText } = render(
      <RedemptionRow
        redemption={{ ...baseRedemption, redeemedAt: '2026-04-16T10:00:00Z' }}
        onPress={() => {}}
      />,
    )
    expect(getByText('Redeemed')).toBeTruthy()
    expect(queryByText('Show to staff')).toBeNull()
  })

  it('calls onPress with voucher id when tapped', () => {
    const onPress = jest.fn()
    const { getByLabelText } = render(
      <RedemptionRow redemption={baseRedemption} onPress={onPress} />,
    )
    fireEvent.press(getByLabelText(/Pizza Place/))
    expect(onPress).toHaveBeenCalledWith('v1')
  })

  it('displays saving amount with + prefix', () => {
    const { getByText } = render(
      <RedemptionRow redemption={baseRedemption} onPress={() => {}} />,
    )
    expect(getByText('+£8.50')).toBeTruthy()
  })
})
