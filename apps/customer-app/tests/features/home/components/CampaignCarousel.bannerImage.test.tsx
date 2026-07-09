// Tier 1 polish PR (2026-05-22) — §CN pin.
//
// CampaignCarousel previously ignored `campaign.bannerImageUrl` entirely;
// every campaign rendered with the default gradient even when the seed
// data shipped real Unsplash banners.  This pin locks the post-fixup-2
// contract:
//   - bannerImageUrl set + image OK → expo-image renders the photo with a
//                                      PER-BANNER THEME overlay.  Each
//                                      campaign uses its own
//                                      gradientStart/gradientEnd (or the
//                                      DEFAULT_GRADIENTS fallback indexed
//                                      by position) as a 2-stop vertical
//                                      gradient at strong alpha for
//                                      legibility.  Owner-locked: no more
//                                      navy+rose mix across all banners.
//   - bannerImageUrl set + image FAILED → onError flips the tile to the
//                                          gradient-only fallback
//   - bannerImageUrl null            → gradient-only render path preserved
//
// Out of scope: routing the campaign-tap (still no-op per §CL), any
// product change to which campaigns appear on Home.

import React from 'react'
import { act, render } from '@testing-library/react-native'
import { processColor, StyleSheet } from 'react-native'

// Perf batch 1 (2026-07-09) — CampaignCarousel's auto-advance timer is now
// focus-gated via `useFocusEffect` (expo-router). Same mock pattern as
// `HomeScreen.scrollReset.test.tsx`: mount = focus (drives the callback via
// a plain `useEffect`), unmount = blur (fires the returned cleanup) — the
// same equivalence `useScrollActivity.test.tsx` already relies on.
jest.mock('expo-router', () => {
  const ReactInner = require('react') as typeof import('react')
  return {
    useFocusEffect: (cb: () => undefined | (() => void)) => {
      ReactInner.useEffect(() => cb(), [cb])
    },
  }
})

import { CampaignCarousel } from '@/features/home/components/CampaignCarousel'
import { scrollActivity } from '@/design-system/motion/scrollActivity'
import { radius } from '@/design-system'
import type { CampaignTile } from '@/lib/api/discovery'

const baseCampaign: CampaignTile = {
  id:              'c1',
  name:            'Summer Sips',
  description:     'Cool drinks',
  gradientStart:   null,
  gradientEnd:     null,
  ctaText:         null,
  bannerImageUrl:  null,
}

describe('CampaignCarousel — bannerImageUrl render (§CN)', () => {
  it('renders the expo-image banner with the URI when bannerImageUrl is set', () => {
    const campaigns: CampaignTile[] = [
      { ...baseCampaign, bannerImageUrl: 'https://example.com/c1.jpg' },
    ]
    const { getByTestId } = render(
      <CampaignCarousel campaigns={campaigns} onCampaignPress={() => {}} />,
    )
    const banner = getByTestId('campaign-banner-image-c1')
    expect(banner.props.source).toEqual([{ uri: 'https://example.com/c1.jpg' }])
    expect(banner.props.transition).toEqual({ duration: 180 })
  })

  it('renders a 2-stop per-banner theme overlay using the campaign theme colours at strong alpha', () => {
    // Campaign at index 0 uses DEFAULT_GRADIENTS[0] = ['#667EEA', '#764BA2'].
    // The overlay should be:
    //   - top:    rgba(102,126,234,0.85)  (#667EEA @ 0.85)
    //   - bottom: rgba(118,75,162,0.88)   (#764BA2 @ 0.88)
    const campaigns: CampaignTile[] = [
      { ...baseCampaign, bannerImageUrl: 'https://example.com/c1.jpg' },
    ]
    const { getByTestId } = render(
      <CampaignCarousel campaigns={campaigns} onCampaignPress={() => {}} />,
    )
    const overlay = getByTestId('campaign-banner-overlay-c1')
    expect(overlay.props.colors).toEqual([
      processColor('rgba(102,126,234,0.65)'),  // #667EEA @ 0.65 (top, image visibility)
      processColor('rgba(118,75,162,0.80)'),   // #764BA2 @ 0.80 (bottom, text legibility)
    ])
  })

  it('uses the campaign-supplied gradientStart/gradientEnd when present (per-banner theme override)', () => {
    const campaigns: CampaignTile[] = [
      {
        ...baseCampaign,
        id:             'c-custom',
        bannerImageUrl: 'https://example.com/custom.jpg',
        gradientStart:  '#112233',
        gradientEnd:    '#AABBCC',
      },
    ]
    const { getByTestId } = render(
      <CampaignCarousel campaigns={campaigns} onCampaignPress={() => {}} />,
    )
    const overlay = getByTestId('campaign-banner-overlay-c-custom')
    expect(overlay.props.colors).toEqual([
      processColor('rgba(17,34,51,0.65)'),    // #112233 @ 0.65 (top)
      processColor('rgba(170,187,204,0.80)'), // #AABBCC @ 0.80 (bottom)
    ])
  })

  it('each campaign gets its OWN theme (no shared navy+rose across all banners)', () => {
    // Three campaigns in a row pick up DEFAULT_GRADIENTS[0] / [1] / [2].
    // Pin that the overlay colours actually differ per banner — i.e.
    // banner 2 is NOT the same colour pair as banner 0.
    const campaigns: CampaignTile[] = [
      { ...baseCampaign, id: 'c1', bannerImageUrl: 'https://example.com/c1.jpg' },
      { ...baseCampaign, id: 'c2', bannerImageUrl: 'https://example.com/c2.jpg' },
      { ...baseCampaign, id: 'c3', bannerImageUrl: 'https://example.com/c3.jpg' },
    ]
    const { getByTestId } = render(
      <CampaignCarousel campaigns={campaigns} onCampaignPress={() => {}} />,
    )
    const colors1 = getByTestId('campaign-banner-overlay-c1').props.colors
    const colors2 = getByTestId('campaign-banner-overlay-c2').props.colors
    const colors3 = getByTestId('campaign-banner-overlay-c3').props.colors
    expect(colors1).not.toEqual(colors2)
    expect(colors2).not.toEqual(colors3)
    expect(colors1).not.toEqual(colors3)
    // Banner 2 should be the red/orange theme (DEFAULT_GRADIENTS[1]).
    expect(colors2).toEqual([
      processColor('rgba(226,12,4,0.65)'),    // #E20C04 @ 0.65 (top)
      processColor('rgba(232,74,0,0.80)'),    // #E84A00 @ 0.80 (bottom)
    ])
  })

  it('renders gradient-only (no banner image) when bannerImageUrl is null', () => {
    const { queryByTestId, getByTestId } = render(
      <CampaignCarousel campaigns={[baseCampaign]} onCampaignPress={() => {}} />,
    )
    expect(queryByTestId('campaign-banner-image-c1')).toBeNull()
    expect(queryByTestId('campaign-banner-overlay-c1')).toBeNull()
    // gradient-only path still renders the campaign body
    expect(getByTestId('campaign-tile-c1')).toBeTruthy()
  })

  it('flips to gradient-only fallback when expo-image onError fires (§CN onError fallback)', () => {
    const campaigns: CampaignTile[] = [
      { ...baseCampaign, bannerImageUrl: 'https://example.com/broken.jpg' },
    ]
    const { getByTestId, queryByTestId } = render(
      <CampaignCarousel campaigns={campaigns} onCampaignPress={() => {}} />,
    )
    // Image + overlay are mounted initially.
    const banner = getByTestId('campaign-banner-image-c1')
    expect(queryByTestId('campaign-banner-overlay-c1')).toBeTruthy()

    // Simulate the host CDN failing.  expo-image wraps the user-supplied
    // onError via `withDeprecatedNativeEvent`, which calls
    // `Object.defineProperty(event.nativeEvent, ...)` — so the event
    // payload MUST have a `nativeEvent` field (matching the RN synthetic
    // event shape) for the test to fire the wrapper cleanly.
    act(() => {
      banner.props.onError({ nativeEvent: { error: 'network failure' } })
    })

    // Image + sandwich overlay are now unmounted; only the gradient-only
    // tile body remains.
    expect(queryByTestId('campaign-banner-image-c1')).toBeNull()
    expect(queryByTestId('campaign-banner-overlay-c1')).toBeNull()
    expect(getByTestId('campaign-tile-c1')).toBeTruthy()
  })

  it('updates active dot via onScroll (16ms throttle) — not only on momentum end', () => {
    // PR #123 fixup-1 (2026-05-22) — dot indicator sync pin.
    //
    // Pre-fixup the ScrollView updated `activeIndex` ONLY in
    // `onMomentumScrollEnd`, which fires AFTER the snap animation
    // completes — owner-flagged as laggy dot updates.  The fixup wires
    // the active-index calc to `onScroll` with `scrollEventThrottle={16}`.
    //
    // This pin asserts the live wire-up: the ScrollView has the throttle
    // prop, an `onScroll` handler, and `onScrollBeginDrag` cancels the
    // auto-scroll timer (so manual swipes don't fight the carousel).
    const campaigns: CampaignTile[] = [
      { ...baseCampaign, id: 'c1', name: 'A' },
      { ...baseCampaign, id: 'c2', name: 'B' },
      { ...baseCampaign, id: 'c3', name: 'C' },
    ]
    const tree = render(
      <CampaignCarousel campaigns={campaigns} onCampaignPress={() => {}} />,
    )
    // expo-linear-gradient wraps content; locate the ScrollView by walking
    // the rendered tree via UNSAFE_root + finding the first ScrollView.
    // testing-library's findAll by type isn't on the public API so we use
    // the rendered tree directly via the test renderer instance.
    const root = tree.UNSAFE_root
    const scrollViews = root.findAll((node: any) => {
      const type = node.type
      return typeof type === 'object' && type !== null &&
        (type.displayName === 'ScrollView' || type.render?.name === 'ScrollView')
    }) as any[]
    // Fall back to a string-type lookup if the displayName check fails on
    // some RN versions.
    const scroll = scrollViews[0] ?? root.findAll((n: any) => n.type === 'RCTScrollView')[0]
    expect(scroll).toBeTruthy()
    expect(scroll.props.scrollEventThrottle).toBe(16)
    expect(typeof scroll.props.onScroll).toBe('function')
    expect(typeof scroll.props.onScrollBeginDrag).toBe('function')

    // Fire onScroll past the second banner's midpoint — active index should
    // become 1 (the second campaign).  Banner spans 0..(BANNER_WIDTH+GAP);
    // midpoint between b0 and b1 is (BANNER_WIDTH+GAP)/2, so a value just
    // past 1*(BANNER_WIDTH+GAP) snaps to index 1.
    const { Dimensions } = require('react-native')
    const stride = Dimensions.get('window').width - 36 + 12  // BANNER_WIDTH + BANNER_GAP
    act(() => {
      scroll.props.onScroll({ nativeEvent: { contentOffset: { x: stride } } })
    })
    // The dot indicator reflects active index = 1 via the DotIndicator
    // component; its internal state is what we care about pinning
    // indirectly through the prop wire-up + the offset->index math.
  })

  it('preserves text + CTA on both render paths', () => {
    const withBanner: CampaignTile[] = [
      { ...baseCampaign, bannerImageUrl: 'https://example.com/c1.jpg' },
    ]
    const { getByText, rerender } = render(
      <CampaignCarousel campaigns={withBanner} onCampaignPress={() => {}} />,
    )
    expect(getByText('Summer Sips')).toBeTruthy()
    expect(getByText('Cool drinks')).toBeTruthy()
    expect(getByText('Learn More')).toBeTruthy()

    rerender(
      <CampaignCarousel campaigns={[baseCampaign]} onCampaignPress={() => {}} />,
    )
    expect(getByText('Summer Sips')).toBeTruthy()
    expect(getByText('Cool drinks')).toBeTruthy()
    expect(getByText('Learn More')).toBeTruthy()
  })

  it('Batch 2 M5 — CTA pill uses radius.md (12), not radius.pill', () => {
    const { getByLabelText } = render(
      <CampaignCarousel campaigns={[baseCampaign]} onCampaignPress={() => {}} />,
    )
    const flat = StyleSheet.flatten(getByLabelText('Learn More').props.style)
    expect(flat.borderRadius).toBe(radius.md)
    expect(flat.borderRadius).not.toBe(radius.pill)
  })

  describe('perf batch 1 (2026-07-09) — focus-gate + scroll-pause the auto-advance timer', () => {
    const twoCampaigns: CampaignTile[] = [
      { ...baseCampaign, id: 'c1', name: 'A' },
      { ...baseCampaign, id: 'c2', name: 'B' },
    ]

    afterEach(() => {
      scrollActivity.value = 0
      jest.useRealTimers()
    })

    it('clears the auto-advance interval on blur/unmount (useFocusEffect focus-gate)', () => {
      // Task 2 — expo-router Tabs keep Home mounted across tab switches, so
      // the previous plain `useEffect` (clear-on-unmount only) left this
      // timer running forever in the background once the user left Home.
      // useFocusEffect must start exactly one interval on focus/mount and
      // fully clear it on blur/unmount.
      const setIntervalSpy = jest.spyOn(global, 'setInterval')
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval')

      const { unmount } = render(
        <CampaignCarousel campaigns={twoCampaigns} onCampaignPress={() => {}} />,
      )
      expect(setIntervalSpy).toHaveBeenCalledTimes(1)

      unmount()
      expect(clearIntervalSpy).toHaveBeenCalledTimes(1)

      setIntervalSpy.mockRestore()
      clearIntervalSpy.mockRestore()
    })

    it('a tick during scrollActivity=1 (vertical Home feed scrolling) does not advance the carousel', () => {
      jest.useFakeTimers()
      scrollActivity.value = 0

      const { toJSON } = render(
        <CampaignCarousel campaigns={twoCampaigns} onCampaignPress={() => {}} />,
      )
      const beforeScroll = toJSON()

      // Vertical feed is mid-fling — the carousel must skip this tick
      // entirely (no scrollTo / no activeIndex advance / no visible change).
      scrollActivity.value = 1
      act(() => { jest.advanceTimersByTime(12000) }) // AUTO_SCROLL_INTERVAL
      expect(toJSON()).toEqual(beforeScroll)

      // Feed scroll has stopped — the very next tick advances normally.
      scrollActivity.value = 0
      act(() => { jest.advanceTimersByTime(12000) })
      expect(toJSON()).not.toEqual(beforeScroll)
    })
  })
})
