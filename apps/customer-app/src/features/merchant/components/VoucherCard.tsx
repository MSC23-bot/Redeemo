import React, { useCallback } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { SvgXml } from 'react-native-svg'
import { Heart, ArrowRight } from 'lucide-react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { lightHaptic } from '@/design-system/haptics'
import { useMotionScale } from '@/design-system/useMotionScale'
import type { VoucherType } from '@/lib/api/redemption'
import type { MerchantVoucher } from '@/lib/api/merchant'
import { VoucherCardRedeemedStamp } from './VoucherCardRedeemedStamp'
import { VoucherCardStatePill } from './VoucherCardStatePill'

// Round 5 §32: dial colour back up. The owner shared a §22-era
// screenshot as the colour reference and wanted the energy
// back — §31 had drifted too pastel. Goal for this round:
// pastel-start / VIVID-deep so the gradient reads alive at
// the bottom-right corner, the way the reference shows it.
//
//   1. Vivid-deep palette. Each pair: clearly pastel light
//      start (top-left), vivid (but not neon) deep stop
//      (bottom-right). Mint → emerald, lavender → violet,
//      coral → bright red. The deep stop is where the card
//      reads as "alive"; the pastel start gives it warmth.
//
//      Sits between §22 (neon) and §31 (pastel-muted) —
//      lights from §31, deeps closer to §22 but a touch less
//      aggressive.
//
//   2. Active vs redeemed contrast preserved. The owner
//      flagged that washed-out cards confuse "redeemable"
//      with "redeemed". Active state is now visibly more
//      vivid.  PR-B T5 (§Q4) added the redeemed variant
//      with three independent muted-state cues (cream-tint
//      gradient overlay + REDEEMED hero stamp + 'Already
//      redeemed this cycle' inline label below the saving
//      block); content (title, description, type chip) stays
//      at full opacity per brief §3.5.
//
//   3. Decorative blobs DIAGONALLY spread across the card.
//      §32 had three blobs all clustered on the LEFT (top,
//      mid, bottom) — the owner flagged that as cluttered on
//      the left and asked for true spread. §33 keeps two on
//      the left and moves the third to the BOTTOM-RIGHT so
//      the shapes anchor three corners diagonally:
//        shapeA: top-LEFT corner bleed (140pt @ 0.11)
//        shapeB: bottom-LEFT corner bleed (180pt @ 0.09)
//        shapeC: BOTTOM-RIGHT corner bleed (130pt @ 0.06)
//      Top-right corner stays empty (reserved for heart + R
//      top). shapeC opacity (0.06) is below the R (0.12) so
//      the R reads cleanly through shapeC's soft glow.
//
//   4. Brand R unchanged from §31: 130×130, slight bleed off
//      the right edge, OFFICIAL Iconic Version 3 paths in
//      <SvgXml>, white fills, wrapper opacity 0.12.
//
//   5. Card minHeight 150 → 144 (slight slim-down). The
//      owner asked for the card to feel a bit smaller; 6pt
//      tighter without sacrificing readability.
//
// Behaviour preserved across §22 → §32:
//   • side cutouts at mid-height (coupon silhouette)
//   • per-type 3-stop gradient with brand-red drop shadow
//   • horizontal text only
//   • dark-translucent type chip
//   • hero stacked (eyebrow + £hero on separate lines)
//   • description 12pt + lineHeight 16
//   • clean three-zone right column: heart top / R middle /
//     CTA bottom
//   • smart £ formatting (£5 vs £5.50)
//   • a11y label format
//   • press scale + heart spring with motion-scale gating
//
// Behaviour preserved across §22 → §30:
//   • side cutouts at mid-height (coupon silhouette)
//   • per-type 3-stop gradient with brand-red drop shadow
//   • horizontal text only
//   • dark-translucent type chip
//   • hero stacked (eyebrow + £hero on separate lines)
//   • description 12pt + lineHeight 16
//   • subtle decorative blobs on the LEFT side only
//   • clean three-zone right column: heart / R / CTA
//   • smart £ formatting (£5 vs £5.50)
//   • a11y label format
//   • press scale + heart spring with motion-scale gating

// §32 pastel-start / vivid-deep palette. Owner reference
// (a §22-era screenshot) shows clearly-pastel light stops
// fading into vivid (but not neon) deep stops at the
// bottom-right of each card. Lights are pastel; deeps are
// noticeably more saturated than §31's muted pairs but a
// touch less aggressive than §22's neon. The visible
// gradient lives in the deep stop — that's where the card
// reads as "alive".
const TYPE_GRADIENTS: Record<VoucherType, readonly [string, string]> = {
  BOGO:             ['#B7A4F2', '#6E3DD3'],   // soft lavender → vivid violet
  DISCOUNT_FIXED:   ['#FB8896', '#D8302A'],   // soft coral → bright red
  DISCOUNT_PERCENT: ['#FB8896', '#D8302A'],
  FREEBIE:          ['#A0E5BA', '#208E50'],   // soft mint → vivid emerald
  SPEND_AND_SAVE:   ['#FAB78E', '#D6531B'],   // soft peach → bright orange
  PACKAGE_DEAL:     ['#9CC0F5', '#2D5BCC'],   // soft sky → vivid blue
  TIME_LIMITED:     ['#F4D072', '#BC6D1C'],   // honey → vivid amber
  REUSABLE:         ['#84DCC2', '#198375'],   // mint-teal → rich teal
} as const

const TYPE_LABELS: Record<VoucherType, string> = {
  BOGO:             'Buy one, get one free',
  DISCOUNT_FIXED:   'Discount',
  DISCOUNT_PERCENT: 'Discount',
  FREEBIE:          'Freebie',
  SPEND_AND_SAVE:   'Spend & save',
  PACKAGE_DEAL:     'Package deal',
  TIME_LIMITED:     'Time limited',
  REUSABLE:         'Reusable',
}

const BRAND_RED = '#E20C04'
// §39 (impeccable polish): warm off-white instead of pure #FFF
// for white text + chip text. Tints very slightly toward the
// page-bg cream (#FFF9F5) so the white text reads as part of
// the brand family rather than a stark pure-white. Brand-aware
// neutrals per impeccable's "tint every neutral" principle.
// CTA pill bg stays pure white (action element, demands
// maximum contrast on coloured gradients).
const WHITE_TEXT = '#FFFCFA'

type Props = {
  voucher: MerchantVoucher
  /**
   * Redeemed-this-cycle marker. When true, the card renders the
   * redeemed-state visual variant (PR-B T5, closes deferred-followup
   * §Q4): muted hero gradient overlay + REDEEMED stamp top-right of
   * the hero + "Already redeemed this cycle" inline label below the
   * saving block. Bottom-row CTA is suppressed.
   *
   * Accepts undefined → treated as false; the variant is opt-in so
   * the card defaults to the active-state design baseline (locked
   * PR #35) when callers haven't plumbed the flag yet.
   */
  isRedeemed?: boolean
  isFavourited: boolean
  onPress: () => void
  onToggleFavourite: () => void
  /**
   * Reference instant used by the TIME_LIMITED state pill (M4c Gate J)
   * for bucketing active/urgent/outside-window copy and the stale-payload
   * guard. Defaults to `new Date()` at render time. Tests pass a fixed
   * instant for determinism. Non-TIME_LIMITED cards ignore this prop.
   */
  now?: Date
}

const PRESS_IN_MS  = 100
const PRESS_OUT_MS = 160
const HEART_UP_MS  = 120
const HEART_DN_MS  = 200

// Smart £ formatting:
//   Whole pounds → "£5"     (no decimals)
//   Pennies      → "£5.50"  (always 2 decimals)
function formatPounds(value: number): string {
  if (Number.isInteger(value)) return `£${value}`
  return `£${value.toFixed(2)}`
}

// §30 brand R watermark — SVG paths COPIED VERBATIM from the
// official docs/branding/Logos/Iconic Version 3.svg. Same four
// shapes, same coordinates. Only the fill is overridden to a
// uniform white so the watermark reads as a clean faint white
// silhouette regardless of the voucher gradient sitting behind
// it. NO manual reconstruction.
const REDEEMO_R_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  <path fill="#FFFFFF" d="M802.45,452.5c-.44,93.28-48.92,182.68-129,232.74L654.74,674.6c.7-2.78,1.36-5.56,2-8.39a273.15,273.15,0,0,0,6.45-59.33c0-2.21,0-4.41-.09-6.58-1.59-39.37-10.33-77.34-28.7-112.39-18-34.48-43.61-62.42-73.1-87.85a528.72,528.72,0,0,0-63.44-46.67c-5.43-3.48-10.9-6.88-16.47-10.15q-23.1-13.71-47.1-25.91L273.09,226l-11.47-6.84L244.4,208.91l46.75-44A51.25,51.25,0,0,0,336.75,182c27.73-3.62,47.46-28.08,44-54.7a47.11,47.11,0,0,0-17.13-30.59l30.9-29.09,21.68,9.22,8.3,3.54h0c44,21.72,106.7,50.28,142.15,71.12,52.54,30.85,104.41,60.74,149.7,102.63,6.89,6.41,13.51,13.12,19.74,20.14C770.66,313.44,793,363.06,800,414.8A270.54,270.54,0,0,1,802.45,452.5Z"/>
  <polygon fill="#FFFFFF" points="273.09 225.99 261.39 219.37 261.62 219.15 273.09 225.99"/>
  <path fill="#FFFFFF" d="M784.92,888.09a50.58,50.58,0,0,0,50.68,50.59v73.68L531.17,841.69,440.8,791.1,245.06,681.4V441.33l9,5.12L627.45,659l25.39,14.48,1.9,1.1,18.67,10.64L835.6,777.55v60A50.63,50.63,0,0,0,784.92,888.09Z"/>
  <polygon fill="#FFFFFF" points="487.2 818.12 244.4 994.7 245.05 681.39 487.2 818.12"/>
</svg>`

export function VoucherCard({ voucher, isRedeemed = false, isFavourited, onPress, onToggleFavourite, now }: Props) {
  // M4c Gate J: TIME_LIMITED outside-window cards drop to 75% opacity
  // (locked spec §6.1 / §6.3 — distinct from the redeemed-state cream-
  // tint overlay). Active/urgent/redeemed cards stay at full opacity.
  // Stale-payload guard: a `currentWindow` whose `endsAt` has passed is
  // treated as outside-window for the opacity tier too.
  //
  // M5 REUSABLE (locked 2026-05-12 spec §8.1): cooldown state shares the
  // same 75% opacity tier — "exists but not actionable right now" reads
  // identically whether the gate is a TL window or a REUSABLE cooldown.
  // Available state stays at full opacity (100%) like TL active.
  const referenceNow = now ?? new Date()
  const isOutsideWindowTL = voucher.type === 'TIME_LIMITED'
    && !isRedeemed
    && voucher.redeemedWindow === null
    && (
      voucher.currentWindow === null
      || new Date(voucher.currentWindow.endsAt).getTime() <= referenceNow.getTime()
    )
  // REUSABLE cooldown: availableAgainAt is a non-null ISO string AND in the
  // future relative to `now`. A past availableAgainAt (or null) means
  // "available now" → no opacity drop (matches the pill's stale-payload
  // fallthrough in VoucherCardStatePill).
  const isReusableCooldown = voucher.type === 'REUSABLE'
    && !isRedeemed
    && voucher.reusableState != null
    && voucher.reusableState.availableAgainAt != null
    && new Date(voucher.reusableState.availableAgainAt).getTime() > referenceNow.getTime()

  // M4c Gate J revised twice + Gate K Minor #1 fix (2026-05-11):
  // TL cards that surface a state pill (active / urgent / outside-window —
  // anything where the pill component actually renders content) use the
  // STACKED topRow layout (chip-left, pill+heart-stacked-right). Mirrors
  // the pill component's EXACT render rule — including the stale-payload
  // guard. A `currentWindow` whose `endsAt` has passed is treated as no
  // live window; if `nextWindow` is also null, the card falls through to
  // PR-B row layout (no empty stacked column with just the heart).
  //
  // M5 REUSABLE: every REUSABLE card surfaces a pill (available or cooldown),
  // so the stacked layout fires whenever isRedeemed is false. Redeemed REUSABLE
  // cards (cycle quota merchant-wide per voucher per spec §3) follow the
  // existing isRedeemedThisCycle-driven PR-B overprint path and keep the row
  // layout — same shape as non-TL redeemed.
  const hasLiveCurrentWindow = voucher.currentWindow !== null
    && new Date(voucher.currentWindow.endsAt).getTime() > referenceNow.getTime()
  const hasTLPill = voucher.type === 'TIME_LIMITED'
    && !isRedeemed
    && voucher.redeemedWindow === null
    && (hasLiveCurrentWindow || voucher.nextWindow !== null)
  const hasReusablePill = voucher.type === 'REUSABLE' && !isRedeemed
  const hasStatePill = hasTLPill || hasReusablePill
  const motionScale = useMotionScale()
  const typeKey   = voucher.type as VoucherType
  const gradient  = TYPE_GRADIENTS[typeKey] ?? TYPE_GRADIENTS.DISCOUNT_FIXED
  const typeLabel = TYPE_LABELS[typeKey] ?? 'Voucher'
  const accent    = gradient[1]

  const cardScale  = useSharedValue(1)
  const heartScale = useSharedValue(1)

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }))
  const heartAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }))

  const handlePressIn = useCallback(() => {
    if (motionScale === 0) return
    cardScale.value = withTiming(0.97, {
      duration: PRESS_IN_MS,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    })
  }, [cardScale, motionScale])

  const handlePressOut = useCallback(() => {
    if (motionScale === 0) return
    cardScale.value = withTiming(1, {
      duration: PRESS_OUT_MS,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    })
  }, [cardScale, motionScale])

  const handlePress = useCallback(() => {
    lightHaptic()
    onPress()
  }, [onPress])

  const handleFav = useCallback(() => {
    lightHaptic()
    if (motionScale !== 0) {
      heartScale.value = withSequence(
        withTiming(1.25, { duration: HEART_UP_MS, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
        withTiming(1.0,  { duration: HEART_DN_MS, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
      )
    }
    onToggleFavourite()
  }, [heartScale, motionScale, onToggleFavourite])

  const expiryLabel = voucher.expiryDate
    ? `Expires ${new Date(voucher.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    : null

  const a11yLabel =
    `${typeLabel} voucher: ${voucher.title}. Save up to ${formatPounds(voucher.estimatedSaving)}` +
    (isRedeemed ? '. Already redeemed this cycle' : '')

  return (
    // §37: shadowColor inline overrides the cardShadow default
    // so each card drops a soft tint matching its own deep
    // accent (green card → green-tinted shadow, purple →
    // violet, red → red, etc.). Subtle, premium, complementary.
    <Animated.View
      testID="merchant-voucher-card"
      style={[
        cardAnimatedStyle,
        styles.cardShadow,
        { shadowColor: accent },
        // PR-B T8j (impeccable redeemed-state pass): redeemed cards
        // drop the type-tinted lift entirely so they sit flat against
        // the page while active siblings stay raised.  This is the
        // load-bearing list-scan signal: at a glance "this card sits,
        // those float" tells the user the redeemed state without
        // parsing the centered seal.  Honours DESIGN.md "Flat-By-
        // Default Rule" and the No-Status-Navy / One-Voice rules
        // (we recede; we do not invent new colour cues).
        isRedeemed && styles.cardShadowFlat,
        // M4c Gate J: TIME_LIMITED outside-window cards drop to 75%
        // opacity. Distinct tier from redeemed cards' cream-tint
        // overlay (PR-B), signalling "exists but not actionable right
        // now" per spec §6.1 / §6.3 ("Outside-window cards remain
        // visible (NOT hidden)").
        // M5 REUSABLE (spec §8.1): cooldown state shares the same 75%
        // tier — both gates communicate the same "wait, then redeem"
        // affordance.
        (isOutsideWindowTL || isReusableCooldown) && styles.cardOutsideWindow,
      ]}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        style={styles.card}
      >
        {/* Per-type 3-stop gradient — deep accent holds from 30%
            so white text reads across the whole card. */}
        <LinearGradient
          colors={[gradient[0], gradient[1], gradient[1]]}
          locations={[0, 0.30, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* PR-B T5 (§Q4): when redeemed, soft cream-tint overlay on
            top of the gradient mutes the per-type colour without
            washing it out — reads as ~70% saturation per brief
            §3.5. The cream tint matches the page-bg cream
            (#FFF9F5 → #F5F0EB family) used elsewhere in the app
            (cf. MerchantProfileScreen / VoucherDetailScreen muted-
            surface pattern). pointerEvents='none' so the underlying
            Pressable still receives taps.  The overlay alone now
            carries the gradient-saturation drop — content (title,
            description, type chip, stamp, inline label) sits ABOVE
            the overlay and renders at full opacity per the brief
            §3.5 contract (T5.1 spec-fix removed the previous
            card-wide 0.6 opacity dim). */}
        {isRedeemed ? (
          <View
            style={styles.redeemedGradientOverlay}
            pointerEvents="none"
            testID="voucher-card-redeemed-overlay"
          />
        ) : null}

        {/* Top-half gloss — faint white reflection 0→30%. */}
        <LinearGradient
          colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']}
          locations={[0, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.30 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        {/* §35 subtle background shapes — distributed across
            the card, NOT clustered in corners. One on the left
            (shapeA), two overlapping in the centre (shapeB +
            shapeC), one on the right supporting the CTA area
            (shapeD). Different sizes, varied opacity, with
            shapeB + shapeC overlap in the centre giving the
            premium soft-cluster gradient feel. */}
        <View style={styles.shapeA} pointerEvents="none" />
        <View style={styles.shapeB} pointerEvents="none" />
        <View style={styles.shapeC} pointerEvents="none" />
        <View style={styles.shapeD} pointerEvents="none" />

        {/* §31 brand R watermark — bigger (130×130) with a slight
            bleed off the right edge so the R reads as a designed
            graphic of the voucher rather than a dropped-in icon.
            Still the OFFICIAL Iconic Version 3 paths in <SvgXml>,
            white fills, wrapper opacity 0.14 → faint clean white
            silhouette regardless of voucher gradient. The notches
            render LAST so the coupon silhouette stays intact even
            where the R bleeds toward the right edge.
            PR-B T8j: opacity drops further (0.14 → 0.06) when
            redeemed so the card body reads as muted documentation
            rather than active brand signal. */}
        <View
          style={[styles.watermarkWrap, isRedeemed && styles.watermarkWrapMuted]}
          pointerEvents="none"
        >
          <SvgXml xml={REDEEMO_R_SVG} width="100%" height="100%" />
        </View>

        {/* 1px white-tinted lip at the very top edge — glassy. */}
        <View style={styles.topHighlight} pointerEvents="none" />

        {/* PR-B T8k (interaction-design pass): the redeemed-state stamp
            is a diagonal Mustica Pro overprint with a refined entrance
            motion, replacing the T8i centered cream pill with hairline
            accents.  The wrap stays a centered overlay so the rotated
            text balances over the card; the stamp component owns its
            own typography + rotation + entrance timing internally.
            Owner direction (T8k): "improve overall design, premium,
            user can tell active vs redeemed at a glance — you may
            change how the stamp is shown". */}
        {isRedeemed ? (
          // testID 'voucher-redeemed-overprint' is the M4c spec alias
          // for the redeemed-stamp overlay surface (spec §6.4). The
          // existing `<VoucherCardRedeemedStamp>` retains its own
          // `voucher-card-redeemed-stamp` testID for the glyph-level
          // pin in `voucher-card-redeemed-state.test.tsx`; this wrap-
          // level testID is the merchant-card-level handle the M4c
          // pill tests assert against to verify the PR-B redeemed
          // treatment is preserved on redeemed-this-window cards.
          <View
            style={styles.heroStampWrap}
            pointerEvents="none"
            testID="voucher-redeemed-overprint"
          >
            <VoucherCardRedeemedStamp />
          </View>
        ) : null}

        <View style={styles.content}>
          {/* M4c Gate J (revised twice after device QA 2026-05-11):
              topRow has TWO layouts based on whether the TIME_LIMITED
              state pill is present.
                • TL with pill (active/urgent/outside-window) → STACKED:
                    [chip — left]   ⋮   [pill — full right row]
                                        [heart — right-aligned below]
                  The pill gets the full right-side row to itself so the
                  longer copy ("AVAILABLE NOW · Ends 3pm today") fits
                  without ellipsizing on narrow screens (iPhone SE).
                  Heart sits below the pill, right-aligned, still in
                  the topRow's right region. Card minHeight grows by
                  ~28pt for these cards.
                • non-TL, redeemed-TL, degenerate-TL → PR-B ROW:
                    [chip — left]                   [heart — right]
                  Heart stays in its PR-B locked top-right position.
                  Card minHeight unchanged at 144pt. */}
          <View style={styles.topRow}>
            <View style={styles.typeChip}>
              <Text style={styles.typeChipText} numberOfLines={1}>
                {typeLabel}
              </Text>
            </View>
            {hasStatePill ? (
              <View style={styles.topRightStack}>
                <VoucherCardStatePill voucher={voucher} now={referenceNow} />
                <Animated.View style={[heartAnimatedStyle, styles.stackedHeartWrap]}>
                  <Pressable
                    onPress={handleFav}
                    style={styles.favBtn}
                    accessibilityLabel={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
                    hitSlop={10}
                  >
                    <Heart
                      size={18}
                      color={isFavourited ? '#FFFFFF' : 'rgba(255,255,255,0.75)'}
                      fill={isFavourited ? '#FFF' : 'none'}
                      strokeWidth={2.2}
                    />
                  </Pressable>
                </Animated.View>
              </View>
            ) : (
              <Animated.View style={heartAnimatedStyle}>
                <Pressable
                  onPress={handleFav}
                  style={styles.favBtn}
                  accessibilityLabel={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
                  hitSlop={10}
                >
                  <Heart
                    size={18}
                    color={isFavourited ? '#FFFFFF' : 'rgba(255,255,255,0.75)'}
                    fill={isFavourited ? '#FFF' : 'none'}
                    strokeWidth={2.2}
                  />
                </Pressable>
              </Animated.View>
            )}
          </View>

          {/* Round 6 follow-up: title back below the hero, left-
              aligned in line with the description. Hero column on
              the left with its children centred (eyebrow over
              £value); title and description both sit full-width
              below, sharing the left margin. */}
          <View style={styles.heroBlock}>
            <Text style={styles.heroLabel}>Save up to</Text>
            <Text style={styles.heroAmount}>{formatPounds(voucher.estimatedSaving)}</Text>
          </View>
          {/* PR-B T5 (§Q4): "Already redeemed this cycle" inline
              label, rendered immediately below the saving block
              (heroBlock) per plan §Step 3.  Uses label.md / 12pt 500
              ls 0.4 from the design-system Text variant.  The
              `meta` flag enables `color="tertiary"` on body/heading
              variants — kept on label.md (no-op) for forward-
              compatibility if the variant changes.  This is the
              ONLY redeemed-cycle copy on the card — the bottom-row
              meta text always shows the expiry / "No expiry" copy
              regardless of redeemed state (T5.1 spec-fix removed
              the duplicate "Redeemed this cycle" bottom-row text
              that previously co-existed with this label). */}
          {isRedeemed ? (
            <Text
              variant="label.md"
              style={styles.alreadyRedeemedLabel}
              testID="voucher-card-already-redeemed-label"
            >
              Already redeemed this cycle
            </Text>
          ) : null}
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
            {voucher.title}
          </Text>

          {/* §38: description wrapped in a fixed-height View
              that reserves space for 2 lines regardless of
              whether the actual text is 1 line, 2 lines, or
              empty. Cards in the list now share a consistent
              total height — the green voucher with a longer
              description is no longer taller than the
              purple/red ones. */}
          <View style={styles.descriptionWrap}>
            {voucher.description ? (
              <Text style={styles.description} numberOfLines={2} ellipsizeMode="tail">
                {voucher.description}
              </Text>
            ) : null}
          </View>

          {/* §28 bottom row: expiry on LEFT, Redeem CTA on RIGHT.
              The R sits at right-CENTER above this row, so the
              bottom-right CTA placement no longer overlaps the
              brand mark. Standard "tap to act" placement
              restored. */}
          <View style={styles.bottomRow}>
            <Text style={styles.metaText} numberOfLines={1} ellipsizeMode="tail">
              {expiryLabel ?? 'No expiry'}
            </Text>
            {/* PR-B T5 (§Q4): when redeemed, the bottom-row dark
                "Redeem" CTA pill is suppressed — the redeemed signal
                is carried by the hero overprint + "Already redeemed
                this cycle" inline label below the saving block.
                Bottom-row LEFT text always shows the expiry / "No
                expiry" copy regardless of redeemed state. Heart lives
                in the topRow right group (Gate J revised) — bottomRow
                returns to its PR-B layout: expiry-left, Redeem-right. */}
            {isRedeemed ? null : (
              <View style={styles.redeemBtn}>
                <Text style={[styles.redeemBtnText, { color: accent }]}>Redeem</Text>
                <ArrowRight size={13} color={accent} strokeWidth={2.8} />
              </View>
            )}
          </View>
        </View>

        {/* Side cutouts at mid-height — coupon silhouette. */}
        <View style={[styles.notch, styles.notchLeft]} pointerEvents="none" />
        <View style={[styles.notch, styles.notchRight]} pointerEvents="none" />
      </Pressable>
    </Animated.View>
  )
}

const NOTCH_SIZE = 14
const NOTCH_HALF = NOTCH_SIZE / 2
const PAGE_BG = '#FFF9F5'

const styles = StyleSheet.create({
  cardShadow: {
    // shadowColor here is the fallback (BRAND_RED). Each card
    // overrides it inline with its own per-type accent so the
    // drop shadow takes a soft tint matching the voucher
    // colour. iOS renders colour shadows; Android elevation
    // is monochrome by default — acceptable trade-off.
    shadowColor: BRAND_RED,
    // §38 shadow strengthened — owner couldn't see it. Bumped
    // opacity 0.28 → 0.38, radius 18 → 22, drop 8 → 12,
    // elevation 10 → 14 so the card lifts visibly from the
    // background. Still soft / premium / not neon — the per-
    // type accent tint keeps it from looking like a generic
    // black halo.
    shadowOpacity: 0.38,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
    borderRadius: 20,
    // Round 6 follow-up: marginHorizontal 14 → 8 per owner ask
    // for "a little bit more" width. ~4.3% slim on a 375pt
    // screen — the original §37 baseline width that was
    // approved before the narrowing experiments started.
    marginHorizontal: 8,
  },
  card: {
    position: 'relative',
    minHeight: 144,   // §32: 150 → 144, slight slim-down per owner ask
    borderRadius: 20,
    overflow: 'hidden',
  },
  // PR-B T5.1 spec-fix (locked 2026-05-09): the previous PR #35
  // baseline used `cardRedeemed: { opacity: 0.6 }` to dim the entire
  // redeemed card.  Brief §3.5 explicitly says "Title + description
  // stay full opacity (still legible)" — and brief §3.5's anti-
  // reference calls out greyscale-everything fades as the failure
  // mode that "loses the type identity that makes the card
  // recognisable."  PR-B's three new contrast cues (cream-tint
  // overlay below + REDEEMED stamp + 'Already redeemed this cycle'
  // inline label) carry the contrast at full opacity.  The 0.6
  // dim is removed.

  // PR-B T5 (§Q4) → PR-B T8j (impeccable pass): cream-tint overlay
  // that mutes the per-type gradient.  T8j bumps the alpha 0.30 →
  // 0.55 and shifts the cream toward the brand hue family
  // (rgba(255, 246, 238, …)) so the type colour reads as a quiet
  // memory instead of a fully saturated active gradient.  The
  // bumped wash is paired with the dropped card shadow to give
  // the redeemed state a visible weight drop on list scan.
  // Content (title, description, stamp, inline label) stays full
  // opacity per T5.1 lock — we recede the chrome, never the copy.
  redeemedGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 246, 238, 0.55)',
  },
  // PR-B T8j: card-shadow override applied when isRedeemed.
  // Drops the type-tinted lift entirely so redeemed cards sit
  // flat against the page while active siblings stay raised
  // with the per-type accent shadow.  This is the load-bearing
  // list-scan signal — see DESIGN.md "Flat-By-Default Rule".
  cardShadowFlat: {
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },

  // M4c Gate J: TIME_LIMITED outside-window opacity (locked spec §6.1).
  // 75% opacity is the deliberately-distinct tier from the redeemed-state
  // cream-tint overlay above — the user must be able to read "exists but
  // not actionable right now" vs "you've already used this" at a glance.
  // Applied to the card-shadow wrapper (outer Animated.View) so the per-
  // type tinted shadow softens proportionally with the card.
  cardOutsideWindow: {
    opacity: 0.75,
  },

  // PR-B T8i refinement: hero stamp wrap — absolutely positioned to
  // fill the card hero so the stamp itself centers horizontally +
  // vertically.  Owner direction (T8i): "it does not need to be top
  // right corner.  It could be in the center, slightly bigger".
  // The previous top-right layout (top:8, right:46) is replaced by
  // a full-card overlay with center alignment so the stamp reads as
  // the dominant focal point of a redeemed voucher.  The heart at
  // top-right stays visible because the stamp is `pointerEvents:
  // none` and its centered position doesn't occlude the heart at
  // top:8 right:8.  zIndex 2 keeps it above the watermark /
  // topRow chip layer.
  heroStampWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },

  // PR-B T5 (§Q4): "Already redeemed this cycle" inline label,
  // rendered immediately below the heroBlock (saving block).
  // label.md (12pt 500 ls 0.4) is the plan-pinned variant; the
  // tinted off-white reads as a calm secondary signal against
  // the muted hero gradient. Sits in the same horizontal slot
  // as the eyebrow/£value above it (alignSelf: flex-start +
  // marginTop 4) so the visual rhythm of the saving block
  // extends naturally into the redeemed message.
  alreadyRedeemedLabel: {
    color: 'rgba(255,252,250,0.85)',
    alignSelf: 'flex-start',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // §35 decorative blobs — distributed across the card, not
  // clustered in corners. Owner brief: "one shape on the
  // left, one or more softer through the centre, one on the
  // right if it supports R/CTA. Different sizes, varied
  // opacity, overlap if intentional."
  //
  //   shapeA  TL corner bleed (large, 150pt @ 0.10)
  //   shapeB  centre inside (medium, 90pt @ 0.07)
  //   shapeC  centre inside, OVERLAPS shapeB (small, 55pt @ 0.05)
  //   shapeD  BR corner bleed (medium, 110pt @ 0.06)
  //
  // Three different sizes (150 / 90 / 55 / 110), four
  // different opacities (0.10 / 0.07 / 0.05 / 0.06). shapeB +
  // shapeC overlap in the centre on purpose — gives the
  // premium "soft cluster" gradient feel rather than a single
  // disc behind the text. Right side has only shapeD (no TR
  // shape) so the heart + R top stay visually unblocked.
  shapeA: {
    position: 'absolute',
    left: -50,
    top: -45,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  shapeB: {
    position: 'absolute',
    left: 70,
    top: 38,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  shapeC: {
    position: 'absolute',
    left: 120,
    top: 80,
    width: 55,
    height: 55,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  shapeD: {
    position: 'absolute',
    right: -35,
    bottom: -50,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  // §39: opacity 0.12 → 0.14 so the brand mark is marginally
  // more present without becoming the foreground. Stays under
  // the chip / hero / title / CTA in visual weight, but is
  // recognisable as Redeemo at a glance.
  watermarkWrap: {
    position: 'absolute',
    right: -12,
    top: 22,
    width: 130,
    height: 130,
    opacity: 0.14,
  },
  // PR-B T8j: redeemed-state watermark muting — drops the brand R
  // silhouette to ~half its active intensity so the card reads as
  // quiet documentation rather than active brand surface.
  watermarkWrapMuted: {
    opacity: 0.06,
  },

  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },

  content: {
    // Round 6 follow-up: paddingHorizontal 12 → 14 +
    // paddingVertical 6 → 8 per owner ask for "enough padding
    // around the card so content isn't close to the edge".
    // The chip / heart at the top + the Redeem CTA / expiry
    // at the bottom now sit visibly inset from the card
    // perimeter on every voucher type.
    paddingHorizontal: 14,
    paddingVertical: 8,
    flex: 1,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  // §40 navy-tinted backdrop kept. Round 6 follow-up: chip
  // paddingVertical 5 → 2 so the chip itself becomes shorter
  // without touching the label typography (fontSize 12, weight
  // 800, letterSpacing 0.2 all unchanged). The heart wrapper
  // (24pt) is now the topRow's tallest child instead of the
  // chip — which means the chip is centred within a taller
  // row and gets ~2pt of visible breathing space above and
  // below it inside the row. That space reads as the gap the
  // owner asked for between the chip and the "Save up to"
  // line that follows. Label stays centred (default flex
  // alignment within the chip box).
  // Horizontal padding kept at 11 so the label doesn't crowd
  // the chip edges.
  typeChip: {
    paddingVertical: 2,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(1,12,53,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    // M4c Gate J (revised): chip never shrinks. For TL pill cards, the
    // pill+heart stack on the right takes its own column at maxWidth 75%
    // of the row. For non-TL / redeemed-TL, only the heart sits on the
    // right. Either way the chip keeps its intrinsic width so the voucher
    // type label remains fully readable on every screen.
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  typeChipText: {
    color: WHITE_TEXT,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  favBtn: {
    padding: 3,
  },

  // Round 6 follow-up: hero on the LEFT, title back below the
  // hero (no longer card-centred). heroBlock takes its own
  // intrinsic width via alignSelf:'flex-start' (left edge of
  // card) and centres its two children inside that column so
  // the eyebrow stays balanced over the £value regardless of
  // value width.
  // Round 6 follow-up: heroBlock.marginTop 0 → 6 — owner asked
  // for visible gap between the voucher type chip and "Save up
  // to". The chip + heart row was previously sitting flush
  // against the hero block. 6pt explicit margin gives the
  // identity-zone (chip / heart) clear separation from the
  // value tier below.
  heroBlock: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    marginTop: 6,
  },
  // §40 / Round 6 follow-up: eyebrow tight against the £value.
  // Owner brief — Save up to and the value belong together as
  // one group, the gap should be small. Explicit lineHeight 13
  // (1.18× — tight for 11pt) + marginBottom 0 collapses the
  // eyebrow→amount gap to its minimum without overlap.
  heroLabel: {
    color: 'rgba(255,252,250,0.90)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    lineHeight: 13,
    marginBottom: 0,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // §39: tinted off-white + tighter -0.8 letter-spacing for
  // refined numeric feel.
  heroAmount: {
    color: WHITE_TEXT,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 30,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // §39 title — 15pt 800 → 16pt 800 with tighter -0.30
  // letter-spacing. Stronger second-tier presence after the
  // £hero, with tinted off-white text. Description weight
  // drops to 400 (below) for sharper hierarchy contrast.
  // Round 6 follow-up: title sits below the hero, left-aligned
  // (default), in line with the description below. Per the
  // owner's group-rhythm brief:
  //   • hero pair (Save up to + £value) kept tight (heroLabel
  //     lineHeight 13 + marginBottom 0)
  //   • value → title gap bumped (title.marginTop 2 → 6)
  //   • title → description gap bumped (title.marginBottom 2 → 6)
  // Card-height impact balanced by tightening heroBlock.marginTop
  // and bottomRow.marginTop (see those styles).
  title: {
    color: WHITE_TEXT,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.3,
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // Round 6 follow-up: description bumped 12 → 13pt with
  // lineHeight 17 (~1.31×). minHeight matches new lineHeight×2
  // = 34pt for consistent card heights. Weight stays at 400
  // for hierarchy contrast against the now-900 title.
  descriptionWrap: {
    minHeight: 34,
  },
  description: {
    color: 'rgba(255,252,250,0.92)',
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: -0.05,
    lineHeight: 17,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // §28 bottom row: expiry-LEFT, CTA-RIGHT.
  // Round 6 follow-up: marginTop 4 → 2 to absorb the bumped
  // title margins (title.marginTop 2 → 6 + marginBottom 2 → 6).
  // Total card height stays flat — every pt added around the
  // title is paid for elsewhere.
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    gap: 12,
  },
  // M4c Gate J (revised TWICE after device QA): the row layout
  // (`[pill][heart]` on a single line) caused pill text to ellipsize
  // on iPhone SE for the longest active copy ("AVAILABLE NOW · Ends
  // 3pm today"). Owner directed heart-under-pill stack for TL pill
  // cards to give the pill the full right-side row width.
  //
  // topRightStack — column layout for TL active/urgent/outside-window
  // cards. Pill renders on its own row (full visible copy guaranteed
  // up to maxWidth). Heart sits below, right-aligned via alignItems.
  // Internal gap 6pt — calm visual separation.
  topRightStack: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 1,
    // Cap the stack at 75% of the row width — pill is the load-bearing
    // copy on iPhone SE (~270pt available; pill needs ~210pt at 11pt
    // text). Chip on the left has plenty of room for "Time limited"
    // (~80pt). The 8pt internal gap below the pill + 24pt heart slot
    // keep the column visually balanced inside the topRow.
    maxWidth: '75%',
  },
  // Heart wrapper inside the stacked layout. No additional positioning
  // — `topRightStack.alignItems: 'flex-end'` already right-aligns it.
  // Wrapper exists so the `heartAnimatedStyle` (Reanimated transform)
  // doesn't conflict with the parent's flex alignment.
  stackedHeartWrap: {
    // No extra styling — the parent column owns alignment.
  },
  // §39: metaText weight 600 → 500 so the expiry recedes
  // behind the Redeem CTA in the bottom row hierarchy.
  metaText: {
    color: 'rgba(255,252,250,0.85)',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.1,
    flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  redeemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  redeemBtnText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  notch: {
    position: 'absolute',
    top: '50%',
    marginTop: -NOTCH_HALF,
    width: NOTCH_SIZE,
    height: NOTCH_SIZE,
    borderRadius: NOTCH_HALF,
    backgroundColor: PAGE_BG,
  },
  notchLeft:  { left:  -NOTCH_HALF },
  notchRight: { right: -NOTCH_HALF },
})
