import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text, color } from '@/design-system'
import { Ticket } from '@/design-system/icons'
import { formatGbpCompact } from '@/design-system/utils/formatters'

/**
 * Map Phase 2 W2b (F9 + F11) — the shared "value" piece used by BOTH the
 * Map ledger list rows and the Map carousel card footer, so the two read
 * identically and cannot drift.
 *
 * Two parts, each rendered only when it has content:
 *   1. a green "Save up to £X" capsule (from the branch's best voucher
 *      saving), and
 *   2. a dashed voucher STUB: a small red ticket mark + "N vouchers".
 *
 * `saveAmount` is the raw best-saving figure (maxEstimatedSaving); the
 * component formats it with the shared compact GBP formatter (keeps pence
 * for sub-pound savings, drops them for whole pounds — same rule the card
 * value line has always used). A null / non-positive saving hides the
 * capsule; a zero voucher count hides the stub.
 */

type Props = {
  saveAmount:   number | null
  voucherCount: number
  /** Optional style tweak: 'compact' tightens paddings for dense list rows. */
  density?:     'default' | 'compact'
  /**
   * 'row' (default, carousel-card footer): capsule + stub side by side.
   * 'column' (ledger list rows): stacked + right-aligned so the value
   * sits as a tidy right-hand column, ledger style.
   */
  orientation?: 'row' | 'column'
  /**
   * W2b round 4 (Defect 3) — capsule wording. 'full' (default, carousel
   * card): "Save up to £15". 'amount' (ledger rows, where width is the
   * scarce resource): a compact strong "£15" chip; the full "Save up to
   * £15" phrasing moves to the chip's accessibilityLabel so screen
   * readers keep the complete meaning.
   */
  wording?:     'full' | 'amount'
  testID?:      string
}

export function VoucherValue({
  saveAmount,
  voucherCount,
  density = 'default',
  orientation = 'row',
  wording = 'full',
  testID,
}: Props) {
  const showSave = saveAmount !== null && saveAmount > 0
  const saveLabel = showSave ? formatGbpCompact(saveAmount) : null
  const showStub = voucherCount > 0
  const countLabel = voucherCount === 1 ? '1 voucher' : `${voucherCount} vouchers`

  if (!showSave && !showStub) return null

  const compact = density === 'compact'
  const column = orientation === 'column'
  const amountOnly = wording === 'amount'

  return (
    <View style={[styles.row, compact && styles.rowCompact, column && styles.column]} testID={testID}>
      {showSave && saveLabel ? (
        <View
          style={[styles.saveCapsule, compact && styles.saveCapsuleCompact]}
          testID="voucher-value-save"
          accessibilityLabel={`Save up to ${saveLabel}`}
        >
          <Text style={[styles.saveText, amountOnly && styles.saveTextAmount]} numberOfLines={1}>
            {amountOnly ? saveLabel : `Save up to ${saveLabel}`}
          </Text>
        </View>
      ) : null}
      {showStub ? (
        <View style={[styles.stub, compact && styles.stubCompact]} testID="voucher-value-stub">
          <Ticket size={compact ? 10 : 12} color={color.brandRose} strokeWidth={2.2} style={styles.stubMark} />
          <Text style={[styles.stubText, compact && styles.stubTextCompact]} numberOfLines={1}>{countLabel}</Text>
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
  rowCompact: {
    gap: 6,
  },
  column: {
    flexDirection: 'column',
    alignItems:    'flex-end',
    gap:           4,
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
  saveCapsuleCompact: {
    paddingHorizontal: 8,
    paddingVertical:   3,
  },
  saveText: {
    fontSize:   13,
    lineHeight: 17,
    fontFamily: 'Lato-Bold',
    color:      '#15803D',
    letterSpacing: -0.1,
  },
  // 'amount' wording — the bare figure carries the row, so it reads a
  // touch larger and bolder than the sentence form.
  saveTextAmount: {
    fontSize:   14,
    lineHeight: 18,
  },
  // Voucher stub — dashed outline (ticket language), a tiny red ticket mark
  // and the count. Radius ~7 per the W2b brief.
  stub: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    borderRadius:      7,
    borderWidth:       1.5,
    borderStyle:       'dashed',
    borderColor:       color.border.default,
    paddingHorizontal: 8,
    paddingVertical:   3,
  },
  // Round 4 (Defect 3) — the compact stub is tightened (icon 10, gap 2,
  // 11pt text, slimmer padding) so it fits the ledger row's fixed 72pt
  // value rail at a single-digit count.
  stubCompact: {
    paddingHorizontal: 4,
    paddingVertical:   2,
    gap:               2,
  },
  stubMark: {},
  stubText: {
    fontSize:   12,
    lineHeight: 16,
    fontFamily: 'Lato-SemiBold',
    color:      color.text.primary,
  },
  stubTextCompact: {
    fontSize:   11,
    lineHeight: 14,
  },
})
