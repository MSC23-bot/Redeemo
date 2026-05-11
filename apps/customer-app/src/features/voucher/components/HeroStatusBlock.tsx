import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
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
 * M4d hero-mounted status block for TIME_LIMITED vouchers.
 *
 * Per spec D3 amendment 2026-05-11: duration-first primary,
 * clock-time supporting. Mounts inside <CouponHeader> below the title
 * (Phase C wiring). Renders a frosted card over the voucher's
 * type-coloured gradient.
 *
 * State handling:
 *   • active           → eyebrow "Available now"   | primary closing duration   | supporting "Ends … today"
 *   • urgent           → eyebrow "Closing soon"    | primary closing duration   | supporting "Ends … today"
 *   • unavailable-today
 *       ≥1h to open    → eyebrow "Opens today"     | primary opening duration   | supporting "Opens … today"
 *       <1h to open    → eyebrow "Opening soon"    | primary opening duration   | supporting "Opens … today"
 *   • unavailable-future-day
 *       ≥1h to open    → eyebrow "Opens <Day>"     | primary opening duration   | supporting "<Day> …" or "Opens … tomorrow"
 *       <1h to open    → eyebrow "Opening soon"    | primary opening duration   | supporting "Opens … tomorrow"  (midnight-cross)
 *   • redeemed-this-window
 *       ≥1h to next    → eyebrow "Available again" | primary available-again    | supporting clock
 *       <1h to next    → eyebrow "Almost back"     | primary available-again    | supporting clock
 *   • no-windows / expired → render null
 *
 * Progress bar lands in B.2; a11y live-region + reduced motion in B.3;
 * CouponHeader integration in C.1.
 */

export type HeroStatusBlockState = WindowState | 'redeemed-this-window' | 'expired'

export type HeroStatusBlockProps = {
  windowState: HeroStatusBlockState
  /** Captured at parent render time so tests are deterministic. */
  now: Date
  /** Required for active/urgent + progress bar's emptying denominator (B.2). */
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

  return (
    <View testID="hero-status-block" style={styles.root}>
      <Text testID="hero-status-eyebrow" variant="label.eyebrow" style={styles.eyebrow}>
        {content.eyebrow}
      </Text>
      <Text
        testID="hero-status-primary"
        variant="display.sm"
        style={styles.primary}
        accessibilityElementsHidden={underOneHourTick || undefined}
        importantForAccessibility={underOneHourTick ? 'no-hide-descendants' : undefined}
      >
        {content.primary}
      </Text>
      <Text testID="hero-status-supporting" variant="body.sm" style={styles.supporting}>
        {content.supporting}
      </Text>
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
 * already the natural announcement ("Opens today" / "Opens tomorrow" /
 * "Opens <Weekday>" / "Available again") so it's used verbatim.
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
    // ≥1h band: use the eyebrow directly ("Opens today" / "Opens tomorrow" /
    // "Opens <Weekday>").
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

  return null
}

type BarSpec = { widthPct: number; color: string } | null

function deriveProgressBar(props: HeroStatusBlockProps): BarSpec {
  const { windowState, currentWindowStartsAt, currentWindowEndsAt, msToClose, msToOpen } = props

  // Hidden states.
  if (
    windowState === 'no-windows' ||
    windowState === 'expired' ||
    windowState === 'redeemed-this-window'
  ) {
    return null
  }

  // Closing direction (active / urgent) — bar empties left→right.
  if (windowState === 'active' || windowState === 'urgent') {
    if (!currentWindowStartsAt || !currentWindowEndsAt || msToClose === null) return null
    const totalMs = currentWindowEndsAt.getTime() - currentWindowStartsAt.getTime()
    if (totalMs <= 0) return null
    const widthPct = Math.max(0, Math.min(100, Math.round((msToClose / totalMs) * 100)))
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
        supporting: formatSupportingClock(currentWindowEndsAt, now, 'Ends'),
      }
    }
    case 'urgent': {
      if (currentWindowEndsAt === null || msToClose === null) return null
      return {
        eyebrow:    'Closing soon',
        primary:    formatDuration(msToClose),
        supporting: formatSupportingClock(currentWindowEndsAt, now, 'Ends'),
      }
    }
    case 'unavailable-today': {
      if (nextWindowStartsAt === null || msToOpen === null) return null
      const eyebrow = msToOpen < ONE_HOUR_MS ? 'Opening soon' : 'Opens today'
      return {
        eyebrow,
        primary:    formatDuration(msToOpen),
        supporting: formatSupportingClock(nextWindowStartsAt, now, 'Opens'),
      }
    }
    case 'unavailable-future-day': {
      if (nextWindowStartsAt === null || msToOpen === null) return null
      const eyebrow = msToOpen < ONE_HOUR_MS
        ? 'Opening soon'
        : `Opens ${eyebrowDayLabel(nextWindowStartsAt, now)}`
      return {
        eyebrow,
        primary:    formatDuration(msToOpen),
        supporting: formatSupportingClock(nextWindowStartsAt, now, 'Opens'),
      }
    }
    case 'redeemed-this-window': {
      if (nextWindowStartsAt === null || msToOpen === null) return null
      const eyebrow = msToOpen < ONE_HOUR_MS ? 'Almost back' : 'Available again'
      return {
        eyebrow,
        primary:    formatDuration(msToOpen),
        supporting: formatSupportingClock(nextWindowStartsAt, now, 'Opens'),
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
  // weekday name is the right label.
  const supporting = formatSupportingClock(boundary, now, 'Opens')
  if (supporting.endsWith(' tomorrow')) return 'tomorrow'
  return formatDayName(boundary)
}

const styles = StyleSheet.create({
  root: {
    // Stretch to fill the parent View's cross-axis (horizontal) width.
    // Without this, the View sizes to its intrinsic content (eyebrow +
    // primary + supporting text + padding), which leaves the right edge
    // well short of the parent's available width. The parent CouponHeader
    // `content` View already reserves `paddingRight: 126pt` for the save
    // badge, so stretching here fills the title/description column without
    // overlapping the badge. On-device QA fix, 2026-05-11.
    alignSelf: 'stretch',
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.24)',
    borderWidth: 1,
    borderRadius: 12,
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
