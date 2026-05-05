import React from 'react'
import { render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useSharedValue } from 'react-native-reanimated'
import { HeroBanner, HeroBannerSpacer, HERO_HEIGHT } from '@/features/merchant/components/HeroSection'

// expo-router ships ESM-only on jest in this project; mock just the
// surface HeroBanner uses. The back button reads `useRouter().back`
// when pressed; tests here don't fire the press, so a no-op stub is fine.
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}))

// Pin safe-area metrics so `useSafeAreaInsets()` resolves under jest
// without depending on the device-frame measurement that
// react-native-safe-area-context normally awaits. The values
// chosen mimic an iPhone 14 Pro (Dynamic Island ~59pt top inset)
// to surface any inset-sensitive layout regression in the
// merchant-profile header chrome during M2 implementation.
const initialMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

function Frame({ children }: { children: React.ReactNode }) {
  return <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
}

// M1 — structural test for the stretchy-hero refactor.
//
// HeroSection split into two exports:
//   • <HeroBanner>: absolutely-positioned layer mounted as a sibling
//     of the outer ScrollView. Receives a `scrollY` SharedValue and
//     applies translate (outer) + bottom-origin scale (inner) so the
//     banner appears to scroll AND stretches on pull-down overscroll.
//   • <HeroBannerSpacer>: in-flow placeholder reserving HERO_HEIGHT
//     pixels at the position the legacy <HeroSection> occupied so
//     downstream scroll children (identity zone, sticky tab bar)
//     stay at the same Y coordinates.
//
// These tests pin the structural contract — anything that screen-
// scrolling integration depends on (testIDs, prop wiring, exported
// constants, accessibility labels). End-to-end visual verification
// (the actual stretch behaviour on overscroll) is on-device QA.
describe('HeroBanner / HeroBannerSpacer (M1 stretchy hero)', () => {
  it('exports HERO_HEIGHT matching the locked design value (224pt)', () => {
    expect(HERO_HEIGHT).toBe(224)
  })

  it('HeroBannerSpacer renders a placeholder element with the test id', () => {
    const { getByTestId } = render(<Frame><HeroBannerSpacer /></Frame>)
    expect(getByTestId('hero-banner-spacer')).toBeTruthy()
  })

  it('HeroBanner mounts and exposes the hero-banner test id when given a scrollY', () => {
    function Wrapper() {
      const scrollY = useSharedValue(0)
      return (
        <HeroBanner
          bannerUrl={null}
          isFavourited={false}
          onToggleFavourite={() => {}}
          onShare={() => {}}
          scrollY={scrollY}
        />
      )
    }
    const { getByTestId } = render(<Frame><Wrapper /></Frame>)
    expect(getByTestId('hero-banner')).toBeTruthy()
  })

  it('HeroBanner exposes back, share, and heart accessibility actions', () => {
    function Wrapper() {
      const scrollY = useSharedValue(0)
      return (
        <HeroBanner
          bannerUrl="https://example.com/banner.jpg"
          isFavourited={false}
          onToggleFavourite={() => {}}
          onShare={() => {}}
          scrollY={scrollY}
        />
      )
    }
    const { getByLabelText } = render(<Frame><Wrapper /></Frame>)
    expect(getByLabelText('Go back')).toBeTruthy()
    expect(getByLabelText('Share merchant')).toBeTruthy()
    expect(getByLabelText('Add to favourites')).toBeTruthy()
  })

  it('HeroBanner heart label flips between Add and Remove based on isFavourited', () => {
    function Wrapper({ fav }: { fav: boolean }) {
      const scrollY = useSharedValue(0)
      return (
        <HeroBanner
          bannerUrl={null}
          isFavourited={fav}
          onToggleFavourite={() => {}}
          onShare={() => {}}
          scrollY={scrollY}
        />
      )
    }
    const { getByLabelText, rerender } = render(<Frame><Wrapper fav={false} /></Frame>)
    expect(getByLabelText('Add to favourites')).toBeTruthy()
    rerender(<Frame><Wrapper fav={true} /></Frame>)
    expect(getByLabelText('Remove from favourites')).toBeTruthy()
  })

  // SBB-aware positioning: when SuspendedBranchBanner is visible, the
  // screen passes its measured height as `topOffset` so the absolute
  // banner sits BELOW the SBB rather than overlapping it in z-order.
  // 0 is the default (no SBB visible / SBB collapsed to height 0).
  it('HeroBanner applies topOffset to its outer style (default 0)', () => {
    function Wrapper({ topOffset }: { topOffset?: number }) {
      const scrollY = useSharedValue(0)
      const baseProps = {
        bannerUrl: null,
        isFavourited: false,
        onToggleFavourite: () => {},
        onShare: () => {},
        scrollY,
      }
      // Conditional spread: omit `topOffset` from props when not given
      // so the component's own default (0) takes over. exactOptionalPropertyTypes
      // rejects passing `undefined` to an optional prop.
      return topOffset === undefined
        ? <HeroBanner {...baseProps} />
        : <HeroBanner {...baseProps} topOffset={topOffset} />
    }
    const flatten = (s: unknown): Record<string, unknown> => {
      const arr = Array.isArray(s) ? s : [s]
      return Object.assign({}, ...arr.flat(Infinity).filter(Boolean) as object[])
    }

    const { getByTestId, rerender } = render(<Frame><Wrapper /></Frame>)
    let style = flatten(getByTestId('hero-banner').props.style)
    expect(style.top).toBe(0)

    rerender(<Frame><Wrapper topOffset={42} /></Frame>)
    style = flatten(getByTestId('hero-banner').props.style)
    expect(style.top).toBe(42)
  })

  it('HeroBanner positions itself absolutely with the locked HERO_HEIGHT', () => {
    function Wrapper() {
      const scrollY = useSharedValue(0)
      return (
        <HeroBanner
          bannerUrl={null}
          isFavourited={false}
          onToggleFavourite={() => {}}
          onShare={() => {}}
          scrollY={scrollY}
        />
      )
    }
    const flatten = (s: unknown): Record<string, unknown> => {
      const arr = Array.isArray(s) ? s : [s]
      return Object.assign({}, ...arr.flat(Infinity).filter(Boolean) as object[])
    }
    const { getByTestId } = render(<Frame><Wrapper /></Frame>)
    const style = flatten(getByTestId('hero-banner').props.style)
    expect(style.position).toBe('absolute')
    expect(style.height).toBe(HERO_HEIGHT)
  })
})
