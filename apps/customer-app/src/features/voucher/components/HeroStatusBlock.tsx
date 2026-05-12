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

  return (
    <View testID="hero-status-block" style={styles.root}>
      <Text testID="hero-status-eyebrow" variant="label.eyebrow" style={styles.eyebrow}>
        {content.eyebrow}
      </Text>
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
