import React, { useCallback, useMemo } from 'react'
import { View, ScrollView, Pressable, StyleSheet } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, Check, Clock, Calendar, MapPin } from '@/design-system/icons'
import { Text } from '@/design-system/Text'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { ErrorState } from '@/design-system/components/ErrorState'
import { color, radius, spacing, elevation, layout } from '@/design-system/tokens'
import { voucherTypeLabel } from '@/features/voucher/utils/voucherTheme'
import { isPresentationActive } from '@/features/voucher/utils/presentationWindow'
import { useMyRedemption } from '../hooks/useMyRedemption'
import type { ValidationMethod } from '../hooks/useMyRedemption'

// §Savings Redemption Detail screen — PR #105 device-QA round-3,
// 2026-05-18.
//
// Dedicated route at `/(app)/redemption/[id]`.  Fetches a SPECIFIC
// redemption event by id (not by voucher id) so that:
//
//   - Two REUSABLE redemptions of the same voucher land on distinct
//     receipts with distinct codes / validation status / timestamps.
//   - Historical / past-cycle redemptions remain viewable forever
//     (the backend `getMyRedemption` has no cycle gate).
//   - TIME_LIMITED redemptions retain their historical context even
//     after the offer window closes.
//   - Future deep-links (e.g. notification: "Your code was validated")
//     have a stable receipt URL to target.
//
// State machine:
//
//   loading   summary fetching
//   error     backend rejected (REDEMPTION_NOT_FOUND or other)
//   active    !isValidated && isPresentationActive(redeemedAt)
//   validated  isValidated
//   ended     !isValidated && !isPresentationActive
//
// Code visibility:
//   active    → code visible + "Show to staff" semantic
//   validated → code visible (historical record) + "Validated by staff" chip
//   ended     → code visible (historical record) + "Window ended" caption
//
// Code is ALWAYS shown when the screen has data — the user opened
// their own receipt; they're entitled to see it.  The action
// affordance changes by state; the data does not.

type ReceiptState = 'active' | 'validated' | 'ended'

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const day  = d.getDate()
  const mon  = d.toLocaleDateString('en-GB', { month: 'short' })
  const year = d.getFullYear()
  const hh   = String(d.getHours()).padStart(2, '0')
  const mm   = String(d.getMinutes()).padStart(2, '0')
  return `${day} ${mon} ${year}, ${hh}:${mm}`
}

// Code displayed as "A7K2 P9X4" (4+4 grouping), matching the canonical
// `mono.redemption` rendering used in ShowToStaff.  Pure-fn helper.
function formatCode(raw: string): string {
  const clean = raw.replace(/\s/g, '')
  if (clean.length === 8) return `${clean.slice(0, 4)} ${clean.slice(4)}`
  return clean
}

function methodLabel(method: ValidationMethod): string | null {
  if (method === 'QR_SCAN') return 'QR scan'
  if (method === 'MANUAL')  return 'Manual code'
  return null
}

export function RedemptionDetailScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ id?: string; from?: string }>()

  const redemptionId = typeof params.id === 'string' ? params.id : undefined
  const from         = typeof params.from === 'string' ? params.from : undefined

  const query = useMyRedemption(redemptionId)

  // Back-nav contract: if we know where we came from, route home to
  // that tab cleanly.  Default fallback is router.back() which uses
  // the nav stack.  Only `savings` is supported today (the screen's
  // only consumer); extend as other surfaces add receipt deep-links.
  const handleBack = useCallback(() => {
    if (from === 'savings') {
      router.push('/(app)/savings' as never)
      return
    }
    router.back()
  }, [router, from])

  // ── Derive receipt state ────────────────────────────────────────
  const receiptState: ReceiptState | undefined = useMemo(() => {
    if (!query.data) return undefined
    if (query.data.isValidated) return 'validated'
    if (isPresentationActive(query.data.redeemedAt)) return 'active'
    return 'ended'
  }, [query.data])

  // ── Loading + error early returns ───────────────────────────────
  if (!redemptionId) {
    return (
      <View style={styles.screen} testID="redemption-detail-no-id">
        <BackHeader insetsTop={insets.top} onBack={handleBack} />
        <View style={styles.errorWrap}>
          <ErrorState
            title="Couldn't load this redemption"
            description="The link is missing a redemption id."
          />
        </View>
      </View>
    )
  }
  if (query.isLoading) {
    return (
      <View style={styles.screen} testID="redemption-detail-loading">
        <BackHeader insetsTop={insets.top} onBack={handleBack} />
      </View>
    )
  }
  if (query.isError || !query.data) {
    return (
      <View style={styles.screen} testID="redemption-detail-error">
        <BackHeader insetsTop={insets.top} onBack={handleBack} />
        <View style={styles.errorWrap}>
          <ErrorState
            title="Couldn't load this redemption"
            description="It may have been removed, or there was a connection problem."
            actionLabel="Retry"
            onRetry={() => query.refetch()}
          />
        </View>
      </View>
    )
  }

  const r = query.data
  const vtLabel       = voucherTypeLabel(r.voucher.voucherType)
  const vtLabelAsNoun = `${vtLabel} voucher`
  const codeFormatted = formatCode(r.redemptionCode)
  const validatedAtLabel = r.validatedAt ? formatDateTime(r.validatedAt) : null
  const methodSecondary  = methodLabel(r.validationMethod)
  const addressLine = [r.branch.addressLine1, r.branch.city, r.branch.postcode]
    .filter(Boolean)
    .join(', ')

  // ── Render ──────────────────────────────────────────────────────
  return (
    <View style={styles.screen} testID="redemption-detail">
      <BackHeader insetsTop={insets.top} onBack={handleBack} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Identity header (merchant + branch + type + title) ── */}
        <View style={styles.identityCard}>
          <Text variant="label.eyebrow" style={styles.eyebrow} testID="redemption-detail-type-eyebrow">
            {vtLabelAsNoun}
          </Text>
          <Text variant="display.sm" style={styles.merchantTitle}>
            {r.voucher.merchant.businessName}
          </Text>
          <Text variant="body.sm" style={styles.branchLine}>
            {r.branch.name}
          </Text>
          <Text variant="heading.sm" style={styles.voucherTitleLine} testID="redemption-detail-voucher-title">
            {r.voucher.title}
          </Text>
        </View>

        {/* ── Saving amount block ──────────────────────────────── */}
        <View style={styles.savingBlock}>
          <Text variant="label.eyebrow" style={styles.eyebrowMuted}>You saved</Text>
          <Text style={styles.savingAmount} testID="redemption-detail-saving">
            £{r.estimatedSaving.toFixed(2)}
          </Text>
        </View>

        {/* ── Redemption code block ────────────────────────────── */}
        <View style={styles.codeCard} testID="redemption-detail-code-card">
          <Text variant="label.eyebrow" style={styles.eyebrowMuted}>Redemption code</Text>
          <Text style={styles.codeText} testID="redemption-detail-code">
            {codeFormatted}
          </Text>

          {receiptState === 'active' && (
            <View style={styles.statusRow} testID="redemption-detail-status-active">
              <Clock size={14} color={color.warning} />
              <Text variant="body.sm" style={styles.statusActive}>
                Show to staff to validate
              </Text>
            </View>
          )}
          {receiptState === 'validated' && (
            <View style={styles.statusRow} testID="redemption-detail-status-validated">
              <View style={styles.validatedChip}>
                <Check size={12} color={color.success} />
                <Text style={styles.validatedChipText}>Validated by staff</Text>
              </View>
              {(validatedAtLabel || methodSecondary) && (
                <Text variant="body.sm" style={styles.statusSecondary}>
                  {validatedAtLabel}{methodSecondary ? ` · ${methodSecondary}` : ''}
                </Text>
              )}
            </View>
          )}
          {receiptState === 'ended' && (
            <View style={styles.statusRow} testID="redemption-detail-status-ended">
              <Clock size={14} color={color.text.tertiary} />
              <Text variant="body.sm" style={styles.statusEnded}>
                Show-to-staff window ended
              </Text>
            </View>
          )}
        </View>

        {/* ── Receipt facts ────────────────────────────────────── */}
        <View style={styles.factsCard}>
          <FactRow
            icon={<Calendar size={16} color={color.text.tertiary} />}
            label="Redeemed"
            value={formatDateTime(r.redeemedAt)}
            testID="redemption-detail-redeemed-at"
          />
          <FactRow
            icon={<MapPin size={16} color={color.text.tertiary} />}
            label="Where"
            value={addressLine || r.branch.name}
            testID="redemption-detail-where"
          />
        </View>

        {/* ── Actions ──────────────────────────────────────────── */}
        {/* "See merchant" is always available per owner direction —
            a stable secondary action on every receipt regardless of
            voucher state.  Routes via /(app)/merchant/{merchantId};
            ?from=savings on the inbound URL ALSO flows to merchant
            here so its back-nav (once §BK lands) can return to the
            tab that originally surfaced this receipt. */}
        <View style={styles.actions}>
          <PressableScale
            onPress={() => router.push(
              `/(app)/merchant/${r.voucher.merchant.id}${from ? `?from=${from}` : ''}` as never,
            )}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel="See merchant"
            testID="redemption-detail-see-merchant"
          >
            <Text variant="heading.sm" style={styles.actionText}>See merchant</Text>
          </PressableScale>
        </View>
      </ScrollView>
    </View>
  )
}

// ─── Sub-components ───────────────────────────────────────────────

function BackHeader({ insetsTop, onBack }: { insetsTop: number; onBack: () => void }) {
  return (
    <View style={[styles.headerWrap, { paddingTop: insetsTop + 8 }]}>
      <Pressable
        onPress={onBack}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Back"
        testID="redemption-detail-back"
        style={styles.backBtn}
      >
        <ArrowLeft size={22} color={color.text.primary} />
      </Pressable>
      <Text variant="heading.sm" style={styles.headerTitle}>
        Redemption receipt
      </Text>
      <View style={styles.backBtn} />
    </View>
  )
}

function FactRow({
  icon,
  label,
  value,
  testID,
}: {
  icon: React.ReactNode
  label: string
  value: string
  testID?: string
}) {
  return (
    <View style={styles.factRow} testID={testID}>
      <View style={styles.factIcon}>{icon}</View>
      <View style={styles.factTextBlock}>
        <Text variant="label.md" style={styles.factLabel}>{label}</Text>
        <Text variant="body.sm" style={styles.factValue}>{value}</Text>
      </View>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.surface.neutral,
  },
  headerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    backgroundColor: color.surface.page,
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: color.text.primary,
  },
  scrollContent: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    paddingBottom: layout.tabBarHeight + spacing[7],
    gap: spacing[4],
  },

  // ── Identity card ────────────────────────────────────────────
  identityCard: {
    backgroundColor: color.surface.raised,
    borderRadius: radius.lg,
    padding: spacing[5],
    gap: spacing[1],
    ...elevation.sm,
  },
  eyebrow: {
    color: color.text.tertiary,
    marginBottom: spacing[1],
  },
  merchantTitle: {
    color: color.text.primary,
  },
  branchLine: {
    color: color.text.secondary,
  },
  voucherTitleLine: {
    color: color.text.primary,
    marginTop: spacing[3],
  },

  // ── Saving amount ────────────────────────────────────────────
  savingBlock: {
    alignItems: 'flex-start',
    paddingHorizontal: spacing[2],
    gap: spacing[1],
  },
  eyebrowMuted: {
    color: color.text.tertiary,
  },
  savingAmount: {
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: 40,
    lineHeight: 44,
    color: color.savingsGreen,
    fontVariant: ['tabular-nums'],
  },

  // ── Code card ────────────────────────────────────────────────
  codeCard: {
    backgroundColor: color.surface.raised,
    borderRadius: radius.lg,
    padding: spacing[5],
    gap: spacing[2],
    ...elevation.sm,
  },
  codeText: {
    fontFamily: 'Lato-Bold',
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: 4,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[2],
    flexWrap: 'wrap',
  },
  statusActive: {
    color: color.warning,
    fontFamily: 'Lato-SemiBold',
  },
  statusEnded: {
    color: color.text.tertiary,
  },
  statusSecondary: {
    color: color.text.tertiary,
  },
  validatedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  validatedChipText: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 12,
    color: color.success,
  },

  // ── Facts card ───────────────────────────────────────────────
  factsCard: {
    backgroundColor: color.surface.raised,
    borderRadius: radius.lg,
    padding: spacing[4],
    gap: spacing[3],
    ...elevation.sm,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  factIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  factTextBlock: {
    flex: 1,
    gap: 2,
  },
  factLabel: {
    color: color.text.tertiary,
  },
  factValue: {
    color: color.text.primary,
  },

  // ── Actions ──────────────────────────────────────────────────
  actions: {
    gap: spacing[3],
    marginTop: spacing[2],
  },
  actionButton: {
    backgroundColor: color.navy,
    borderRadius: radius.md,
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    alignItems: 'center',
  },
  actionText: {
    color: '#FFFFFF',
    fontFamily: 'Lato-SemiBold',
  },

  // ── Error ────────────────────────────────────────────────────
  errorWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
  },
})
