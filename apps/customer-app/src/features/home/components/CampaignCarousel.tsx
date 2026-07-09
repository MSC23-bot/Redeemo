import React, { useRef, useState, useCallback } from 'react'
import { View, ScrollView, Dimensions, TouchableOpacity, StyleSheet } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { Image } from 'expo-image'
import { Text, color, spacing, radius } from '@/design-system'
import { DotIndicator } from '@/features/shared/DotIndicator'
import { scrollActivity } from '@/design-system/motion/scrollActivity'

const SCREEN_WIDTH = Dimensions.get('window').width
const BANNER_WIDTH = SCREEN_WIDTH - 36
const BANNER_GAP = 12
const AUTO_SCROLL_INTERVAL = 12000

const DEFAULT_GRADIENTS: [string, string][] = [
  ['#667EEA', '#764BA2'],
  ['#E20C04', '#E84A00'],
  ['#11998E', '#38EF7D'],
]

// PR #123 fixup-2 (2026-05-22) — per-banner theme overlay.
//
// Convert a `#RRGGBB` hex colour to `rgba(r,g,b,a)`.  Used for the banner
// overlay: each campaign gets a single-colour vertical gradient overlay
// keyed to its own theme (gradientStart / gradientEnd, or the
// DEFAULT_GRADIENTS fallback indexed by position).  Strong alpha at top
// AND bottom drives white-text legibility; the photo shows through
// where the alpha is lowest.
function withAlpha(hex: string, alpha: number): string {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// Campaign tile shape — sourced from the backend home-feed response.
// Field name is `bannerImageUrl` (Prisma column), NOT the older `bannerUrl`.
// gradientStart/gradientEnd/ctaText are not currently emitted by the
// backend select; treated as optional for forward compatibility.
import type { CampaignTile } from '@/lib/api/discovery'

type Props = {
  campaigns: CampaignTile[]
  onCampaignPress: (id: string) => void
}

// Perf batch 1 (2026-07-09) — React.memo'd: HomeScreen passes a stable
// (useCallback) `onCampaignPress`, and `campaigns` only changes when the
// feed's campaigns list itself changes, so this carousel (and its own 12s
// auto-advance timer — see Task 2) skips re-rendering on unrelated
// HomeScreen state churn.
export const CampaignCarousel = React.memo(function CampaignCarousel({ campaigns, onCampaignPress }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  // PR #123 fixup-1 (2026-05-22) — §CN onError fallback.
  // When expo-image fails to load (network error, host CDN issue, etc.),
  // we flip the tile back to gradient-only mode by tracking the
  // campaign ids that have errored.  Closes the wording vs implementation
  // gap caught in PR #123 review.
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set())
  const scrollRef = useRef<ScrollView>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const scrollToIndex = useCallback((index: number) => {
    const clampedIndex = Math.max(0, Math.min(index, campaigns.length - 1))
    scrollRef.current?.scrollTo({
      x: clampedIndex * (BANNER_WIDTH + BANNER_GAP),
      animated: true,
    })
    setActiveIndex(clampedIndex)
  }, [campaigns.length])

  const startAutoScroll = useCallback(() => {
    if (campaigns.length <= 1) return
    timerRef.current = setInterval(() => {
      // Perf batch 1 (2026-07-09) — skip this tick while the vertical Home
      // feed is actively scrolling (module-level `scrollActivity` flag,
      // flipped by HomeScreen's scroll handlers). This carousel's own
      // onScrollBeginDrag below already cancels the timer for its OWN
      // horizontal drag; this guard additionally stops it firing mid-fling
      // on the outer vertical feed scroll.
      if (scrollActivity.value === 1) return
      setActiveIndex((prev) => {
        const next = (prev + 1) % campaigns.length
        scrollRef.current?.scrollTo({
          x: next * (BANNER_WIDTH + BANNER_GAP),
          animated: true,
        })
        return next
      })
    }, AUTO_SCROLL_INTERVAL)
  }, [campaigns.length])

  // Perf batch 1 (2026-07-09) — focus-gate the auto-advance timer.
  // expo-router Tabs keep Home mounted across tab switches, so the previous
  // plain `useEffect` (which only cleared on UNMOUNT) left this 12s interval
  // running forever in the background once the user left the Home tab.
  // `useFocusEffect` starts it fresh on every focus and fully clears it on
  // blur.
  useFocusEffect(
    useCallback(() => {
      startAutoScroll()
      return () => {
        if (timerRef.current) clearInterval(timerRef.current)
      }
    }, [startAutoScroll])
  )

  if (campaigns.length === 0) return null

  // PR #123 fixup-1 (2026-05-22) — dot indicator sync fix.
  // The previous `onMomentumScrollEnd`-only handler updated the active
  // index only AFTER the snap animation completed, which felt laggy on
  // manual swipes.  Switching to `onScroll` with 16ms throttle lets the
  // dot track the actual visible banner.  Auto-scroll timer reset stays
  // on `onScrollBeginDrag` so the user's manual interaction always wins.
  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={false}
        snapToInterval={BANNER_WIDTH + BANNER_GAP}
        snapToAlignment="start"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: 18, gap: BANNER_GAP }}
        onScrollBeginDrag={() => {
          // Cancel the auto-scroll timer the moment the user starts dragging
          // so the carousel doesn't fight the interaction.
          if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
          }
        }}
        onScroll={(e) => {
          const offsetX = e.nativeEvent.contentOffset.x
          const index = Math.max(
            0,
            Math.min(
              campaigns.length - 1,
              Math.round(offsetX / (BANNER_WIDTH + BANNER_GAP)),
            ),
          )
          setActiveIndex((prev) => (prev === index ? prev : index))
        }}
        onMomentumScrollEnd={() => {
          // Restart auto-scroll only once momentum has settled.
          if (timerRef.current === null) startAutoScroll()
        }}
      >
        {campaigns.map((campaign, i) => {
          const fallbackIndex = i % DEFAULT_GRADIENTS.length
          const fallback = DEFAULT_GRADIENTS[fallbackIndex] as [string, string]
          const gradientStart = campaign.gradientStart ?? fallback[0]
          const gradientEnd = campaign.gradientEnd ?? fallback[1]

          // PR #123 fixup-2 (2026-05-22) — per-banner theme overlay.
          //
          // Each campaign now renders its banner photo under a SINGLE-
          // COLOUR vertical gradient using its OWN theme colours (the
          // pair already used for the gradient-only fallback path).  No
          // more navy+rose mix across all banners — every banner is
          // tinted to its own theme, and the tint is itself a vertical
          // gradient (theme start at top → theme end at bottom) with
          // strong alpha at both ends for white-text legibility.
          //
          // Effect:
          //   - Campaign 1 (blue/purple theme) banners read blue→purple.
          //   - Campaign 2 (red/orange theme) banners read red→orange.
          //   - Campaign 3 (teal/green theme) banners read teal→green.
          //   - Each banner FEELS its own theme; the photo is visible
          //     through the gradient but never overwhelms the text.
          //
          // Gradient-only fallback path runs when:
          //   (a) the campaign has no bannerImageUrl at all, OR
          //   (b) expo-image's onError fired (network / host failure).
          const hasBanner = !!campaign.bannerImageUrl && !failedIds.has(campaign.id)
          // 2-stop overlay — theme[0]→theme[1].  Alpha is asymmetric:
          // lighter at the top so the photo is clearly visible behind
          // the title; stronger at the bottom where the description +
          // CTA sit and white text needs the contrast.
          //
          // PR #123 fixup-3 (2026-05-22) — owner Option A: previous
          // uniform 0.85/0.88 made the photo feel hidden.  Top alpha
          // dropped to 0.65 (~24% less); bottom held at 0.80 (~9% less)
          // to keep CTA legibility safe.  Per-banner theme + gradient
          // direction unchanged.
          const overlayTop    = withAlpha(gradientStart, 0.65)
          const overlayBottom = withAlpha(gradientEnd,   0.80)

          const body = (
            <>
              <Text
                variant="heading.md"
                style={{ color: '#FFFFFF', marginBottom: spacing[1] }}
              >
                {campaign.name}
              </Text>
              {campaign.description && (
                <Text
                  variant="body.sm"
                  style={{ color: 'rgba(255,255,255,0.85)', marginBottom: spacing[3] }}
                >
                  {campaign.description}
                </Text>
              )}
              <TouchableOpacity
                onPress={() => onCampaignPress(campaign.id)}
                style={{
                  alignSelf: 'flex-start',
                  backgroundColor: '#FFFFFF',
                  paddingHorizontal: spacing[4],
                  paddingVertical: spacing[2],
                  // Batch 2 M5 — CTA pill radius.pill → radius.md (spec §9.2;
                  // corrects the button-radius-rule violation).
                  borderRadius: radius.md,
                }}
                accessibilityLabel={campaign.ctaText ?? 'Learn More'}
              >
                <Text
                  variant="label.md"
                  style={{ color: color.navy, fontFamily: 'Lato-Bold', fontSize: 12 }}
                >
                  {campaign.ctaText ?? 'Learn More'}
                </Text>
              </TouchableOpacity>
            </>
          )

          if (hasBanner) {
            return (
              <View
                key={campaign.id}
                testID={`campaign-tile-${campaign.id}`}
                style={{
                  width: BANNER_WIDTH,
                  minHeight: 156,
                  borderRadius: radius.lg,
                  padding: spacing[5],
                  justifyContent: 'flex-end',
                  overflow: 'hidden',
                  backgroundColor: '#FFF6EE',
                }}
              >
                <Image
                  testID={`campaign-banner-image-${campaign.id}`}
                  source={{ uri: campaign.bannerImageUrl as string }}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                  transition={180}
                  recyclingKey={campaign.id}
                  onError={() => {
                    setFailedIds((prev) => {
                      if (prev.has(campaign.id)) return prev
                      const next = new Set(prev)
                      next.add(campaign.id)
                      return next
                    })
                  }}
                />
                <LinearGradient
                  testID={`campaign-banner-overlay-${campaign.id}`}
                  // Per-banner theme — vertical 2-stop gradient using
                  // the campaign's own theme colours at strong alpha.
                  // The gradient comes from theme[0]→theme[1]; alpha
                  // stays high enough at both ends to keep white text
                  // legible on bright photos.
                  colors={[overlayTop, overlayBottom]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                {body}
              </View>
            )
          }

          return (
            <LinearGradient
              key={campaign.id}
              testID={`campaign-tile-${campaign.id}`}
              colors={[gradientStart, gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: BANNER_WIDTH,
                minHeight: 156,
                borderRadius: radius.lg,
                padding: spacing[5],
                justifyContent: 'flex-end',
              }}
            >
              {body}
            </LinearGradient>
          )
        })}
      </ScrollView>

      {campaigns.length > 1 && (
        <DotIndicator count={campaigns.length} activeIndex={activeIndex} />
      )}
    </View>
  )
})
