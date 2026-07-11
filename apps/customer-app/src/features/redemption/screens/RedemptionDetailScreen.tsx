import React, { useCallback, useMemo } from 'react'
import { View, ScrollView, Pressable, Image, StyleSheet } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowLeft, Check } from '@/design-system/icons'
import { Text } from '@/design-system/Text'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { ErrorState } from '@/design-system/components/ErrorState'
import { color, radius, spacing, elevation, layout } from '@/design-system/tokens'
import { voucherTypeLabel } from '@/features/voucher/utils/voucherTheme'
import { isPresentationActive } from '@/features/voucher/utils/presentationWindow'
import { useMyRedemption } from '../hooks/useMyRedemption'
import type { ValidationMethod } from '../hooks/useMyRedemption'
import { merchantDisplayName } from '@/lib/merchantDisplayName'

// §Savings Redemption Receipt — PR #105 device-QA round-8, 2026-05-18.
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
  // Round-7 voucher-type identity pivot: hero now uses the system
  // pastel gradient from `color.voucher.gradientByType[type]` (the
  // DESIGN.md-locked pastel pair) and the type chip is filled with
  // `color.voucher.byType[type]` solid + white text.  The previous
  // `voucherGradient()` (bold pair from voucherTheme) is reserved for
  // the active-offer VoucherCard hero — receipts are calmer.
  const heroGradient    = color.voucher.gradientByType[r.voucher.voucherType]
  const typeAccentColor = color.voucher.byType[r.voucher.voucherType]
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
  const merchantName = merchantDisplayName(r.voucher.merchant)

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
        {/* ── Voucher-type identity zone ──────────────────────────── */}
        {/* Round-7: hero now wears the voucher type's pastel gradient
            from the locked DESIGN.md `gradientByType` token (BOGO
            lavender, REUSABLE teal, TIME_LIMITED amber, etc.).  This
            mirrors the type-colour-as-hero pattern from Voucher
            Detail / VoucherCard, so the receipt reads as a direct
            continuation of the voucher the customer just redeemed.
            The earlier 4px left-edge stripe was an absolute-ban
            pattern (DESIGN.md "Side-stripe borders > 1px never
            intentional") and is gone — type identity is now carried
            by the full hero surface + the filled chip below. */}
        <View style={styles.identityWrap} testID="redemption-detail-identity">
          <LinearGradient
            colors={heroGradient as unknown as readonly [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
            testID="redemption-detail-type-accent"
          />
          <View style={styles.identityInner}>
            {/* §Savings device-QA round-8 — merchant logo top of hero.
                Real logoUrl → rendered as an Image; null → tinted
                initial fallback (matches Savings TopPlaces + the
                history row treatment).  Sits above the type chip so
                the merchant identity is the first thing the receipt
                reads. */}
            <View style={styles.merchantBadge} testID="redemption-detail-merchant-badge">
              {r.voucher.merchant.logoUrl ? (
                <Image
                  source={{ uri: r.voucher.merchant.logoUrl }}
                  style={styles.merchantLogoImage}
                  accessibilityIgnoresInvertColors
                  testID="redemption-detail-merchant-logo"
                />
              ) : (
                <View
                  style={[styles.merchantLogoFallback, { backgroundColor: `${typeAccentColor}22` }]}
                  testID="redemption-detail-merchant-logo-fallback"
                >
                  <Text style={[styles.merchantLogoInitial, { color: typeAccentColor }]}>
                    {(merchantName || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.merchantBadgeText}>
                <Text variant="body.sm" style={styles.merchantBadgeName} numberOfLines={1}>
                  {merchantName}
                </Text>
                <Text variant="body.sm" style={styles.merchantBadgeBranch} numberOfLines={1}>
                  {r.branch.name}
                </Text>
              </View>
            </View>

            <View
              style={[styles.typeChip, { backgroundColor: typeAccentColor }]}
              testID="redemption-detail-type-eyebrow"
            >
              <Text style={styles.typeChipText}>
                {vtLabelAsNoun.toUpperCase()}
              </Text>
            </View>
            <Text variant="display.sm" style={styles.voucherTitle} testID="redemption-detail-voucher-title">
              {r.voucher.title}
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
        {/* Side-by-side actions so the full receipt fits in a single
            standard-iPhone viewport (~763pt body).
            PRIMARY: Review this visit — routes to the verified-review
            flow established by PR-C (merge a80f427).  URL contract
            reused 1:1 from VoucherDetailScreen's SuccessPopup
            onRateReview handler so the review created from this entry
            point gets the same verified attribution via
            `Review.redemptionId`.  Brand gradient + elevation.glow per
            DESIGN.md primary-button pattern.
            SECONDARY: See merchant — solid navy.  Brand-aligned per
            owner direction round-6: matches the savings "Load more"
            pill and reads as a real action surface (replaces the
            previous white outline that felt floating against cream).
            §BM dev-rule: PressableScale `style` lands on the OUTER
            Animated.View — children render inside a styleless inner
            Pressable.  We wrap children in an inner styled View that
            owns padding + radius + overflow + elevation; the gradient
            absoluteFill paints the full padded button bounds, not the
            collapsed text-only inner. */}
        <View style={styles.actions}>
          <PressableScale
            onPress={() => router.push({
              pathname: '/(app)/merchant/[id]',
              params: {
                id:              r.voucher.merchant.id,
                branch:          r.branchId,
                tab:             'reviews',
                openWriteReview: '1',
                fromRedemption:  r.id,
              },
            } as never)}
            style={styles.actionPressable}
            accessibilityRole="button"
            accessibilityLabel="Review this visit"
            testID="redemption-detail-review-this-visit"
          >
            <View style={styles.primaryButtonInner}>
              <LinearGradient
                colors={['#E20C04', '#E84A00']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Text variant="heading.sm" style={styles.primaryButtonText}>
                Review this visit
              </Text>
            </View>
          </PressableScale>

          <PressableScale
            onPress={() => router.push(
              `/(app)/merchant/${r.voucher.merchant.id}${from ? `?from=${from}` : ''}` as never,
            )}
            style={styles.actionPressable}
            accessibilityRole="button"
            accessibilityLabel="See merchant"
            testID="redemption-detail-see-merchant"
          >
            <View style={styles.secondaryButtonInner}>
              <Text variant="heading.sm" style={styles.secondaryButtonText}>See merchant</Text>
            </View>
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
        Redemption Receipt
      </Text>
      <View style={styles.backBtn} />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Round-8 page contract: page = `surface.neutral` (#F8F9FA) — the
  // cool-neutral ground.  The white receipt body card lifts cleanly
  // above it, while the voucher-type pastel hero still reads
  // intentionally against the neutral page.  Round-7 used
  // `surface.page` (#FFFFFF) which made the white receipt card
  // visually identical to the page — the card no longer lifted.
  screen: {
    flex: 1,
    backgroundColor: color.surface.neutral,
  },
  headerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
    backgroundColor: 'transparent',
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
    paddingBottom: layout.tabBarHeight + spacing[6],
  },

  // ── Voucher-type identity zone ───────────────────────────────
  // The hero IS the voucher type's territory.  Pastel gradient comes
  // from `color.voucher.gradientByType[type]` (DESIGN.md token).
  identityWrap: {
    position: 'relative',
    overflow: 'hidden',
  },
  identityInner: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[5],
    gap: spacing[1],
  },
  // Filled voucher-type chip — solid `color.voucher.byType[type]`
  // with white text.  Strong type identity in one confident pop
  // (replaces the round-6 outlined chip which felt thin on coloured
  // pastels).  inline `backgroundColor` is set per render to the
  // per-type accent; this static rule covers shape + type metrics.
  typeChip: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: 4,
  },
  typeChipText: {
    fontFamily:    'Lato-SemiBold',
    fontSize:      11,
    lineHeight:    14,
    letterSpacing: 1.4,
    color:         '#FFFFFF',
  },
  voucherTitle: {
    color: color.text.primary,
    marginTop: spacing[1],
  },
  descriptionText: {
    color: color.text.primary,
    marginTop: spacing[2],
  },
  // §Savings round-8 — merchant badge at the top of the hero.
  // Pairs a small rounded logo with merchant name + branch on two
  // tight lines.  Same shape as Savings TopPlaces + RedemptionRow
  // logo treatment so the merchant identity reads consistently
  // across the surface family.
  merchantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginBottom: spacing[2],
  },
  merchantLogoImage: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: color.surface.subtle,
  },
  merchantLogoFallback: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  merchantLogoInitial: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 18,
  },
  merchantBadgeText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  merchantBadgeName: {
    fontFamily: 'Lato-Bold',
    fontSize: 15,
    color: color.text.primary,
  },
  merchantBadgeBranch: {
    fontFamily: 'Lato-Regular',
    fontSize: 13,
    color: color.text.secondary,
  },

  // ── Receipt surface (single card, divider rows) ──────────────
  // White card lifts above the cream world — the receipt IS the
  // record, the cream identity zone is the moment.  No nested cards.
  receipt: {
    backgroundColor: color.surface.raised,
    borderRadius: radius.lg,
    marginHorizontal: spacing[5],
    marginTop: spacing[3],
    paddingVertical: spacing[1],
    ...elevation.sm,
  },
  row: {
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    gap: spacing[1],
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
  // Hero saving amount.  Display MD (28pt) Mustica Pro in savings-
  // green per DESIGN.md "savings-green is the 'you saved £X'
  // colour" rule.  Tabular nums keeps alignment crisp.
  savingAmount: {
    fontFamily:   'MusticaPro-SemiBold',
    fontSize:     28,
    lineHeight:   32,
    letterSpacing: -0.5,
    color:        color.savingsGreen,
    fontVariant:  ['tabular-nums'],
  },
  // Mono redemption code per DESIGN.md `mono.redemption` variant —
  // Lato Bold 24/30 with +4 tracking, the canonical "show this to
  // staff" type signature.
  codeText: {
    fontFamily:    'Lato-Bold',
    fontSize:      24,
    lineHeight:    30,
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
  // Side-by-side so both fit on a single standard-iPhone viewport.
  // PressableScale outer wrapper is transparent (animation only);
  // the visual surface lives in the inner View.  Each button gets
  // `flex: 1` via the outer so both equally share the row.
  actions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
    paddingHorizontal: spacing[5],
  },
  actionPressable: {
    flex: 1,
  },
  // Primary CTA inner — DESIGN.md primary-button pattern.  Brand
  // gradient (Rose → Coral) painted via LinearGradient absoluteFill
  // behind the label.  elevation.glow gives the brand-rose shadow
  // lift reserved for the customer's primary action this minute.
  // `overflow: hidden` clips the gradient to the pill silhouette.
  primaryButtonInner: {
    borderRadius: radius.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    minHeight: 48,
    ...elevation.glow,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Lato-SemiBold',
  },
  // Secondary CTA inner — solid navy.  Matches the Savings "Load
  // more" pill so brand-aligned actions read with one voice.
  // Owner direction round-6: the previous white outline felt
  // floating against cream; solid navy gives a real action surface.
  secondaryButtonInner: {
    backgroundColor: color.navy,
    borderRadius: radius.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryButtonText: {
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
