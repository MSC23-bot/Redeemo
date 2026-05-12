import React, { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { useMotionScale } from '@/design-system/useMotionScale'
import { PulsingDot } from '@/design-system/motion/PulsingDot'
import type { WindowState } from '@/features/voucher/utils/timeLimitedWindow'
import {
  formatDuration,
  formatSupportingClock,
  formatDayName,
  formatClosingA11y,
  formatOpeningA11y,
  formatAvailableAgainA11y,
} from '@/features/voucher/utils/countdownFormat'

/**
 * M4d hero-mounted status block for TIME_LIMITED vouchers, extended in
 * M5 Task 8 to cover REUSABLE cooldown states.
 *
 * Per spec D3 amendment 2026-05-11: duration-first primary,
 * clock-time supporting. Mounts inside <CouponHeader> below the title
 * (Phase C wiring). Renders a frosted card over the voucher's
 * type-coloured gradient.
 *
 * State handling (TL wording amendment 2026-05-11 D1/D2/D3/D4 +
 * REUSABLE amendment 2026-05-12 D21/D38):
 *   • active           → eyebrow "Available now"        | primary closing duration   | supporting "Window ends … today"
 *   • urgent           → eyebrow "Ending soon"          | primary closing duration   | supporting "Window ends … today"
 *   • unavailable-today
 *       ≥1h to open    → eyebrow "Available later today"| primary opening duration   | supporting "Available from … today"
 *       <1h to open    → eyebrow "Available soon"       | primary opening duration   | supporting "Available from … today"
 *   • unavailable-future-day
 *       ≥1h to open    → eyebrow "Available <Day>"      | primary opening duration   | supporting "Available from <Day> …" or "Available from … tomorrow"
 *       <1h to open    → eyebrow "Available soon"       | primary opening duration   | supporting "Available from … tomorrow"  (midnight-cross)
 *   • redeemed-this-window
 *       ≥1h to next    → eyebrow "Available again"      | primary available-again    | supporting "Available again from … "
 *       <1h to next    → eyebrow "Available soon"       | primary available-again    | supporting "Available again from … "
 *   • reusable-available → eyebrow "Available now"      | primary suppressed         | supporting suppressed                  (M5 Task 8)
 *   • reusable-cooldown  → eyebrow "Available again"    | primary cooldown duration  | supporting "Available again from … "   (M5 Task 8)
 *   • no-windows / expired → render null
 *
 * Progress bar is suppressed for REUSABLE states (no meaningful
 * denominator — spec D21). A11y live-region for REUSABLE cooldown uses
 * formatAvailableAgainA11y for <1h bands; ≥1h band uses the eyebrow
 * "Available again" verbatim (D38 — NO "Voucher " prefix).
 */

export type HeroStatusBlockState = WindowState | 'redeemed-this-window' | 'expired'

export type HeroStatusBlockProps = {
  windowState: HeroStatusBlockState
  /** Captured at parent render time so tests are deterministic. */
  now: Date
  /** Required for active/urgent + progress bar's elapsed-time numerator (B.2). */
  currentWindowStartsAt: Date | null
  /** Required for active/urgent supporting line + progress bar (B.2). */
  currentWindowEndsAt: Date | null
  /** Required for unavailable-* + redeemed-this-window supporting/eyebrow. */
  nextWindowStartsAt: Date | null
  /** ms to currentWindow.endsAt; drives closing primary + per-second tick (B.2). */
  msToClose: number | null
  /** ms to nextWindow.startsAt; drives opening/available-again primary + tick. */
  msToOpen: number | null
}

const ONE_HOUR_MS = 3_600_000
const FIFTEEN_MIN_MS = 15 * 60_000
const SIXTY_MIN_MS = 60 * 60_000
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60_000

export function HeroStatusBlock(props: HeroStatusBlockProps) {
  const { windowState } = props

  if (windowState === 'no-windows' || windowState === 'expired') return null

  const content = deriveContent(props)
  if (!content) return null  // defensive — null required inputs for an otherwise renderable state

  const bar = deriveProgressBar(props)
  const underOneHourTick = isUnderOneHourTick(props)
  const liveLabel = deriveLiveRegionLabel(props, content)

  // M5 Gate E polish (Issue 4 + 2026-05-12 follow-up) — REUSABLE-available
  // hybrid alive treatment per owner Direction C.
  //
  // Two coordinated signals on REUSABLE-AVAILABLE only:
  //   (a) Warm-cream breathing border ring around the hero card. Cream
  //       reads against ANY voucher gradient (the previous green ring
  //       was camouflaged on REUSABLE's mint-teal background).
  //   (b) Small green <PulsingDot> rendered INLINE with the eyebrow as
  //       a localised trust-signal point, mirroring the M3 ShowToStaff
  //       LIVE-dot pattern.
  //
  // Cooldown stays calm/neutral; TL active/urgent are unaffected — they
  // already carry urgency in their eyebrow + progress bar colour bands.
  // Reduce-motion → static visible ring + PulsingDot internally snaps
  // to its own static state via useMotionScale.
  const isAlive = windowState === 'reusable-available'

  return (
    <View testID="hero-status-block" style={styles.root}>
      {isAlive ? <AliveRing /> : null}
      <View style={styles.eyebrowRow}>
        {isAlive ? (
          <PulsingDot
            testID="hero-status-eyebrow-pulsing-dot"
            color="#34D399"
            size={7}
            style={styles.eyebrowDot}
          />
        ) : null}
        <Text testID="hero-status-eyebrow" variant="label.eyebrow" style={styles.eyebrow}>
          {content.eyebrow}
        </Text>
      </View>
      {/* primary + supporting are suppressed (not rendered) when the
          deriveContent branch returns empty strings — currently only the
          REUSABLE-AVAILABLE state (M5 Task 8). */}
      {content.primary !== '' ? (
        <Text
          testID="hero-status-primary"
          variant="display.sm"
          style={styles.primary}
          accessibilityElementsHidden={underOneHourTick || undefined}
          importantForAccessibility={underOneHourTick ? 'no-hide-descendants' : undefined}
        >
          {content.primary}
        </Text>
      ) : null}
      {content.supporting !== '' ? (
        <Text testID="hero-status-supporting" variant="body.sm" style={styles.supporting}>
          {content.supporting}
        </Text>
      ) : null}
      {bar ? (
        <View testID="hero-status-progress-bar" style={styles.barTrack}>
          <View
            testID="hero-status-progress-bar-fill"
            style={{
              height: '100%',
              borderRadius: 2,
              width: `${bar.widthPct}%`,
              backgroundColor: bar.color,
            }}
          />
        </View>
      ) : null}
      {liveLabel !== null ? (
        <View
          testID="hero-status-live-region"
          accessibilityLiveRegion="polite"
          accessibilityLabel={liveLabel}
          style={styles.liveRegionHidden}
        />
      ) : null}
    </View>
  )
}

/**
 * Per spec D10 amendment: the visible per-second tick fires whenever
 * either countdown is under one hour. Mirror that gate to decide when
 * the primary Text should be hidden from the a11y tree (live region
 * carries the coarse stable announcement instead).
 */
function isUnderOneHourTick(props: HeroStatusBlockProps): boolean {
  const { msToClose, msToOpen } = props
  return (
    (msToClose !== null && msToClose > 0 && msToClose < ONE_HOUR_MS) ||
    (msToOpen !== null && msToOpen > 0 && msToOpen < ONE_HOUR_MS)
  )
}

/**
 * Stable coarse a11y label for the polite live region per spec D10
 * amendment 2026-05-11.
 *
 *   • <1m   → "<verb> in under a minute"
 *   • <1h ≥1m → "<verb> in about N minutes"  (N rounded)
 *   • ≥1h   → eyebrow text as label
 *
 * For ≥1h active the eyebrow is "Available now" → label "Voucher
 * available now". For ≥1h opening / available-again the eyebrow is
 * already the natural announcement ("Available later today" /
 * "Available tomorrow" / "Available <Weekday>" / "Available again") so
 * it's used verbatim (TL wording amendment 2026-05-11).
 *
 * Returns null when no label should be announced (hidden states,
 * defensive null inputs).
 */
function deriveLiveRegionLabel(props: HeroStatusBlockProps, content: Content): string | null {
  const { windowState, msToClose, msToOpen } = props

  if (windowState === 'no-windows' || windowState === 'expired') return null

  // Closing direction (active / urgent).
  if (windowState === 'active' || windowState === 'urgent') {
    if (msToClose === null) return null
    const coarse = formatClosingA11y(msToClose)
    if (coarse !== null) return coarse
    // ≥1h band: eyebrow-as-label, prefixed with "Voucher " for clarity.
    return `Voucher ${content.eyebrow.toLowerCase()}`
  }

  // Opening direction (unavailable-today / unavailable-future-day).
  if (windowState === 'unavailable-today' || windowState === 'unavailable-future-day') {
    if (msToOpen === null) return null
    const coarse = formatOpeningA11y(msToOpen)
    if (coarse !== null) return coarse
    // ≥1h band: use the eyebrow directly ("Available later today" /
    // "Available tomorrow" / "Available <Weekday>").
    return content.eyebrow
  }

  // Available-again direction (redeemed-this-window).
  if (windowState === 'redeemed-this-window') {
    if (msToOpen === null) return null
    const coarse = formatAvailableAgainA11y(msToOpen)
    if (coarse !== null) return coarse
    // ≥1h band: eyebrow is "Available again".
    return content.eyebrow
  }

  // REUSABLE cooldown (M5 Task 8): mirror the available-again live-region
  // logic. ≥1h band uses the eyebrow "Available again" verbatim, with NO
  // "Voucher " prefix per D38.
  if (windowState === 'reusable-cooldown') {
    if (msToOpen === null) return null
    const coarse = formatAvailableAgainA11y(msToOpen)
    if (coarse !== null) return coarse
    return content.eyebrow  // "Available again"
  }

  // REUSABLE-AVAILABLE (M5 Task 8): primary + supporting are suppressed,
  // so there is nothing meaningful to announce. The eyebrow itself is
  // surfaced visually; no polite live region is rendered.
  if (windowState === 'reusable-available') {
    return null
  }

  return null
}

type BarSpec = { widthPct: number; color: string } | null

function deriveProgressBar(props: HeroStatusBlockProps): BarSpec {
  const { windowState, currentWindowStartsAt, currentWindowEndsAt, msToClose, msToOpen } = props

  // REUSABLE states have no meaningful denominator — spec D21. Suppress
  // the progress bar before any other derivation.
  if (windowState === 'reusable-available' || windowState === 'reusable-cooldown') {
    return null
  }

  // Hidden states.
  if (
    windowState === 'no-windows' ||
    windowState === 'expired' ||
    windowState === 'redeemed-this-window'
  ) {
    return null
  }

  // Closing direction (active / urgent) — bar FILLS left→right toward
  // the window's end. Progress = elapsed / total, so "Ending soon"
  // reads as a near-full bar, not a near-empty one (QA fix 2026-05-11:
  // the previous remaining/total numerator made a 32m-of-3h window
  // render at ~18% fill, visually contradicting the "Ending soon"
  // eyebrow). Colour bands (below) carry the urgency signal.
  if (windowState === 'active' || windowState === 'urgent') {
    if (!currentWindowStartsAt || !currentWindowEndsAt || msToClose === null) return null
    const totalMs = currentWindowEndsAt.getTime() - currentWindowStartsAt.getTime()
    if (totalMs <= 0) return null
    const elapsedMs = totalMs - msToClose
    const widthPct = Math.max(0, Math.min(100, Math.round((elapsedMs / totalMs) * 100)))
    // Colour bands by msToClose (NOT by widthPct):
    //   > 60min → green (active)
    //   ≤ 60min, > 15min → amber (urgent)
    //   ≤ 15min → coral (urgent terminal)
    let color = '#34D399'  // green
    if (msToClose <= FIFTEEN_MIN_MS) color = '#FB7185'         // coral
    else if (msToClose <= SIXTY_MIN_MS) color = '#FBBF24'     // amber
    return { widthPct, color }
  }

  // Opening direction (unavailable-*) — bar fills left→right.
  // Width = 1 - (msToOpen / 24h), capped at [0, 100].
  if (msToOpen === null || msToOpen <= 0) return null
  const fillPct = Math.max(0, Math.min(100, Math.round((1 - msToOpen / TWENTY_FOUR_HOURS_MS) * 100)))
  return { widthPct: fillPct, color: 'rgba(255,255,255,0.65)' }
}

type Content = { eyebrow: string; primary: string; supporting: string }

function deriveContent(props: HeroStatusBlockProps): Content | null {
  const { windowState, now, currentWindowEndsAt, nextWindowStartsAt, msToClose, msToOpen } = props

  switch (windowState) {
    case 'active': {
      if (currentWindowEndsAt === null || msToClose === null) return null
      return {
        eyebrow:    'Available now',
        primary:    formatDuration(msToClose),
        supporting: formatSupportingClock(currentWindowEndsAt, now, 'Window ends'),
      }
    }
    case 'urgent': {
      if (currentWindowEndsAt === null || msToClose === null) return null
      return {
        eyebrow:    'Ending soon',
        primary:    formatDuration(msToClose),
        supporting: formatSupportingClock(currentWindowEndsAt, now, 'Window ends'),
      }
    }
    case 'unavailable-today': {
      if (nextWindowStartsAt === null || msToOpen === null) return null
      const eyebrow = msToOpen < ONE_HOUR_MS ? 'Available soon' : 'Available later today'
      return {
        eyebrow,
        primary:    formatDuration(msToOpen),
        supporting: formatSupportingClock(nextWindowStartsAt, now, 'Available from'),
      }
    }
    case 'unavailable-future-day': {
      if (nextWindowStartsAt === null || msToOpen === null) return null
      const eyebrow = msToOpen < ONE_HOUR_MS
        ? 'Available soon'
        : `Available ${eyebrowDayLabel(nextWindowStartsAt, now)}`
      return {
        eyebrow,
        primary:    formatDuration(msToOpen),
        supporting: formatSupportingClock(nextWindowStartsAt, now, 'Available from'),
      }
    }
    case 'redeemed-this-window': {
      if (nextWindowStartsAt === null || msToOpen === null) return null
      const eyebrow = msToOpen < ONE_HOUR_MS ? 'Available soon' : 'Available again'
      return {
        eyebrow,
        primary:    formatDuration(msToOpen),
        supporting: formatSupportingClock(nextWindowStartsAt, now, 'Available again from'),
      }
    }
    case 'reusable-available': {
      // REUSABLE-AVAILABLE (M5 Task 8): eyebrow-only. Primary + supporting
      // intentionally suppressed — the voucher is redeemable now and the
      // sticky Redeem CTA carries the action; the hero just confirms
      // availability without a countdown line.
      return { eyebrow: 'Available now', primary: '', supporting: '' }
    }
    case 'reusable-cooldown': {
      // REUSABLE-COOLDOWN (M5 Task 8): primary = countdown to
      // availableAgainAt via formatDuration; supporting = "Available
      // again from <T> today/tomorrow/<Day>" via formatSupportingClock.
      // No "<1h → Available soon" branch — the REUSABLE eyebrow stays
      // "Available again" across the entire cooldown band.
      if (msToOpen === null || nextWindowStartsAt === null) return null
      return {
        eyebrow:    'Available again',
        primary:    formatDuration(msToOpen),
        supporting: formatSupportingClock(nextWindowStartsAt, now, 'Available again from'),
      }
    }
    case 'no-windows':
    case 'expired':
      // Handled by the early return in the component; included for exhaustiveness.
      return null
    default: {
      const _exhaustive: never = windowState
      void _exhaustive
      return null
    }
  }
}

/**
 * Returns the day-label suffix for the future-day eyebrow:
 *   • next London day → "tomorrow"
 *   • 2+ days away    → full weekday name e.g. "Saturday"
 */
function eyebrowDayLabel(boundary: Date, now: Date): string {
  // Piggyback on the supporting-line bucketing: if it ends with " tomorrow"
  // the boundary is the next London day; otherwise it's 2+ days out and the
  // weekday name is the right label. Pass any valid verb — the suffix
  // " tomorrow" is the load-bearing signal, not the verb prefix.
  const supporting = formatSupportingClock(boundary, now, 'Available from')
  if (supporting.endsWith(' tomorrow')) return 'tomorrow'
  return formatDayName(boundary)
}

/**
 * M5 Gate E polish — REUSABLE-available "alive" treatment.
 *
 * Breathing warm-cream border ring that pulses over a 2.4s cycle.
 * Sits inside <View style={styles.root}> as an absolute overlay so it
 * doesn't interfere with the eyebrow / primary / supporting / progress
 * bar layout. Colour is the brand cream tone expressed in rgba so the
 * opacity oscillation works directly on the border colour (no
 * compositing tricks). Cream reads against ANY voucher gradient,
 * which the previous green ring (#34D399) didn't — REUSABLE's
 * mint-teal hero camouflaged the green ring almost completely.
 *
 * Opacity range 0.55 ↔ 0.92 over a 2.4s ease-in-out cycle. Bottom-out
 * is bumped above 0.5 (vs the previous 0.45 green) so the cream
 * hairline stays clearly visible at every point in the breath cycle.
 *
 * Reduce-motion: when `useMotionScale()` returns 0 we render a
 * STATIC cream ring at opacity 0.78 — clearly visible mid-range; no
 * oscillation. Mirrors PulsingDot pattern.
 *
 * react-native-reanimated is mocked at the test-setup level
 * (tests/setup.ts) so withRepeat/withTiming are no-ops in jest; the
 * ring still mounts, surfacing the testID hooks the suite checks.
 */
function AliveRing() {
  const opacity = useSharedValue(0.92)
  const motion  = useMotionScale()

  useEffect(() => {
    if (motion <= 0) {
      // Reduce-motion: snap to static visible opacity.
      opacity.value = 0.78
      return
    }
    // 2.4s cycle, ease-in-out — slow, calm breathing. Bottom-out at
    // 0.55 so the cream hairline stays clearly visible throughout the
    // breath (continuous trust signal).
    opacity.value = withRepeat(
      withTiming(0.55, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    )
  }, [opacity, motion])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  return (
    <Animated.View
      testID="hero-status-block-alive-ring"
      pointerEvents="none"
      style={[styles.aliveRing, animatedStyle]}
    />
  )
}

const styles = StyleSheet.create({
  root: {
    // Stretch to fill the parent slot's cross-axis (horizontal) width.
    // The parent — CouponHeader's `statusBlockSlot` View — has no
    // paddingRight constraint, so this View fills the full hero
    // content-box width minus root.paddingHorizontal. On-device QA fix
    // 2026-05-11: moved out of CouponHeader.content (which had
    // paddingRight: 126 to reserve title-column space for the save badge)
    // because the save badge sits vertically above this block — no
    // horizontal overlap concern at this y range.
    alignSelf: 'stretch',
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.24)',
    borderWidth: 1,
    borderRadius: 12,
    // Required so the absolutely-positioned <AliveRing /> child
    // anchors to this container.
    position: 'relative',
    overflow: 'hidden',
  },
  // M5 Gate E polish (Issue 4, follow-up 2026-05-12) — REUSABLE-available
  // alive ring. Slightly inset from the root's outer edge so the cream
  // hairline reads as a deliberate inner accent (not a competing
  // border). Border radius shaved 1pt vs root (11 vs 12) to compensate
  // for the 1pt inset on all sides. `pointerEvents='none'` on the
  // wrapper so taps pass through to root content. Cream tone (warm
  // off-white) contrasts on ANY voucher hero gradient including
  // REUSABLE's mint-teal — the previous #34D399 green was effectively
  // invisible against that background.
  aliveRing: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
    borderWidth: 2,
    borderRadius: 11,
    borderColor: 'rgba(255, 248, 235, 1)',
  },
  // Eyebrow row hosts the inline trust-signal PulsingDot (REUSABLE-
  // available only) plus the eyebrow Text. Gap pulls the dot tight to
  // the eyebrow so they read as a single bonded element.
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eyebrowDot: {
    // Vertical alignment tuning — sit visually centered on the
    // eyebrow's uppercase x-height. PulsingDot ships as a small
    // circle; alignItems: 'center' on the row handles cross-axis.
    marginTop: 0,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  primary: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  supporting: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 6,
  },
  barTrack: {
    marginTop: 10,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  liveRegionHidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
})
