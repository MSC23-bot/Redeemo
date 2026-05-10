import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import type { WindowState } from '@/features/voucher/utils/timeLimitedWindow'
import { formatClockTime } from '@/features/voucher/utils/countdownFormat'

type Props = {
  scheduleString: string
  expiryDate: string | null     // ISO
  windowState: WindowState
  currentWindowEndsAt: Date | null
  nextWindowStartsAt: Date | null
}

/**
 * TIME_LIMITED voucher details card (M4b-6).
 *
 * Replaces <CycleRulesCard> for TIME_LIMITED vouchers — that component
 * early-returns when availableAgainAt is null, which is the case for all
 * TIME_LIMITED vouchers (their entitlement is per-window, not per-cycle).
 *
 * LOCKED: this card must NEVER render the string "Renews on". TIME_LIMITED
 * vouchers don't renew on a date; they have an ongoing availability
 * schedule with an optional final-offer expiryDate.
 *
 * Spec §4 layout block:
 *   - Available during    (always)
 *   - Current window ends (active / urgent only)
 *   - Next available      (unavailable-* only)
 *   - Usage rule          (always)
 *   - Offer ends          (only when expiryDate is set AND state !== 'no-windows')
 */

const FULL_DATE = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  day: 'numeric', month: 'long', year: 'numeric',
})

function formatExpiry(iso: string): string {
  return FULL_DATE.format(new Date(iso))
}

function formatNextAvailable(date: Date, state: WindowState): string {
  if (state === 'unavailable-today') {
    return `Today at ${formatClockTime(date)}`
  }
  // future day — Hermes-robust day-name lookup via formatToParts numeric
  // extraction + hardcoded English array. Avoids `weekday: 'long'/'short'`
  // and `toLocaleTimeString` (Hermes/CLDR fragility — see reference_london_clock_helper.md).
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const ymdParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(date)
  const get = (t: Intl.DateTimeFormatPartTypes): number =>
    parseInt(ymdParts.find(p => p.type === t)?.value ?? '0', 10)
  const dow = new Date(Date.UTC(get('year'), get('month') - 1, get('day'))).getUTCDay()
  // dow is 0-6 (Date.getUTCDay) — always in range; non-null-assert
  // because TS's noUncheckedIndexedAccess widens array access to T | undefined.
  return `${DAYS[dow]!} at ${formatClockTime(date)}`
}

export function TimeLimitedDetailsCard(props: Props) {
  const { scheduleString, expiryDate, windowState,
          currentWindowEndsAt, nextWindowStartsAt } = props

  return (
    <View style={styles.card} testID="time-limited-details-card">
      <Row label="Available during" value={scheduleString} />

      {(windowState === 'active' || windowState === 'urgent') && currentWindowEndsAt && (
        <Row label="Current window ends" value={formatClockTime(currentWindowEndsAt)} />
      )}

      {(windowState === 'unavailable-today' ||
        windowState === 'unavailable-future-day') && nextWindowStartsAt && (
        <Row label="Next available" value={formatNextAvailable(nextWindowStartsAt, windowState)} />
      )}

      <Row label="Usage rule" value="Redeem once per active window." />

      {expiryDate !== null && windowState !== 'no-windows' && (
        <Row label="Offer ends" value={formatExpiry(expiryDate)} />
      )}
    </View>
  )
}

type RowProps = { label: string; value: string }
function Row({ label, value }: RowProps) {
  return (
    <View style={styles.row}>
      <Text variant="label.md" style={styles.label}>{label}</Text>
      <Text variant="body.md"  style={styles.value}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0,0,0,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 16,
    marginTop: 14,
    gap: 8,
  },
  row: { flexDirection: 'column', gap: 2 },
  label: { color: '#6B7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { color: '#1F2937', fontSize: 14, fontWeight: '600' },
})
