import React from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { scrollActivity } from '@/design-system/motion/scrollActivity'
import type { MerchantVoucher } from '@/lib/api/merchant'
import {
  formatClockTime, formatClockHour12, formatDurationCompact, formatDayName,
} from '@/features/voucher/utils/countdownFormat'

/**
 * Merchant-profile voucher-card state pill (M4c — Gate J locked 2026-05-11
 * + M5 REUSABLE branch locked 2026-05-12).
 *
 * Renders inside `<VoucherCard>`'s topRow on the RIGHT, replacing the
 * favourite heart slot (heart relocates to the bottomRow). Height-neutral
 * with non-TIME_LIMITED non-REUSABLE cards — pill height matches the
 * existing type chip's ~22pt, so the card minHeight (144pt) is unchanged
 * across all voucher types.
 *
 * TIME_LIMITED state copy (owner-locked Gate J revised 2026-05-11 after
 * device QA — badge-hierarchy: UPPERCASE state label · sentence-case detail):
 *   active (>= 60 min)            → "AVAILABLE NOW · Until 3pm today"   + green pulse-dot
 *   urgent (< 60 min)             → "ENDING SOON · 23m left"            + coral pulse-dot
 *   outside-window today          → "AVAILABLE TODAY · From 5pm"        (static)
 *   outside-window tomorrow       → "AVAILABLE TOMORROW · From 12pm"    (static)
 *   outside-window future-day     → "AVAILABLE WEDNESDAY · From 11am"   (static)
 *   redeemed-this-window          → renders NOTHING (PR-B overprint carries the state)
 *
 * REUSABLE state copy (spec §8.1 + D28-D35 locked 2026-05-12):
 *   available (availableAgainAt null or in the past) → "AVAILABLE NOW"          + green pulse-dot
 *   cooldown (≤ 60 min)                              → "AVAILABLE AGAIN · 23m left"        (static)
 *   cooldown (> 60 min, today)                       → "AVAILABLE AGAIN · From 4pm today"  (static)
 *   cooldown (> 60 min, tomorrow)                    → "AVAILABLE AGAIN · From 11am tomorrow"  (static)
 *   cooldown (> 60 min, future-day)                  → "AVAILABLE AGAIN · From 12pm WEDNESDAY"  (static)
 *
 * REUSABLE rules (D31 / D34 / D35 lock):
 *   - NO urgency colour band at any state — nothing bad happens at cooldown expiry.
 *   - NO sub-headline ("Every 4 hours") on the merchant card; cadence visibility
 *     lives on Voucher Detail.
 *   - NO rubber-stamp overprint — the overprint stays exclusive to cycle vouchers.
 *
 * Other voucher types (BOGO / DISCOUNT / FREEBIE / SPEND_AND_SAVE / PACKAGE_DEAL)
 * render NOTHING — the pill component is opt-in per type.
 *
 * Pill layout sits inside <VoucherCard>'s `topRightGroup` to the LEFT
 * of the heart. Pill text is `numberOfLines: 1, ellipsizeMode: 'tail'`
 * — when topRow is tight, the tail truncates BEFORE the heart's
 * position is displaced. Heart is `flexShrink: 0`; pill (and its parent
 * group) is `flexShrink: 1`. Card minHeight 144pt unchanged.
 *
 * Urgent threshold (60 min) — OWNER LOCKED Gate H 2026-05-11:
 *   TIME_LIMITED urgency threshold is 60 minutes across Voucher Detail
 *   and Merchant Profile voucher cards. Supersedes spec §6.2's older
 *   <30 min wording. Sort + pill MUST share the boundary or a 45-min-
 *   remaining card lands in the urgent sort bucket with an "Active" pill.
 *
 *   For REUSABLE, the ≤60 min / >60 min split is the copy-format boundary
 *   (countdown form vs clock-hour form) — NOT a sort-bucket boundary, since
 *   REUSABLE has no urgency colour band (D31).
 *
 * Stale-payload guard:
 *   - TL: if `currentWindow.endsAt` has already passed relative to `now`,
 *     the pill falls through to the outside-window path (same guard as
 *     M4c-1 `bucketFor`). Prevents stale "Available now" pills.
 *   - REUSABLE: if `reusableState.availableAgainAt` is already in the past
 *     relative to `now`, the pill renders "AVAILABLE NOW" — same defensive
 *     fallthrough so a stale payload doesn't surface a phantom "0m left".
 *
 * Animation discipline (D6 / D31 lock):
 *   - TL: Pulse-dot ONLY in active/urgent. Outside-window pills are calm
 *     grey, no motion.
 *   - REUSABLE: Pulse-dot ONLY on the available state (same green as TL
 *     active). Cooldown pills are static — no pulse (D31).
 *   - Reanimated `withRepeat` opacity loop on the native thread (Gate J
 *     migration from M4c-2's RN Animated.loop — closes §AL1 follow-up).
 *   - `useReducedMotion` skips the pulse loop; dot renders static at full
 *     opacity for accessibility users.
 *   - NO full-card glow. NO scale animation. NO shimmer.
 *
 * Hermes-robust formatters only — reuses `formatClockTime` /
 * `formatClockHour12` / `formatDurationCompact` / `formatDayName` from
 * `countdownFormat.ts`. All four use the `formatToParts` numeric
 * extraction pattern that avoids the `weekday: 'long'/'short'` +
 * `toLocaleTimeString` fragility.
 */

const URGENT_THRESHOLD_MS = 60 * 60_000
// REUSABLE copy-format boundary — ≤60 min uses countdown form ("23m left");
// >60 min uses clock-hour form ("From 4pm today"). Not a sort-bucket boundary
// (REUSABLE has no urgency colour band, D31). Defined as a separate constant
// so a future tweak to one doesn't accidentally drag the other along.
const REUSABLE_CLOCK_FORM_THRESHOLD_MS = 60 * 60_000
const ACTIVE_PULSE_MS = 2000   // calm 2s loop
const URGENT_PULSE_MS = 1500   // slightly faster 1.5s loop, still not noisy

const ACTIVE_DOT_COLOR = '#16A34A'  // semantic green
const URGENT_DOT_COLOR = '#EA580C'  // urgency coral

/**
 * Year-month-day key for "is this date the same as 'today' relative to a
 * reference instant" comparisons. Europe/London-local; matches the locale
 * used everywhere else in the customer-app (`londonNow.ts` pattern).
 */
const YMD_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric', month: '2-digit', day: '2-digit',
})
function ymd(d: Date): string {
  return YMD_FORMATTER.format(d)  // "2026-05-11"
}

/**
 * Contextual suffix appended to active/urgent copy that has a time:
 *   - same London day as now  → "today"
 *   - next London day         → "tomorrow"
 *   - other day               → 3-letter day name ("Mon", "Tue", ...)
 *
 * Active/urgent windows that span >24h are rare but possible (e.g. a
 * 22:00 → 23:00 next-day window) — the suffix handles them gracefully
 * by surfacing the actual closing day.
 */
function dayContext(target: Date, now: Date): string {
  const nowYmd      = ymd(now)
  const targetYmd   = ymd(target)
  const tomorrowYmd = ymd(new Date(now.getTime() + 24 * 60 * 60_000))
  if (targetYmd === nowYmd)      return 'today'
  if (targetYmd === tomorrowYmd) return 'tomorrow'
  return formatDayName(target).slice(0, 3)  // "Fri" / "Tue" / etc.
}

type Props = {
  voucher: MerchantVoucher
  now: Date
}

export function VoucherCardStatePill({ voucher, now }: Props) {
  // M5 REUSABLE branch (spec §8.1, D28-D35 — locked 2026-05-12).
  if (voucher.type === 'REUSABLE') {
    const availableAgainRaw = voucher.reusableState?.availableAgainAt
    const availableAgainAt  = availableAgainRaw ? new Date(availableAgainRaw) : null

    // State 1 — Available now. Triggers when:
    //   • reusableState is omitted / null entirely (pre-M5 cached payload OR
    //     non-cooldown state from backend)
    //   • availableAgainAt is null (D16 future-only convention — null means
    //     cooldown elapsed)
    //   • availableAgainAt is already in the past relative to `now` (stale-
    //     payload guard — prevents phantom "0m left" cooldown pills).
    if (!availableAgainAt || availableAgainAt.getTime() <= now.getTime()) {
      return (
        <Pill
          testID="merchant-card-pill-reusable-available"
          textStyle={styles.textActive}
          copy="AVAILABLE NOW"
        >
          {/* Green pulse-dot — same colour as TL active state per spec §8.1. */}
          <PulseDot color={ACTIVE_DOT_COLOR} speedMs={ACTIVE_PULSE_MS} />
        </Pill>
      )
    }

    // State 2 / 3 — Cooldown. Single testID covers BOTH sub-thresholds; the
    // copy distinguishes ≤60 vs >60 min (mirrors TL's `unavailable-today` /
    // `unavailable-future-day` testID pattern — D32).
    const msUntilAvailable = availableAgainAt.getTime() - now.getTime()
    let copy: string
    if (msUntilAvailable <= REUSABLE_CLOCK_FORM_THRESHOLD_MS) {
      // ≤60 min: countdown form "AVAILABLE AGAIN · 23m left".
      // `formatDurationCompact` returns "Xm" for <60 min and "Xh Ym" for ≥60 min;
      // we cap entry to ≤60 min here so the displayed form is always "Nm" at the
      // exact 60-min boundary "60m" — by design ("23m left" pattern).
      copy = `AVAILABLE AGAIN · ${formatDurationCompact(msUntilAvailable)} left`
    } else {
      // >60 min: clock-hour form "AVAILABLE AGAIN · From <Hour> today / tomorrow / <WEEKDAY>".
      // Mirrors TL's outside-window day-context branching — same-London-day uses
      // "today", next-London-day uses "tomorrow", anything else uses the full
      // uppercase weekday name (locked spec §9 ledger + M4c device-QA round 3
      // lock: full day names beat 3-letter abbreviations for user-friendliness).
      const nowYmd      = ymd(now)
      const targetYmd   = ymd(availableAgainAt)
      const tomorrowYmd = ymd(new Date(now.getTime() + 24 * 60 * 60_000))
      let dayLabel: string
      if (targetYmd === nowYmd) {
        dayLabel = 'today'
      } else if (targetYmd === tomorrowYmd) {
        dayLabel = 'tomorrow'
      } else {
        // Full uppercase weekday name (matches TL's `AVAILABLE WEDNESDAY` form).
        dayLabel = formatDayName(availableAgainAt).toUpperCase()
      }
      copy = `AVAILABLE AGAIN · From ${formatClockHour12(availableAgainAt)} ${dayLabel}`
    }

    return (
      <Pill
        testID="merchant-card-pill-reusable-cooldown"
        textStyle={styles.textUnavail}
        copy={copy}
        unavail
      >
        {/* D31: no pulse on cooldown — nothing bad happens at cooldown expiry. */}
        {null}
      </Pill>
    )
  }

  // Renders nothing for non-TIME_LIMITED non-REUSABLE vouchers + redeemed-
  // this-window TL (PR-B overprint owns the redeemed surface).
  if (voucher.type !== 'TIME_LIMITED') return null
  if (voucher.redeemedWindow !== null) return null

  if (voucher.currentWindow) {
    const endsAt = new Date(voucher.currentWindow.endsAt)
    const remaining = endsAt.getTime() - now.getTime()

    // Stale-payload guard: closed window must NOT surface a stale "Available
    // now" / "Closes in" pill. Fall through to outside-window path so the
    // user sees the next-available copy.
    if (remaining > 0) {
      const isUrgent = remaining < URGENT_THRESHOLD_MS
      if (isUrgent) {
        // "ENDING SOON · 23m left" — uppercase state label + duration.
        // TL wording amendment 2026-05-11: "CLOSING SOON" → "ENDING SOON"
        // to avoid confusion with merchant business hours ("closing" reads
        // as restaurant closing). formatDurationCompact returns "Xm" for
        // <60 min (always urgent is <60 min by definition), so the detail
        // is always single-segment "Nm left".
        const copy = `ENDING SOON · ${formatDurationCompact(remaining)} left`
        return (
          <Pill testID="merchant-card-pill-urgent" textStyle={styles.textUrgent} copy={copy}>
            <PulseDot color={URGENT_DOT_COLOR} speedMs={URGENT_PULSE_MS} />
          </Pill>
        )
      }
      // "AVAILABLE NOW · Until 3pm today" — uppercase state label +
      // sentence-case detail with 12h clock-hour + day context. TL wording
      // amendment 2026-05-11: "Ends" → "Until" to match the customer-
      // facing window framing without reading as alarmist. Visual
      // hierarchy via UPPERCASE state · sentence-case detail contrast
      // stays intact.
      const copy = `AVAILABLE NOW · Until ${formatClockHour12(endsAt)} ${dayContext(endsAt, now)}`
      return (
        <Pill testID="merchant-card-pill-active" textStyle={styles.textActive} copy={copy}>
          <PulseDot color={ACTIVE_DOT_COLOR} speedMs={ACTIVE_PULSE_MS} />
        </Pill>
      )
    }
    // fall through — closed window, fall back to nextWindow path below.
  }

  if (voucher.nextWindow) {
    const startsAt = new Date(voucher.nextWindow.startsAt)
    const nowYmd      = ymd(now)
    const nextYmd     = ymd(startsAt)
    const tomorrowYmd = ymd(new Date(now.getTime() + 24 * 60 * 60_000))

    let copy:   string
    let testID: string
    if (nextYmd === nowYmd) {
      // "AVAILABLE TODAY · From 5pm" — TL wording amendment 2026-05-11:
      // uppercase state label + sentence-case "From X" detail. Replaces
      // "OPENS TODAY · 5pm" to avoid confusion with merchant business
      // hours ("opens" reads as restaurant opening).
      copy = `AVAILABLE TODAY · From ${formatClockHour12(startsAt)}`
      testID = 'merchant-card-pill-unavailable-today'
    } else if (nextYmd === tomorrowYmd) {
      // "AVAILABLE TOMORROW · From 12pm" — same TL wording amendment.
      copy = `AVAILABLE TOMORROW · From ${formatClockHour12(startsAt)}`
      testID = 'merchant-card-pill-unavailable-future-day'
    } else {
      // "AVAILABLE SATURDAY · From 11am" — FULL uppercase day name folded
      // into the state label + sentence-case "From X" detail (TL wording
      // amendment 2026-05-11 — was "OPENS SATURDAY · 11am"). User-
      // friendly copy beats compact copy; "SAT" reads as a shortened
      // abbreviation that requires mental expansion (owner-locked device
      // QA round 3, 2026-05-11). The day is uppercased to keep the
      // badge-hierarchy contrast (UPPERCASE state · sentence-case
      // detail) consistent with today/tomorrow. Stacked layout gives
      // the pill 75% of the row width — longest variant "AVAILABLE
      // WEDNESDAY · From 12pm" is ~30 chars which fits on iPhone SE.
      const day = formatDayName(startsAt).toUpperCase()
      copy = `AVAILABLE ${day} · From ${formatClockHour12(startsAt)}`
      testID = 'merchant-card-pill-unavailable-future-day'
    }
    return (
      <Pill testID={testID} textStyle={styles.textUnavail} copy={copy} unavail>
        {null}
      </Pill>
    )
  }

  // Degenerate: TIME_LIMITED voucher with no current AND no next window.
  // Caller (M4c-1 sortMerchantVouchers) buckets this as outside-window so
  // the card still renders, but the pill has nothing meaningful to say —
  // render nothing rather than fabricate copy.
  return null
}

// ── Internal sub-components ──────────────────────────────────────────

type PillProps = {
  testID: string
  textStyle: { color: string; fontWeight: '700' }
  copy: string
  unavail?: boolean
  children: React.ReactNode  // pulse-dot or null
}

function Pill({ testID, textStyle, copy, unavail, children }: PillProps) {
  return (
    <View style={[styles.pill, unavail && styles.pillUnavail]} testID={testID}>
      {children}
      <Text variant="label.md" style={[styles.text, textStyle]} numberOfLines={1} ellipsizeMode="tail">
        {copy}
      </Text>
    </View>
  )
}

/**
 * Pulse-dot — Reanimated `withRepeat` opacity loop on the native thread.
 *
 * Loop runs entirely on the native UI thread (no JS-bridge crossings per
 * frame). Respects `useReducedMotion` — when on, dot stays static at full
 * opacity (no animation registered).
 *
 * Perf batch 1 (2026-07-09) — additionally PAUSES while the host screen's
 * ScrollView is moving, reacting to the same module-level `scrollActivity`
 * flag Home / Merchant Profile / Voucher Detail already drive (mirrors
 * `src/design-system/motion/PulsingDot.tsx`'s `useAnimatedReaction` pattern:
 * cancel + snap back to the resting opacity, THEN re-arm the loop, so a
 * scroll-frozen mid-pulse value can't collapse the next `withRepeat` cycle
 * to ~no movement). The opacity range (0.4-1), the per-half-cycle duration
 * (speedMs/2, ease-in-out) and the reduced-motion behaviour are unchanged
 * from the previous `useEffect`-driven loop — only the pause-during-scroll
 * behaviour is new.
 */
function PulseDot({ color, speedMs }: { color: string; speedMs: number }) {
  const reducedMotion = useReducedMotion()
  const opacity = useSharedValue(1)

  useAnimatedReaction(
    () => scrollActivity.value,
    (scrolling) => {
      cancelAnimation(opacity)
      opacity.value = 1 // resting pose before (re)starting — see header note
      if (!reducedMotion && scrolling === 0) {
        opacity.value = withRepeat(
          withSequence(
            withTiming(0.4, { duration: speedMs / 2, easing: Easing.inOut(Easing.ease) }),
            withTiming(1,   { duration: speedMs / 2, easing: Easing.inOut(Easing.ease) }),
          ),
          -1,
          false,
        )
      }
    },
    [reducedMotion, speedMs],
  )

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <Animated.View
      testID="merchant-card-pill-pulse-dot"
      style={[styles.dot, { backgroundColor: color }, animatedStyle]}
    />
  )
}

const styles = StyleSheet.create({
  // Pill height-neutral with the type chip (~22pt). Sits in topRow on
  // the RIGHT (heart relocated to bottomRow). 11pt text + 3pt vertical
  // padding keeps the pill at ~20pt, comfortable inside topRow's flex
  // row alignItems:'center' — no card-height growth.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    // Pale white backdrop reads cleanly against any per-type gradient.
    // Active/urgent get the higher-opacity backdrop (clearer state signal);
    // outside-window stays slightly more translucent (calmer).
    backgroundColor: 'rgba(255,255,255,0.92)',
    // Prevent pill from forcing topRow to wrap on narrow screens —
    // flexShrink:1 lets the inner Text ellipsize gracefully if the chip
    // + pill combined width exceeds the available row width.
    flexShrink: 1,
  },
  pillUnavail: {
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  // 11pt for fit on smaller screens (Gate J owner-locked) — matches
  // PRODUCT.md chrome typography scale at the body-tier minimum.
  text: {
    fontSize: 11,
    flexShrink: 1,
  },
  textActive:  { color: '#15803D', fontWeight: '700' },
  textUrgent:  { color: '#9A3412', fontWeight: '700' },
  textUnavail: { color: '#6B7280', fontWeight: '700' },

  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    // Decorative — hidden from screen readers; pill text carries the
    // full state announcement.
  },
})
