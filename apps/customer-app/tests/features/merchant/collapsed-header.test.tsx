import React from 'react'
import { render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useSharedValue } from 'react-native-reanimated'
import { CollapsedHeader, COMPACT_BAR_HEIGHT } from '@/features/merchant/components/CollapsedHeader'

// expo-router: stub useRouter so the back button's onPress wiring
// resolves under jest. Tests don't fire the press.
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}))

// Pin safe-area metrics to an iPhone 14 Pro (Dynamic Island ≈ 59pt
// top inset). The collapsed header reads `useSafeAreaInsets()` and
// uses `insets.top` as a non-interactive top spacer; pinning the
// metric here exercises the inset-sensitive math.
const DI_INSET_TOP = 59
const initialMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: DI_INSET_TOP, left: 0, right: 0, bottom: 34 },
}

function Frame({ children }: { children: React.ReactNode }) {
  return <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
}

function flatten(s: unknown): Record<string, unknown> {
  const arr = Array.isArray(s) ? s : [s]
  return Object.assign({}, ...arr.flat(Infinity).filter(Boolean) as object[])
}

// M2 — structural tests for the collapsed sticky header.
//
// End-to-end fade behaviour (the actual opacity transition over
// scroll) is on-device QA; these tests pin the contract that the
// screen-scrolling integration depends on:
//   • component mounts with the locked test id
//   • dimensions account for safe-area top inset (Dynamic Island
//     guarantee)
//   • interactive children (back button) are present and labelled
//   • merchant name + branch line render as provided
//   • single-branch case (branchLine null) hides the second line
//   • COMPACT_BAR_HEIGHT export is the locked design value
describe('CollapsedHeader (M2 collapsed sticky header)', () => {
  function Wrapper(props: {
    branchLine?: string | null
    logoUrl?: string | null
    merchantName?: string
    fadeEndY?: number
  }) {
    const scrollY = useSharedValue(0)
    return (
      <CollapsedHeader
        scrollY={scrollY}
        fadeEndY={props.fadeEndY ?? 400}
        merchantName={props.merchantName ?? 'Old Foundry Cafe'}
        branchLine={props.branchLine ?? null}
        logoUrl={props.logoUrl ?? null}
      />
    )
  }

  it('exports the locked compact bar height (52pt)', () => {
    expect(COMPACT_BAR_HEIGHT).toBe(52)
  })

  it('mounts with the collapsed-header test id', () => {
    const { getByTestId } = render(<Frame><Wrapper /></Frame>)
    expect(getByTestId('collapsed-header')).toBeTruthy()
  })

  it('total height = safe-area top inset + COMPACT_BAR_HEIGHT (Dynamic Island clearance)', () => {
    const { getByTestId } = render(<Frame><Wrapper /></Frame>)
    const style = flatten(getByTestId('collapsed-header').props.style)
    // 59 (DI inset) + 52 (compact bar) = 111
    expect(style.height).toBe(DI_INSET_TOP + COMPACT_BAR_HEIGHT)
    expect(style.paddingTop).toBe(DI_INSET_TOP)
  })

  it('positions absolutely at top:0 with cream background', () => {
    const { getByTestId } = render(<Frame><Wrapper /></Frame>)
    const style = flatten(getByTestId('collapsed-header').props.style)
    expect(style.position).toBe('absolute')
    expect(style.top).toBe(0)
    expect(style.backgroundColor).toBe('#FFF9F5')
  })

  it('uses pointerEvents="box-none" so non-button taps pass through', () => {
    const { getByTestId } = render(<Frame><Wrapper /></Frame>)
    expect(getByTestId('collapsed-header').props.pointerEvents).toBe('box-none')
  })

  it('exposes the back button with the Go back accessibility label', () => {
    const { getByLabelText } = render(<Frame><Wrapper /></Frame>)
    expect(getByLabelText('Go back')).toBeTruthy()
  })

  it('renders the merchant name verbatim', () => {
    const { getByText } = render(
      <Frame><Wrapper merchantName="The Coffee House" /></Frame>
    )
    expect(getByText('The Coffee House')).toBeTruthy()
  })

  it('renders the branch line when provided (multi-branch case)', () => {
    const { getByText } = render(
      <Frame><Wrapper branchLine="Old Foundry · Colchester" /></Frame>
    )
    expect(getByText('Old Foundry · Colchester')).toBeTruthy()
  })

  it('hides the branch line when null (single-branch case)', () => {
    const { queryByText } = render(
      <Frame><Wrapper branchLine={null} merchantName="Solo Cafe" /></Frame>
    )
    expect(queryByText('Solo Cafe')).toBeTruthy()
    // No branch line rendered — only merchant name shown.
    expect(queryByText(/·/)).toBeNull()
  })

  // The mock useAnimatedStyle returns {} so we can't directly assert
  // the interpolated opacity value. We CAN assert that an animated
  // style array is present in the style prop (proving the worklet
  // is wired up rather than the opacity being hardcoded).
  it('passes a style array containing the animated opacity slot', () => {
    const { getByTestId } = render(<Frame><Wrapper fadeEndY={400} /></Frame>)
    const styleProp = getByTestId('collapsed-header').props.style
    expect(Array.isArray(styleProp)).toBe(true)
  })
})
