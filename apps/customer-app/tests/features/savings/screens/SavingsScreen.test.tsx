import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SavingsScreen } from '@/features/savings/screens/SavingsScreen'

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native')
  return { LinearGradient: (props: any) => <View {...props} /> }
})
jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View, Text } = require('react-native')
  return {
    __esModule: true,
    default: {
      View: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })),
      Text: React.forwardRef((p: any, r: any) => React.createElement(Text, { ...p, ref: r })),
      FlatList: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })),
    },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withDelay: (_d: number, v: unknown) => v,
    withRepeat: (v: unknown) => v,
    withSequence: (...args: unknown[]) => args[args.length - 1],
    Easing: { out: (fn: any) => fn, bezier: () => (x: number) => x },
  }
})
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => 1 }))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/stores/auth', () => ({
  useAuthStore: (sel: (s: any) => unknown) => sel({ status: 'authed' }),
}))

// Mock all data hooks
jest.mock('@/features/savings/hooks/useSavingsSummary')
jest.mock('@/features/savings/hooks/useSavingsRedemptions')
jest.mock('@/features/savings/hooks/useMonthlyDetail')
jest.mock('@/hooks/useSubscription')

import { useSavingsSummary } from '@/features/savings/hooks/useSavingsSummary'
import { useSavingsRedemptions } from '@/features/savings/hooks/useSavingsRedemptions'
import { useMonthlyDetail } from '@/features/savings/hooks/useMonthlyDetail'
import { useSubscription } from '@/hooks/useSubscription'

const mockSummary = useSavingsSummary as jest.Mock
const mockRedemptions = useSavingsRedemptions as jest.Mock
const mockMonthly = useMonthlyDetail as jest.Mock
const mockSub = useSubscription as jest.Mock

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('SavingsScreen', () => {
  beforeEach(() => {
    mockRedemptions.mockReturnValue({ data: undefined, hasNextPage: false, fetchNextPage: jest.fn(), isFetchingNextPage: false, refetch: jest.fn() })
    mockMonthly.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: jest.fn() })
  })

  it('shows skeleton while loading', () => {
    mockSummary.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: jest.fn() })
    mockSub.mockReturnValue({ subscription: null, isSubscribed: false, isSubLoading: true })
    const { getByLabelText } = render(<SavingsScreen />, { wrapper })
    // Skeleton should be present (can check via testID or accessibility)
  })

  it('shows free user state when not subscribed', async () => {
    mockSummary.mockReturnValue({
      data: { lifetimeSaving: 0, thisMonthSaving: 0, thisMonthRedemptionCount: 0, monthlyBreakdown: [], byMerchant: [], byCategory: [] },
      isLoading: false, isError: false, refetch: jest.fn(),
    })
    mockSub.mockReturnValue({ subscription: null, isSubscribed: false, isSubLoading: false })
    const { getByText } = render(<SavingsScreen />, { wrapper })
    await waitFor(() => expect(getByText('Unlock your savings')).toBeTruthy())
  })

  it('shows subscriber-empty state with no redemptions', async () => {
    mockSummary.mockReturnValue({
      data: { lifetimeSaving: 0, thisMonthSaving: 0, thisMonthRedemptionCount: 0, monthlyBreakdown: [], byMerchant: [], byCategory: [] },
      isLoading: false, isError: false, refetch: jest.fn(),
    })
    mockSub.mockReturnValue({ subscription: { status: 'ACTIVE', plan: { billingInterval: 'MONTHLY' } }, isSubscribed: true, isSubLoading: false })
    mockRedemptions.mockReturnValue({ data: { pages: [{ redemptions: [], total: 0 }] }, hasNextPage: false, fetchNextPage: jest.fn(), isFetchingNextPage: false, refetch: jest.fn() })
    const { getByText } = render(<SavingsScreen />, { wrapper })
    await waitFor(() => expect(getByText('Start saving today')).toBeTruthy())
  })
})
