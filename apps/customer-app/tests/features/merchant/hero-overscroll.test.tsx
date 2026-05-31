import React from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useSharedValue } from 'react-native-reanimated'
import {
  HeroBackdrop,
  HeroNav,
  HeroBannerSpacer,
  HERO_HEIGHT,
} from '@/features/merchant/components/HeroSection'

// Phase 3C.1g M2.9 — HeroNav now renders `<FavouriteHeart>` which
// needs a `<QueryClientProvider>` in scope.  Pass the provider via
// rtl's `wrapper` option so `rerender(...)` also runs inside it —
// critical for the heart-label-flip test that re-renders with a
// flipped `fav` prop.
function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
  return rtlRender(node, { wrapper: Wrapper })
}

// expo-router ships ESM-only on jest in this project; mock just the
// surface HeroNav uses. The back button reads `useRouter().back`
// when pressed; tests here don't fire the press, so a no-op stub is fine.
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}))

// Pin safe-area metrics so `useSafeAreaInsets()` resolves under jest
// without depending on the device-frame measurement that
// react-native-safe-area-context normally awaits. Values mimic an
// iPhone 14 Pro (Dynamic Island ≈ 59pt top inset) so any inset-
// sensitive layout regression in the merchant-profile header chrome
// surfaces during M2 implementation.
const initialMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

function Frame({ children }: { children: React.ReactNode }) {
  return <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
}

function flatten(s: unknown): Record<string, unknown> {
  const arr = Array.isArray(s) ? s : [s]
  return Object.assign({}, ...arr.flat(Infinity).filter(Boolean) as object[])
}

// M1.1 — structural tests for the split-and-zoom header refactor.
//
// HeroSection now exports three components:
//   • <HeroBackdrop>: absolute, mounted BEFORE scrollWrap in JSX
//     (renders BEHIND scroll content in z-order — preserves logo
//     visibility at the banner/cream boundary). Animates `height`
//     on overscroll so `contentFit="cover"` produces a uniform
//     parallax zoom (no Y-only rubber-band stretch).
//   • <HeroNav>: absolute, mounted AFTER scrollWrap in JSX (renders
//     ABOVE scroll content in z-order — back/share/heart stay
//     tappable). pointerEvents="box-none" so non-button taps pass
//     through to the scroll wrap.
//   • <HeroBannerSpacer>: in-flow placeholder. pointerEvents="none".
//
// End-to-end stretch correctness (the actual height growth on
// overscroll) is on-device QA. Tests below pin the structural
// contracts that the screen-scrolling integration depends on.
describe('Hero header components (M1.1 — split + parallax zoom)', () => {
  describe('HERO_HEIGHT', () => {
    it('exports the locked design value (256pt — M1.2 +15% bump)', () => {
      expect(HERO_HEIGHT).toBe(256)
    })
  })

  describe('HeroBannerSpacer', () => {
    it('renders a placeholder element with the test id', () => {
      const { getByTestId } = render(<Frame><HeroBannerSpacer /></Frame>)
      expect(getByTestId('hero-banner-spacer')).toBeTruthy()
    })

    it('has pointerEvents="none" so taps pass through to scroll/pan', () => {
      const { getByTestId } = render(<Frame><HeroBannerSpacer /></Frame>)
      const spacer = getByTestId('hero-banner-spacer')
      expect(spacer.props.pointerEvents).toBe('none')
    })
  })

  describe('HeroBackdrop', () => {
    function Wrapper(props: { topOffset?: number; bannerUrl?: string | null }) {
      const scrollY = useSharedValue(0)
      const baseProps = {
        bannerUrl: props.bannerUrl ?? null,
        scrollY,
      }
      return props.topOffset === undefined
        ? <HeroBackdrop {...baseProps} />
        : <HeroBackdrop {...baseProps} topOffset={props.topOffset} />
    }

    it('mounts with the hero-backdrop test id', () => {
      const { getByTestId } = render(<Frame><Wrapper /></Frame>)
      expect(getByTestId('hero-backdrop')).toBeTruthy()
    })

    it('is positioned absolutely at the locked HERO_HEIGHT', () => {
      const { getByTestId } = render(<Frame><Wrapper /></Frame>)
      const style = flatten(getByTestId('hero-backdrop').props.style)
      expect(style.position).toBe('absolute')
      expect(style.height).toBe(HERO_HEIGHT)
    })

    it('has overflow:hidden so the cover image is clipped to the box', () => {
      const { getByTestId } = render(<Frame><Wrapper /></Frame>)
      const style = flatten(getByTestId('hero-backdrop').props.style)
      expect(style.overflow).toBe('hidden')
    })

    it('has pointerEvents="none" so it never intercepts taps', () => {
      const { getByTestId } = render(<Frame><Wrapper /></Frame>)
      expect(getByTestId('hero-backdrop').props.pointerEvents).toBe('none')
    })

    it('applies topOffset to its outer style (default 0)', () => {
      const { getByTestId, rerender } = render(<Frame><Wrapper /></Frame>)
      let style = flatten(getByTestId('hero-backdrop').props.style)
      expect(style.top).toBe(0)

      rerender(<Frame><Wrapper topOffset={42} /></Frame>)
      style = flatten(getByTestId('hero-backdrop').props.style)
      expect(style.top).toBe(42)
    })
  })

  describe('HeroNav', () => {
    function Wrapper(props: { fav?: boolean; topOffset?: number }) {
      const scrollY = useSharedValue(0)
      // Phase 3C.1g M2.9 — props renamed to the branch-keyed contract
      // (branchId / branchIsFavourited / merchantId).  `fav` continues
      // to drive the heart state via `branchIsFavourited`.
      const baseProps = {
        branchId:           'br-test',
        branchIsFavourited: props.fav ?? false,
        merchantId:         'm-test',
        onShare:            () => {},
        scrollY,
      }
      return props.topOffset === undefined
        ? <HeroNav {...baseProps} />
        : <HeroNav {...baseProps} topOffset={props.topOffset} />
    }

    it('mounts with the hero-nav test id', () => {
      const { getByTestId } = render(<Frame><Wrapper /></Frame>)
      expect(getByTestId('hero-nav')).toBeTruthy()
    })

    it('has pointerEvents="box-none" so non-button taps pass through', () => {
      const { getByTestId } = render(<Frame><Wrapper /></Frame>)
      expect(getByTestId('hero-nav').props.pointerEvents).toBe('box-none')
    })

    it('exposes back, share, and heart accessibility actions', () => {
      const { getByLabelText } = render(<Frame><Wrapper /></Frame>)
      expect(getByLabelText('Go back')).toBeTruthy()
      expect(getByLabelText('Share merchant')).toBeTruthy()
      expect(getByLabelText('Add to favourites')).toBeTruthy()
    })

    it('heart label flips between Add and Remove based on isFavourited', () => {
      const { getByLabelText, rerender } = render(<Frame><Wrapper fav={false} /></Frame>)
      expect(getByLabelText('Add to favourites')).toBeTruthy()
      rerender(<Frame><Wrapper fav={true} /></Frame>)
      expect(getByLabelText('Remove from favourites')).toBeTruthy()
    })

    // Position math: top = topOffset + insets.top + 8.
    // Pinned safe-area metrics: insets.top = 59 (iPhone 14 Pro DI).
    it('positions the nav row below the safe-area top inset', () => {
      const { getByTestId } = render(<Frame><Wrapper /></Frame>)
      const style = flatten(getByTestId('hero-nav').props.style)
      // Expected: 0 (default topOffset) + 59 (DI inset) + 8 (gap) = 67
      expect(style.top).toBe(67)
    })

    it('shifts down by topOffset when SuspendedBranchBanner is visible', () => {
      const { getByTestId } = render(<Frame><Wrapper topOffset={50} /></Frame>)
      const style = flatten(getByTestId('hero-nav').props.style)
      // Expected: 50 (sbb height) + 59 (DI inset) + 8 (gap) = 117
      expect(style.top).toBe(117)
    })
  })
})
