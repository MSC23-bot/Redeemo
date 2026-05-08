import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { CheckCircle2, Eye } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, radius, spacing } from '@/design-system/tokens'
import { formatRedemptionCode } from '../utils/formatRedemptionCode'
import { formatPounds, voucherTypeLabel } from '../utils/voucherTheme'
import type { VoucherType } from '@/lib/api/voucher'

type Props = {
  redemptionCode: string
  redeemedAt: string  // ISO string
  branchName: string | null
  /**
   * Voucher context (locked 2026-05-07 from device QA). The card is
   * the most-prominent surface on a redeemed voucher detail page; it
   * needs to identify exactly what was redeemed so the customer or
   * staff don't have to scan the rest of the page. Sourced from
   * `voucher.title` / `voucher.type` / `voucher.merchant.businessName`
   * / `voucher.estimatedSaving` — never invented.
   */
  voucherType: VoucherType
  voucherTitle: string
  merchantName: string
  estimatedSaving: number
  /**
   * "Show to Staff" — live in M3 (Task 17). Caller (VoucherDetailScreen)
   * mounts the full-screen ShowToStaff modal with the persisted
   * code/redeemedAt/branch. Optional only because the standalone
   * test fixtures don't always supply it; the card always renders
   * the button.
   */
  onShowToStaff?: () => void
  /**
   * Visual indicator when the redemption has been validated by staff
   * (M3). Optional — defaults to false. When true, renders a small
   * "Validated by staff" pill below the action button so a return
   * visitor can see the redemption already cleared without opening
   * Show-to-Staff again.
   */
  isValidated?: boolean
}

function formatDateLine(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function formatTimeLine(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/**
 * RedemptionDetailsCard — Voucher Detail M2 (basic, non-QR).
 *
 * Visual contract: informed by v6 §Already-Redeemed (Screen 8) but
 * SCOPED FOR M2 — no QR section. M3 will add the full QR rendering +
 * Show-to-Staff full-screen.
 *
 * Renders for the `redeemed-this-cycle` state on Voucher Detail. Sits
 * inside the coupon body (parent screen handles the washed-out coupon
 * header + green "Voucher Redeemed" badge per v6 §8 — this component
 * just owns the redemption-details surface).
 *
 * M2 surface:
 *   • Header row: green check-circle icon + "Redemption Details" title +
 *     redeemed-at date subtitle.
 *   • Code row: REDEMPTION CODE label + 4+4-grouped code in monospace.
 *   • Branch + date + time info rows.
 *   • Disabled "Show to Staff" stub (visually present, accessibilityState
 *     disabled, muted styling) so the user understands this is where
 *     the QR will live in M3.
 */
export function RedemptionDetailsCard({
  redemptionCode,
  redeemedAt,
  branchName,
  voucherType,
  voucherTitle,
  merchantName,
  estimatedSaving,
  onShowToStaff,
  isValidated = false,
}: Props) {
  const formattedCode = formatRedemptionCode(redemptionCode)
  const typeLabel = voucherTypeLabel(voucherType).toUpperCase()
  const savingFormatted = formatPounds(estimatedSaving)

  return (
    <View style={styles.card} testID="redemption-details-card">
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <CheckCircle2 size={20} color={color.savingsGreen} strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="label.md" style={styles.title}>
            Redemption Details
          </Text>
          <Text variant="label.md" style={styles.subtitle}>
            Redeemed {formatDateLine(redeemedAt)}
          </Text>
        </View>
      </View>

      {/* Voucher summary block (locked 2026-05-07 from device QA).
          Identifies exactly what was redeemed — type label, title,
          merchant, "Save up to" — so the customer/staff don't have
          to scan the rest of the page. Sits above the redemption
          code so the eye lands on the offer first, then the code. */}
      <View style={styles.summaryBox} testID="redemption-details-summary">
        <Text variant="label.md" style={styles.summaryType} testID="redemption-details-type">
          {typeLabel}
        </Text>
        <Text
          variant="body.md"
          style={styles.summaryTitle}
          numberOfLines={2}
          ellipsizeMode="tail"
          testID="redemption-details-title"
        >
          {voucherTitle}
        </Text>
        <Text
          variant="body.sm"
          style={styles.summaryMerchant}
          numberOfLines={1}
          ellipsizeMode="tail"
          testID="redemption-details-merchant"
        >
          {merchantName}
        </Text>
        <Text variant="label.md" style={styles.summarySaving} testID="redemption-details-saving">
          Saved up to {savingFormatted}
        </Text>
      </View>

      <View style={styles.codeBox}>
        <Text variant="label.md" style={styles.codeLabel}>
          REDEMPTION CODE
        </Text>
        <Text
          variant="heading.md"
          style={styles.codeValue}
          testID="redemption-details-code"
          accessibilityLabel={`Redemption code ${formattedCode.split('').join(' ')}`}
        >
          {formattedCode}
        </Text>
      </View>

      <View style={styles.infoRows}>
        <InfoRow label="Branch" value={branchName ?? '—'} />
        <InfoRow label="Date"   value={formatDateLine(redeemedAt)} />
        <InfoRow label="Time"   value={formatTimeLine(redeemedAt)} />
      </View>

      {/* "Saved up to" disclaimer (locked 2026-05-07 from device QA).
          The card is shown post-redemption, so the copy is past
          tense ("Saved up to") and the disclaimer follows. The
          ceiling-amount is what the voucher promises; actual depends
          on what the user ordered + merchant terms (especially BOGO
          and percentage-discount types). The disclaimer sits at the
          bottom of the card so it doesn't steal attention from the
          code, but is present whenever the saving is shown. */}
      <Text variant="body.sm" style={styles.savingDisclaimer} testID="redemption-details-saving-disclaimer">
        “Saved up to” is the maximum estimated saving for this voucher. Your actual saving may depend on the item, service, bill value, and merchant terms.
      </Text>

      {/* Show-to-Staff — live in M3 (Task 17). Mounts the full-screen
          ShowToStaff modal via the parent screen's onShowToStaff
          handler. Brand-rose gradient matches the Voucher Detail
          primary CTA so the action reads as the dominant next step
          on the redeemed surface. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Show redemption code to staff"
        testID="redemption-details-show-to-staff"
        onPress={() => onShowToStaff?.()}
        style={({ pressed }) => [styles.showToStaffCta, pressed && styles.showToStaffCtaPressed]}
      >
        <LinearGradient
          colors={[color.brandRose, color.brandCoral]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />
        <Eye size={18} color="#FFFFFF" strokeWidth={2.4} />
        <Text variant="label.md" style={styles.showToStaffText}>
          Show to Staff
        </Text>
      </Pressable>

      {/* M3 validated indicator — rendered when staff has already
          validated the redemption. Surfaces on return visits so the
          user doesn't need to reopen Show-to-Staff to see the status. */}
      {isValidated ? (
        <View style={styles.validatedPill} testID="redemption-details-validated-pill">
          <CheckCircle2 size={14} color={color.savingsGreen} strokeWidth={2.4} />
          <Text variant="label.md" style={styles.validatedText}>
            Validated by staff
          </Text>
        </View>
      ) : null}
    </View>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text variant="label.md" style={styles.infoLabel}>
        {label}
      </Text>
      <Text variant="label.md" style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface.raised,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    padding: spacing[5],
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    gap: spacing[4],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(22,163,74,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: color.text.primary,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 11,
    color: color.text.tertiary,
  },
  summaryBox: {
    paddingTop: spacing[1],
    paddingBottom: spacing[3],
    borderBottomColor: 'rgba(0,0,0,0.05)',
    borderBottomWidth: 1,
    gap: spacing[1],
  },
  summaryType: {
    fontSize: 10,
    color: color.brandRose,
    letterSpacing: 1.4,
    fontWeight: '800',
  },
  summaryTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: color.text.primary,
    lineHeight: 22,
  },
  summaryMerchant: {
    fontSize: 13,
    color: color.text.secondary,
    marginTop: 2,
  },
  summarySaving: {
    fontSize: 13,
    color: color.savingsGreen,
    fontWeight: '800',
    marginTop: spacing[1],
  },
  savingDisclaimer: {
    fontSize: 11,
    lineHeight: 16,
    color: color.text.tertiary,
    fontStyle: 'italic',
  },
  codeBox: {
    backgroundColor: color.surface.subtle,
    borderRadius: radius.lg,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    alignItems: 'center',
  },
  codeLabel: {
    fontSize: 9,
    color: color.text.tertiary,
    letterSpacing: 1.2,
    marginBottom: spacing[1],
  },
  codeValue: {
    fontSize: 22,
    fontWeight: '800',
    color: color.text.primary,
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
  },
  infoRows: {
    gap: spacing[2],
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing[2],
    borderTopColor: 'rgba(0,0,0,0.03)',
    borderTopWidth: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: color.text.tertiary,
  },
  infoValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: color.text.primary,
    textAlign: 'right',
    marginLeft: spacing[3],
  },
  showToStaffCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  showToStaffCtaPressed: {
    transform: [{ scale: 0.97 }],
  },
  showToStaffText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  validatedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(22, 163, 74, 0.10)',
    marginTop: spacing[2],
  },
  validatedText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.savingsGreen,
  },
})
