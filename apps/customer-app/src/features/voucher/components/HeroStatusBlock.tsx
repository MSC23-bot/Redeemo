import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import type { WindowState } from '@/features/voucher/utils/timeLimitedWindow'
import {
  formatDuration,
  formatSupportingClock,
  formatDayName,
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

  return (
    <View testID="hero-status-block" style={styles.root}>
      <Text testID="hero-status-eyebrow" variant="label.eyebrow" style={styles.eyebrow}>
        {content.eyebrow}
      </Text>
      <Text testID="hero-status-primary" variant="display.sm" style={styles.primary}>
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
    </View>
  )
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
})
