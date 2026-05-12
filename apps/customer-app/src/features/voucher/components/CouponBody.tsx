import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { Check, Clock, FileText, Home, Info, Shield, Tag } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import type { VoucherType } from '@/lib/api/voucher'
import { voucherGradient } from '../utils/voucherTheme'
import { ReusableGuidanceCard } from './ReusableGuidanceCard'
import {
  FAIR_USE_TITLE,
  deriveDineInPill,
  fairUseLinesForVoucherType,
  splitTermsIntoBullets,
} from '../constants/productCopy'

type CouponTopCardProps = {
  type: VoucherType
  imageUrl: string | null
  expiryDate: string | null  // ISO
  isMultiBranch: boolean
  /**
   * Voucher terms — passed through to derive the "Dine-in only" pill
   * from terms content. Per v4 mockup the pill row sits in the top
   * card; the terms themselves render in the bottom card.
   */
  terms: string | null
}

type CouponBodyCardProps = {
  /**
   * Voucher type — drives the Fair Use lines via
   * fairUseLinesForVoucherType(). BOGO gets the guest/group rule;
   * other types get the universal three.
   */
  type: VoucherType
  /**
   * Voucher terms — backend stores this as a single string; we split
   * into bullet items for display via splitTermsIntoBullets().
   * For non-TL voucher types description lives in the coupon header
   * (per v4 mockup); for TIME_LIMITED it moves into this card via the
   * `description` prop below (M4d spec D6(C)).
   */
  terms: string | null
  /**
   * M4d additive — TIME_LIMITED + REUSABLE (D6(C) scope fence, extended
   * 2026-05-12 Gate E for REUSABLE per spec §7.3).
   *
   * Description moves out of the hero and into the coupon body for
   * TIME_LIMITED AND REUSABLE vouchers (CouponHeader already suppresses
   * the in-column description for both types). Passing this prop on
   * other types is a no-op — description renders in <CouponHeader>
   * for BOGO / DISCOUNT / FREEBIE / PACKAGE / SPEND_AND_SAVE.
   */
  description?: string | null
  /**
   * M4d additive — TIME_LIMITED only.
   * Human-readable availability window (e.g. "Mon-Fri, 11am-3pm").
   */
  scheduleString?: string | null
  /**
   * M4d additive — TIME_LIMITED only.
   * ISO expiry; renders the "Offer ends" section when present.
   */
  expiryDate?: string | null
}

/**
 * M4d — Hermes-robust expiry formatter.
 *
 * Mirrors `RedemptionDetailsCard.formatExpiryLine`: numeric parts via
 * Intl.DateTimeFormat.formatToParts + hardcoded English month array.
 * AVOID `weekday: 'short' | 'long'` and locale-string formatters
 * (CLDR-strip risk on Hermes — see memory: reference_london_clock_helper.md).
 */
function formatExpiryDate(iso: string): string {
  const date = new Date(iso)
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'] as const
  const FORMATTER = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London',
    year: 'numeric', month: 'numeric', day: 'numeric',
  })
  const parts = FORMATTER.formatToParts(date)
  const get = (t: Intl.DateTimeFormatPartTypes): number => {
    const p = parts.find(x => x.type === t)
    if (!p) throw new Error(`formatExpiryDate: missing ${t}`)
    return parseInt(p.value, 10)
  }
  const year = get('year')
  const month = get('month')
  const day = get('day')
  return `${day} ${MONTHS[month - 1]} ${year}`
}

const NAVY        = '#010C35'
const TEXT_2ND    = '#4B5563'
const TEXT_MUTED  = '#9CA3AF'
const SAVING_GRN  = '#16A34A'
const ROSE        = '#E20C04'
const CREAM       = '#FFF9F5'

/**
 * Coupon TOP card — banner image (or gradient placeholder) + voucher
 * info pills. Sits between the outer perforation (under header) and
 * the inner perforation (above body). Per v4 §coupon-top-card.
 */
export function CouponTopCard({ type, imageUrl, expiryDate, isMultiBranch, terms }: CouponTopCardProps) {
  const expiryLabel = expiryDate
    ? `Expires ${new Date(expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : null
  const dineInLabel = deriveDineInPill(terms)

  // Banner image is shown ONLY when an actual imageUrl is provided
  // (round-13 impeccable critique fix). Empty-state placeholders feel
  // like dead space; when there's no image, the top card collapses to
  // just the voucher details pills row, which is honest about the
  // available content.
  const [light] = voucherGradient(type)

  return (
    <View style={styles.topCard} testID="coupon-top-card">
      {imageUrl ? (
        <View style={styles.banner} testID="coupon-top-banner-image">
          <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        </View>
      ) : (
        // No image: render a thin tint band so the type-color
        // identity carries through to the body, but at 6pt it reads
        // as an accent line rather than a content area. Saves ~150pt
        // of vertical real estate vs the round-12 placeholder.
        // PRODUCT.md anti-fabrication rule: never paint a placeholder
        // banner image — the accent-line fallback is the honest UI.
        <View
          testID="coupon-top-accent-line"
          style={[styles.bannerAccentLine, { backgroundColor: light }]}
          pointerEvents="none"
        />
      )}

      <View style={styles.infoBlock}>
        <Text variant="label.md" style={styles.infoTitle}>VOUCHER DETAILS</Text>
        <View style={styles.pillsRow}>
          {expiryLabel ? (
            <Pill tone="expiry" icon={<Clock size={14} color="#B91C1C" strokeWidth={2.2} />}>
              {expiryLabel}
            </Pill>
          ) : (
            <Pill tone="ongoing" icon={<Check size={14} color="#166534" strokeWidth={2.4} />}>
              No expiry
            </Pill>
          )}
          {dineInLabel ? (
            <Pill tone="neutral" icon={<Home size={14} color={TEXT_2ND} strokeWidth={2} />}>
              {dineInLabel}
            </Pill>
          ) : null}
          <Pill tone="neutral" icon={<Tag size={14} color={TEXT_2ND} strokeWidth={2} />}>
            {isMultiBranch ? 'All branches' : 'Single branch'}
          </Pill>
        </View>
      </View>
    </View>
  )
}

/**
 * Coupon BODY card — terms list + fair-use card. Sits below the inner
 * perforation. Per v4 §coupon-body.
 *
 * Description is NOT rendered here — it appears in the CouponHeader
 * (per v4 mockup screen 1). Showing it twice on the same screen was
 * a Round-1 visual regression.
 */
export function CouponBodyCard({
  type,
  terms,
  description,
  scheduleString,
  expiryDate,
}: CouponBodyCardProps) {
  const termsList    = splitTermsIntoBullets(terms)
  const fairUseLines = fairUseLinesForVoucherType(type)
  const isTL = type === 'TIME_LIMITED'
  const isReusable = type === 'REUSABLE'

  return (
    <View style={styles.bodyCard} testID="coupon-body">
      {/* M5 Task 10 (D24) → M5 Gate E polish (Issue 3, 2026-05-12) —
          REUSABLE coupon-body block. Brought to parity with the TL
          body's content richness so the REUSABLE body doesn't feel
          sparse next to TL:
            • USAGE RULE     — type-aware advisory copy. No "wait" /
                               "cooldown" wording (Q8 D42/D43 lock).
            • Guidance card  — existing pale-amber two-clock card.
            • ABOUT THIS OFFER — description moved from hero to body
                               (D6(C) pattern, mirrors TL — spec §7.3).
            • Bottom spacer  — 16pt gap above Terms heading. Matches
                               the spacing rhythm under the TL block;
                               keeps Terms from feeling glued to the
                               last REUSABLE section. */}
      {isReusable ? (
        <>
          <View
            testID="coupon-body-usage-rule"
            accessibilityLabel="This voucher becomes available again after each use"
            style={styles.tlSection}
          >
            <Text variant="label.eyebrow" style={styles.tlSectionLabel}>USAGE RULE</Text>
            <Text variant="body.md" style={styles.tlSectionBody}>This voucher becomes available again after each use.</Text>
          </View>

          <ReusableGuidanceCard />

          {description ? (
            <View testID="coupon-body-description" style={styles.tlSection}>
              <Text variant="label.eyebrow" style={styles.tlSectionLabel}>ABOUT THIS OFFER</Text>
              <Text variant="body.md" style={styles.tlSectionBody}>{description}</Text>
            </View>
          ) : null}

          <View testID="coupon-body-reusable-bottom-spacer" style={styles.reusableBottomSpacer} />
        </>
      ) : null}

      {/* M4d (D6(C)) — TIME_LIMITED-only sections rendered BEFORE the
          existing Terms section. Non-TL voucher types are unchanged in
          M4d; the universal description-in-coupon-body move is the
          §AN1 follow-up post-M4d. */}
      {isTL ? (
        <>
          {scheduleString ? (
            <View
              testID="coupon-body-availability"
              accessibilityLabel={`Available during ${scheduleString}`}
              style={styles.tlSection}
            >
              <Text variant="label.eyebrow" style={styles.tlSectionLabel}>AVAILABILITY</Text>
              <Text variant="body.md" style={styles.tlSectionBody}>{scheduleString}</Text>
            </View>
          ) : null}

          <View
            testID="coupon-body-usage-rule"
            accessibilityLabel="Redeem once per active window"
            style={styles.tlSection}
          >
            <Text variant="label.eyebrow" style={styles.tlSectionLabel}>USAGE RULE</Text>
            <Text variant="body.md" style={styles.tlSectionBody}>Redeem once per active window.</Text>
          </View>

          {/* TL wording amendment 2026-05-11 — Goal 2 guidance card.
              Pale amber inner surface + 1px hairline border + brand-rose
              Info glyph. Sits between Usage rule and Description so the
              user reads the rule, then sees the time-bounded handoff
              window guidance, then the merchant's description. Card
              renders unconditionally for TL (independent of description
              presence) — the guidance is foundational to understanding
              TL behaviour. */}
          <View
            testID="coupon-body-redeem-guidance"
            accessibilityLabel="Redeem before the window ends. Redeem this voucher before the availability window ends. Once redeemed, your code stays available to show staff for up to 2 hours."
            style={styles.tlGuidance}
          >
            <View style={styles.tlGuidanceHeading}>
              <Info size={16} color={ROSE} strokeWidth={2} />
              <Text variant="label.md" style={styles.tlGuidanceTitle}>Redeem before the window ends</Text>
            </View>
            <Text variant="body.sm" style={styles.tlGuidanceBody}>
              Redeem this voucher before the availability window ends. Once redeemed, your code stays available to show staff for up to 2 hours.
            </Text>
          </View>

          {description ? (
            <View testID="coupon-body-description" style={styles.tlSection}>
              <Text variant="label.eyebrow" style={styles.tlSectionLabel}>ABOUT THIS OFFER</Text>
              <Text variant="body.md" style={styles.tlSectionBody}>{description}</Text>
            </View>
          ) : null}
        </>
      ) : null}

      {termsList.length > 0 ? (
        <View testID="coupon-body-terms" style={styles.section}>
          <View style={styles.sectionHeading}>
            <FileText size={17} color={ROSE} strokeWidth={2} />
            <Text variant="label.md" style={styles.sectionTitle}>Terms &amp; Conditions</Text>
          </View>
          <View style={styles.termsList}>
            {termsList.map((line, i) => (
              <View key={i} style={[styles.termsRow, i === termsList.length - 1 && styles.termsRowLast]}>
                <Check size={15} color={SAVING_GRN} strokeWidth={2.4} />
                <Text variant="body.sm" style={styles.termsText}>{line}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Fair Use Policy — kept as a nested card by owner direction
          (round 13). Reuses sectionHeading + sectionTitle styles from
          the Terms section above for typographic consistency. The
          containing `styles.fairUse` cream-tinted card surface is the
          deliberate exception to impeccable's nested-card law (see
          memory: feedback_voucher_detail_fair_use_card.md). */}
      <View testID="coupon-body-fair-use" style={styles.fairUse}>
        <View style={styles.sectionHeading}>
          <Shield size={16} color={ROSE} strokeWidth={2} />
          <Text variant="label.md" style={styles.sectionTitle}>{FAIR_USE_TITLE}</Text>
        </View>
        {fairUseLines.map((line, i) => (
          <View key={i} style={styles.fairItem}>
            <Info size={13} color={TEXT_MUTED} strokeWidth={2} />
            <Text variant="body.sm" style={styles.fairItemText}>{line}</Text>
          </View>
        ))}
      </View>

      {/* M4d (D6(C)) — Offer ends section sits AFTER Fair Use, TL +
          non-null expiryDate only. Hermes-robust en-GB formatter via
          formatExpiryDate above. */}
      {isTL && expiryDate ? (
        <View testID="coupon-body-offer-ends" style={styles.tlSection}>
          <Text variant="label.eyebrow" style={styles.tlSectionLabel}>OFFER ENDS</Text>
          <Text variant="body.md" style={styles.tlSectionBody}>{formatExpiryDate(expiryDate)}</Text>
        </View>
      ) : null}
    </View>
  )
}

// ── Internal pieces ──────────────────────────────────────────────────────────

function Pill({ tone, icon, children }: {
  tone: 'ongoing' | 'expiry' | 'neutral'
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <View style={[styles.pill, tone === 'ongoing' && styles.pillOngoing, tone === 'expiry' && styles.pillExpiry, tone === 'neutral' && styles.pillNeutral]}>
      {icon}
      <Text variant="label.md" style={[
        styles.pillText,
        tone === 'ongoing' && styles.pillTextOngoing,
        tone === 'expiry'  && styles.pillTextExpiry,
        tone === 'neutral' && styles.pillTextNeutral,
      ]}>
        {children}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  // ── TOP CARD (banner + pills) ──────────────────────────────────────
  topCard: {
    backgroundColor: '#FDFBF8',  // round-13 (impeccable): tinted warm white in brand hue family (H≈30) instead of pure #FFF
    overflow: 'hidden',
  },
  banner: {
    // M4d (D5): bumped from 180 → 240 to give the banner image more
    // presence on TL vouchers — they have urgency + countdown above
    // and need the visual weight to compete. Applies to all types
    // (non-TL keeps its existing card structure but benefits from
    // the larger image when imageUrl is present).
    height: 240,
    backgroundColor: '#1a1a2e',
    overflow: 'hidden',
  },
  // Round-13: thin type-color accent line replaces the dark dead-space
  // placeholder when no banner image is provided. 6pt of presence,
  // ~150pt less vertical real estate than the previous gradient.
  bannerAccentLine: {
    height: 6,
  },
  infoBlock: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 20,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: TEXT_MUTED,
    marginBottom: 14,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 9,
  },
  pillOngoing: { backgroundColor: '#ECFDF5' },
  pillExpiry:  { backgroundColor: '#FEF2F2' },
  pillNeutral: { backgroundColor: 'rgba(0,0,0,0.05)' },
  pillText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  pillTextOngoing: { color: '#166534' },
  pillTextExpiry:  { color: '#B91C1C' },
  pillTextNeutral: { color: TEXT_2ND },

  // ── BODY CARD (terms + fair use) ────────────────────────────────────
  bodyCard: {
    backgroundColor: '#FDFBF8',  // round-13 (impeccable): tinted warm white in brand hue family (H≈30) instead of pure #FFF
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 26,
  },
  section: {
    marginBottom: 18,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: NAVY,
  },
  termsList: {
    gap: 0,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  termsRowLast: {
    borderBottomWidth: 0,
  },
  termsText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: TEXT_2ND,
  },
  fairUse: {
    // Round-14: bumped from CREAM (#FFF9F5) to #FCF0E5 so the Fair
    // Use card reads as a slightly more present sub-surface against
    // the body card's tinted white (#FDFBF8). ΔL ≈ 4.5% — same hue
    // family (H≈28) as the identity-zone gradient bottom stop, so
    // the color is already vouched-for in the brand surface
    // language. Border bumped to 0.06 alpha to match the firmer
    // surface presence.
    backgroundColor: '#FCF0E5',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    marginTop: 8,
  },
  fairItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingVertical: 5,
  },
  fairItemText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: TEXT_2ND,
  },

  // ── M4d (D6(C)) TL-only sections ───────────────────────────────────
  tlSection: {
    marginTop: 16,
  },
  tlSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  tlSectionBody: {
    fontSize: 14,
    color: '#1F2937',
    lineHeight: 21,
  },

  // ── TL guidance card (Goal 2, TL wording amendment 2026-05-11) ─────
  // Pale amber inner surface distinct from the cream body bg (#FDFBF8)
  // and the cream Fair Use sub-card (#FCF0E5) — amber-warm tint signals
  // "advisory / heads-up" without screaming. Hairline border 1px in
  // amber-tinted alpha so it reads as a single intentional surface, not
  // a stacked sub-card.
  tlGuidance: {
    marginTop: 16,
    backgroundColor: '#FEF7E6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.18)',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  tlGuidanceHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  tlGuidanceTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: NAVY,
  },
  tlGuidanceBody: {
    fontSize: 13,
    lineHeight: 19,
    color: TEXT_2ND,
  },

  // M5 Gate E polish (Issue 2) — REUSABLE bottom spacer.
  // Sits AFTER the trailing REUSABLE section (description, or guidance
  // card when description is null) and BEFORE the Terms section. The
  // `section` style at the Terms heading has no marginTop, so without
  // this spacer the Terms heading reads as glued to the previous
  // REUSABLE content. 16pt matches the marginTop:16 cadence used by
  // tlSection / TL guidance / ReusableGuidanceCard.
  reusableBottomSpacer: {
    height: 16,
  },
})
