import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text, color } from '@/design-system'
import { TicketMark } from '@/design-system/components/TicketMark'
import { formatGbpCompact } from '@/design-system/utils/formatters'

/**
 * Map Phase 2 W2b (F9 + F11) — the shared "value" piece used by BOTH the
 * Map ledger list rows and the Map carousel card footer, so the two read
 * identically and cannot drift.
 *
 * Two parts side by side (8pt gap), each rendered only when it has
 * content:
 *   1. a green "Save up to £X" capsule — OWNER DECISION 2026-07-18: on
 *      the MAP surfaces (list rows + carousel card) the amount is the
 *      TOTAL of all the merchant's vouchers (`totalEstimatedSaving`;
 *      e.g. three £5 vouchers show "Save up to £15" + "3 vouchers").
 *      Home tiles intentionally still show `maxEstimatedSaving` (best
 *      single voucher); platform alignment is pending a separate owner
 *      decision. The metric choice lives at the CALL SITES via
 *      `saveAmount`, and
 *   2. the voucher count: the filled brand-red `<TicketMark>` + a navy
 *      "N vouchers" label. Round 5: no dashed container — the ticket icon
 *      carries the identity on its own.
 *
 * Round-5 history: the round-4 `wording`/`orientation`/`density` props
 * were removed together with the side-rail row geometry that needed them
 * (owner reverted to full wording + a full-width value line); the
 * dashed-border stub and its lucide Ticket glyph were replaced by
 * `<TicketMark>`.
 */

type Props = {
  saveAmount:   number | null
  voucherCount: number
  testID?:      string
}

export function VoucherValue({ saveAmount, voucherCount, testID }: Props) {
  const showSave = saveAmount !== null && saveAmount > 0
  const saveLabel = showSave ? formatGbpCompact(saveAmount) : null
  const showCount = voucherCount > 0
  const countLabel = voucherCount === 1 ? '1 voucher' : `${voucherCount} vouchers`

  if (!showSave && !showCount) return null

  return (
    <View style={styles.row} testID={testID}>
      {showSave && saveLabel ? (
        <View
          style={styles.saveCapsule}
          testID="voucher-value-save"
          accessibilityLabel={`Save up to ${saveLabel}`}
        >
          <Text style={styles.saveText} numberOfLines={1}>Save up to {saveLabel}</Text>
        </View>
      ) : null}
      {showCount ? (
        <View style={styles.countPair} testID="voucher-value-stub">
          <TicketMark size={16} testID="voucher-value-ticket-mark" />
          <Text style={styles.countText} numberOfLines={1}>{countLabel}</Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    flexWrap:      'wrap',
    gap:           8,
  },
  // Green savings capsule — mirrors the Mustica-green savings language used
  // across the app; the amount is the load-bearing data (emil: the number
  // is the hero, the chrome is quiet).
  saveCapsule: {
    backgroundColor:   '#EAF7EF',
    borderRadius:      999,
    paddingHorizontal: 10,
    paddingVertical:   4,
  },
  saveText: {
    fontSize:   13,
    lineHeight: 17,
    fontFamily: 'Lato-Bold',
    color:      '#15803D',
    letterSpacing: -0.1,
  },
  // Voucher count — icon + label, no container (round 5).
  countPair: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
  },
  countText: {
    fontSize:   12,
    lineHeight: 16,
    fontFamily: 'Lato-SemiBold',
    color:      color.navy,
  },
})
