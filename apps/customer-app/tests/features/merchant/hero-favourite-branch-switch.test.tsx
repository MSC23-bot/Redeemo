/**
 * Phase 3C.1g M2.9 — locked spec §4.3 contract.
 *
 * Switching branches in the picker on Merchant Profile must re-
 * evaluate the hero heart.  Branch A favourited + Branch B not
 * favourited → switching from A → B flips the heart icon and the
 * a11y label.  Switching back A flips it again.
 *
 * Driven by:
 *   - `selectedBranch.isFavourited` (server-emitted per branch)
 *     flowing into the HeroNav `branchIsFavourited` prop.
 *   - HeroNav → `<FavouriteHeart>` re-runs `useEffect` on the
 *     `initialIsFavourited` change and re-syncs its internal state.
 */

import React from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useSharedValue } from 'react-native-reanimated'
import { HeroNav } from '@/features/merchant/components/HeroSection'

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}))

const initialMetrics = {
  frame:  { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    )
  }
  return rtlRender(node, { wrapper: Wrapper })
}

function HeroHarness(props: {
  branchId:           string
  branchIsFavourited: boolean
}) {
  const scrollY = useSharedValue(0)
  return (
    <HeroNav
      branchId={props.branchId}
      branchIsFavourited={props.branchIsFavourited}
      merchantId="m-test"
      onShare={() => {}}
      scrollY={scrollY}
    />
  )
}

describe('HeroNav — branch picker switch re-evaluates the heart (spec §4.3)', () => {
  it('flips the heart label when the selected branch swaps from a favourited branch to a non-favourited sibling', () => {
    const { getByLabelText, rerender } = render(
      <HeroHarness branchId="br-A" branchIsFavourited={true} />
    )
    expect(getByLabelText('Remove from favourites')).toBeTruthy()

    // Branch picker switches the selectedBranch to a non-favourited
    // sibling.  MerchantProfileScreen re-renders HeroNav with the new
    // branchId + branchIsFavourited=false; FavouriteHeart's useEffect
    // resyncs to the new initialIsFavourited.
    rerender(<HeroHarness branchId="br-B" branchIsFavourited={false} />)
    expect(getByLabelText('Add to favourites')).toBeTruthy()
  })

  it('flips back when the user switches back to the favourited branch', () => {
    const { getByLabelText, rerender } = render(
      <HeroHarness branchId="br-A" branchIsFavourited={true} />
    )
    rerender(<HeroHarness branchId="br-B" branchIsFavourited={false} />)
    expect(getByLabelText('Add to favourites')).toBeTruthy()
    rerender(<HeroHarness branchId="br-A" branchIsFavourited={true} />)
    expect(getByLabelText('Remove from favourites')).toBeTruthy()
  })
})
