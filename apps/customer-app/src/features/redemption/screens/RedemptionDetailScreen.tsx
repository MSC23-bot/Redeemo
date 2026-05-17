import React, { useCallback, useMemo } from 'react'
import { View, ScrollView, Pressable, StyleSheet } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowLeft, Check } from '@/design-system/icons'
import { Text } from '@/design-system/Text'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { ErrorState } from '@/design-system/components/ErrorState'
import { color, radius, spacing, elevation, layout } from '@/design-system/tokens'
import { voucherTypeLabel, voucherGradient } from '@/features/voucher/utils/voucherTheme'
import { isPresentationActive } from '@/features/voucher/utils/presentationWindow'
import { useMyRedemption } from '../hooks/useMyRedemption'
import type { ValidationMethod } from '../hooks/useMyRedemption'

// §Savings Redemption Receipt — PR #105 device-QA round-5, 2026-05-18.
//
// Dedicated route at `/(app)/redemption/[id]`.  Fetches a SPECIFIC
// redemption event by id (not by voucher id) so each event opens
// its OWN receipt — load-bearing for REUSABLE vouchers where many
// redemptions share one voucherId.
//
// Visual composition (locked round-5 owner direction):
//
//   [back ←]   Redemption
//   ┌──────────────────────────────────────┐
//   │ [cream identity zone — gradient]     │
//   │ ▌Type accent gradient strip (left)  │
//   │   REUSABLE VOUCHER  (type chip)      │
//   │   Half-price pizza Monday  (Display) │
//   │   Covelum · Brightlingsea  (caption) │
//   │   Half off everything on the menu    │
//   │   on Mondays from 5pm.   (desc body) │
//   └──────────────────────────────────────┘
//   [white receipt surface — single card]
//   ┌──────────────────────────────────────┐
//   │  YOU SAVED                           │
//   │  £12.50  (Display LG savings-green)  │
//   │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
//   │  REDEMPTION CODE                     │
//   │  A7K2 P9X4  (mono.redemption)        │
//   │  Receipt only. {state copy}          │
//   │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
//   │  REDEEMED                            │
//   │  17 May 2026, 14:23                  │
//   │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
//   │  WHERE                               │
//   │  12 High Street, Brightlingsea,      │
//   │  CO7 0AB                             │
//   │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
//   │  TERMS  (only when present)          │
//   │  One per customer per cycle.         │
//   └──────────────────────────────────────┘
//   [See merchant — navy outline secondary]
//
// State machine:
//   active     !isValidated && isPresentationActive(redeemedAt)
//   validated  isValidated
//   ended      !isValidated && !isPresentationActive
//
// Code is ALWAYS shown when the screen has data — the user is
// viewing their own receipt; the code is part of the historical
// record.  Status copy (NOT the code visibility) varies by state.

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
  const typeGradient    = voucherGradient(r.voucher.voucherType)
  const typeAccentColor = typeGradient[1]          // darker stop — load-bearing for type identity
  const vtLabel         = voucherTypeLabel(r.voucher.voucherType)
  const vtLabelAsNoun   = `${vtLabel} voucher`
  const codeFormatted   = formatCode(r.redemptionCode)
  const validatedAtLabel = r.validatedAt ? formatDateTime(r.validatedAt) : null
  const methodSecondary  = methodLabel(r.validationMethod)
  const description      = r.voucher.description?.trim() || null
  const terms            = r.voucher.terms?.trim() || null
  const addressLine = [r.branch.addressLine1, r.branch.city, r.branch.postcode]
    .filter(Boolean)
    .join(', ')

  // Locked copy per owner direction (round-5).  "Receipt only" lead
  // sets the screen's identity unambiguously: this surface is NOT
  // the presentation screen.  Non-accusatory voice throughout.
  const statusCopy: Record<ReceiptState, string> = {
    active:    'Receipt only. To present this code, open Show to Staff on your voucher.',
    validated: 'Validated by staff.',
    ended:     'Receipt only. The Show to Staff window has ended.',
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <View style={styles.screen} testID="redemption-detail">
      <BackHeader insetsTop={insets.top} onBack={handleBack} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Cream identity zone ─────────────────────────────────── */}
        {/* The screen's identity moment.  Cream gradient backdrop
            (DESIGN.md Cream-for-Identity Rule); voucher-type accent
            strip on the left edge carries the type's brand colour
            without saturating the whole surface (controlled accent
            per owner direction). */}
        <View style={styles.identityWrap} testID="redemption-detail-identity">
          <LinearGradient
            colors={['#FFF9F5', '#FCF0E5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={typeGradient as unknown as readonly [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.typeAccentStrip}
            testID="redemption-detail-type-accent"
          />
          <View style={styles.identityInner}>
            <View
              style={[styles.typeChip, { borderColor: typeAccentColor }]}
              testID="redemption-detail-type-eyebrow"
            >
              <Text style={[styles.typeChipText, { color: typeAccentColor }]}>
                {vtLabelAsNoun.toUpperCase()}
              </Text>
            </View>
            <Text variant="display.sm" style={styles.voucherTitle} testID="redemption-detail-voucher-title">
              {r.voucher.title}
            </Text>
            <Text variant="body.sm" style={styles.merchantBranchLine}>
              {r.voucher.merchant.businessName} · {r.branch.name}
            </Text>
            {description && (
              <Text
                variant="body.md"
                style={styles.descriptionText}
                testID="redemption-detail-description"
              >
                {description}
              </Text>
            )}
          </View>
        </View>

        {/* ── Receipt surface (one white card, divider rows) ─────── */}
        {/* Single surface.raised card — DESIGN.md No-Card-On-Card
            Rule.  Sections separated by hairline dividers (not
            nested boxes) so the whole receipt reads as one record. */}
        <View style={styles.receipt} testID="redemption-detail-receipt">
          <View style={styles.row}>
            <Text variant="label.eyebrow" style={styles.rowEyebrow}>You saved</Text>
            <Text style={styles.savingAmount} testID="redemption-detail-saving">
              £{r.estimatedSaving.toFixed(2)}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text variant="label.eyebrow" style={styles.rowEyebrow}>Redemption code</Text>
            <Text style={styles.codeText} testID="redemption-detail-code">
              {codeFormatted}
            </Text>

            {receiptState === 'active' && (
              <Text
                variant="body.sm"
                style={styles.statusCopy}
                testID="redemption-detail-status-active"
              >
                {statusCopy.active}
              </Text>
            )}

            {receiptState === 'validated' && (
              <View style={styles.validatedBlock} testID="redemption-detail-status-validated">
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
              <Text
                variant="body.sm"
                style={styles.statusCopy}
                testID="redemption-detail-status-ended"
              >
                {statusCopy.ended}
              </Text>
            )}
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text variant="label.eyebrow" style={styles.rowEyebrow}>Redeemed</Text>
            <Text variant="body.md" style={styles.rowValue} testID="redemption-detail-redeemed-at">
              {formatDateTime(r.redeemedAt)}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text variant="label.eyebrow" style={styles.rowEyebrow}>Where</Text>
            <Text variant="body.md" style={styles.rowValue} testID="redemption-detail-where">
              {addressLine || r.branch.name}
            </Text>
          </View>

          {terms && (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text variant="label.eyebrow" style={styles.rowEyebrow}>Terms</Text>
                <Text variant="body.sm" style={styles.termsText} testID="redemption-detail-terms">
                  {terms}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* ── Actions row ─────────────────────────────────────────── */}
        {/* "See merchant" stays as the only action in this commit.
            "Review this visit" lands in commit 3 alongside the
            verified-review wire-up. */}
        <View style={styles.actions}>
          <PressableScale
            onPress={() => router.push(
              `/(app)/merchant/${r.voucher.merchant.id}${from ? `?from=${from}` : ''}` as never,
            )}
            style={styles.secondaryButton}
            accessibilityRole="button"
            accessibilityLabel="See merchant"
            testID="redemption-detail-see-merchant"
          >
            <Text variant="heading.sm" style={styles.secondaryButtonText}>See merchant</Text>
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
        Redemption
      </Text>
      <View style={styles.backBtn} />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────

const TYPE_ACCENT_STRIP_WIDTH = 4

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
    paddingBottom: layout.tabBarHeight + spacing[7],
  },

  // ── Cream identity zone ──────────────────────────────────────
  identityWrap: {
    position: 'relative',
    overflow: 'hidden',
  },
  // Voucher-type accent strip — left edge, full-height of the
  // identity zone.  Controlled accent: visible but doesn't saturate
  // the whole surface.  Owner direction: type identity should be
  // immediately recognisable.
  typeAccentStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: TYPE_ACCENT_STRIP_WIDTH,
  },
  identityInner: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    paddingBottom: spacing[6],
    paddingLeft: spacing[5] + TYPE_ACCENT_STRIP_WIDTH,
    gap: spacing[2],
  },
  // Type chip — outlined with the voucher-type's dark gradient stop.
  // Subtle but unmistakable: text + border carry the type colour
  // without filling the chip (which would over-saturate).
  typeChip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: 4,
    backgroundColor: color.surface.page,
  },
  typeChipText: {
    fontFamily:    'Lato-SemiBold',
    fontSize:      11,
    lineHeight:    14,
    letterSpacing: 1.4,
  },
  voucherTitle: {
    color: color.text.primary,
    marginTop: spacing[2],
  },
  merchantBranchLine: {
    color: color.text.secondary,
  },
  descriptionText: {
    color: color.text.primary,
    marginTop: spacing[2],
  },

  // ── Receipt surface (single card, divider rows) ──────────────
  receipt: {
    backgroundColor: color.surface.raised,
    borderRadius: radius.lg,
    marginHorizontal: spacing[5],
    marginTop: spacing[4],
    paddingVertical: spacing[2],
    ...elevation.sm,
  },
  row: {
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    gap: spacing[2],
  },
  rowEyebrow: {
    color: color.text.tertiary,
  },
  rowValue: {
    color: color.text.primary,
  },
  divider: {
    height: 1,
    backgroundColor: color.border.subtle,
    marginHorizontal: spacing[5],
  },
  // Hero saving amount.  Display LG (32pt) Mustica Pro in savings-
  // green per DESIGN.md "savings-green is the 'you saved £X'
  // colour" rule.  Tabular nums keeps alignment crisp.
  savingAmount: {
    fontFamily:   'MusticaPro-SemiBold',
    fontSize:     32,
    lineHeight:   36,
    letterSpacing: -0.5,
    color:        color.savingsGreen,
    fontVariant:  ['tabular-nums'],
  },
  // Mono redemption code per DESIGN.md `mono.redemption` variant —
  // Lato Bold 28/34 with +4 tracking, the canonical "show this to
  // staff" type signature.
  codeText: {
    fontFamily:    'Lato-Bold',
    fontSize:      28,
    lineHeight:    34,
    letterSpacing: 4,
    color:         color.text.primary,
    fontVariant:   ['tabular-nums'],
  },
  statusCopy: {
    color: color.text.secondary,
    marginTop: spacing[1],
  },
  statusSecondary: {
    color: color.text.tertiary,
  },
  validatedBlock: {
    marginTop: spacing[1],
    gap: spacing[1],
  },
  validatedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
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
  termsText: {
    color: color.text.secondary,
  },

  // ── Actions ──────────────────────────────────────────────────
  actions: {
    gap: spacing[3],
    marginTop: spacing[5],
    paddingHorizontal: spacing[5],
  },
  secondaryButton: {
    backgroundColor: color.surface.page,
    borderWidth: 1,
    borderColor: color.navy,
    borderRadius: radius.md,
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: color.navy,
    fontFamily: 'Lato-SemiBold',
  },

  // ── Error ────────────────────────────────────────────────────
  errorWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
  },
})
