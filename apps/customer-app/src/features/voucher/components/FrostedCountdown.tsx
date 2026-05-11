import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import {
  formatPrimaryCountdown, formatSupportingCountdown,
  type CountdownState,
} from '@/features/voucher/utils/countdownFormat'

/**
 * FrostedCountdown — the hero countdown banner for TIME_LIMITED vouchers
 * (M4b-7). Frosted glass card sitting inside the voucher hero, showing
 * label-tiny ("Active until" / "Ending in" / "Available in" / etc.),
 * primary (clock-time or duration), and supporting (compound info).
 *
 * Renders nothing for 'no-windows'. Dims to 0.3 opacity with '—'
 * placeholder for 'expired'. Urgent variant shifts background to
 * brand-amber tint.
 *
 * Type contract: `windowState` accepts the UNION of WindowState
 * ('no-windows') + CountdownState (everything else). The screen-level
 * state machine (M4b-8) maps the redemption + voucher state to one of
 * these seven values before passing in.
 *
 * Delegates ALL string formatting to countdownFormat.ts. No internal
 * clock — consumer passes `now` so tests are deterministic.
 */

export type FrostedCountdownState = CountdownState | 'no-windows'

type Props = {
  windowState: FrostedCountdownState
  now: Date
  boundaryAt: Date | null
  scheduleString: string
}

const LABEL_TINY_BY_STATE: Record<FrostedCountdownState, string> = {
  'active':                 'Active until',
  'urgent':                 'Ending in',
  'unavailable-today':      'Available in',
  'unavailable-future-day': 'Starts in',
  'redeemed-this-window':   'Available again in',
  'no-windows':             '',
  'expired':                'Was active',
}

export function FrostedCountdown(props: Props) {
  const { windowState, now, boundaryAt, scheduleString } = props
  if (windowState === 'no-windows') return null

  // After the early-return, TS narrows windowState to CountdownState —
  // which is exactly what formatPrimaryCountdown / formatSupportingCountdown expect.
  const isUrgent   = windowState === 'urgent'
  const isDimmed   = windowState === 'expired'
  const labelTiny  = LABEL_TINY_BY_STATE[windowState]
  const primary    = formatPrimaryCountdown({ state: windowState, now, boundaryAt })
  const supporting = formatSupportingCountdown({ state: windowState, now, boundaryAt, schedule: scheduleString })

  // Synthetic props for test introspection (toHaveProp). RN's View
  // doesn't type these natively — the spread cast keeps TS quiet while
  // the test renderer still sees them on the element.
  const introspectionProps = { isUrgent, isDimmed } as unknown as Record<string, unknown>

  return (
    <View
      testID="vd-frosted-countdown"
      {...introspectionProps}
      style={[styles.root, isUrgent && styles.urgent, isDimmed && styles.dimmed]}
    >
      <Text variant="label.eyebrow" style={styles.labelTiny}>{labelTiny}</Text>
      <Text variant="display.sm" style={styles.primary}>{primary}</Text>
      <Text variant="label.md" style={styles.supporting}>{supporting}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  urgent: {
    backgroundColor: 'rgba(180,83,9,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,230,180,0.4)',
  },
  dimmed: { opacity: 0.3 },
  labelTiny: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 9, textTransform: 'uppercase', letterSpacing: 1,
  },
  primary: {
    color: '#FFFFFF',
    fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'],
    lineHeight: 24, letterSpacing: -0.2,
  },
  supporting: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11, marginTop: 4, letterSpacing: 0.1,
  },
})
