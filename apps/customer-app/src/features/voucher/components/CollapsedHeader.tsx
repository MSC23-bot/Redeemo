import React from 'react'
import { View, Pressable, StyleSheet, Platform } from 'react-native'
import { BlurView } from 'expo-blur'
import { ArrowLeft, Heart, Share2 } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import type { VoucherType } from '@/lib/api/voucher'
import { voucherGradient, voucherTypeLabel, formatPounds } from '../utils/voucherTheme'

type Props = {
  /** Voucher title — primary content. Truncated to one line. */
  title: string
  /**
   * Voucher type — drives the left-edge color stripe + the type
   * label in the meta row. The stripe color matches the hero's
   * gradient start color so the collapsed chrome reads as
   * chromatically continuous with the voucher hero (round-6 fix #3).
   */
  type: VoucherType
  /**
   * Estimated saving on the voucher — surfaced as a compact "SAVE
   * £X" chip in the right cluster of row 1. Voucher-LEVEL data
   * (merchant-wide content). Round-6 fix #3.
   */
  estimatedSaving: number
  /**
   * Merchant name from `voucher.merchant.businessName`. Voucher
   * (merchant-LEVEL) attribution shown alongside the branch in the
   * meta row. Round-6 fix #3 — collapsed chrome must show enough
   * voucher context that the user knows what they're looking at.
   */
  merchantName: string
  /**
   * Branch name from `merchant.selectedBranch.name` — drives the
   * branch-LEVEL `REDEEM AT <branch>` portion of the meta row. When
   * null (selectedBranch hasn't resolved yet, or all-suspended
   * fallback), the REDEEM AT segment is omitted gracefully — we
   * don't fabricate. The merchant name still shows.
   */
  branchName: string | null
  /** Heart fill state. */
  isFavourited: boolean
  /** Top safe-area inset (status bar / Dynamic Island height). */
  insetTop: number
  /**
   * Driven by the parent screen's `useAnimatedScrollHandler`. The
   * collapsed header opacity is interpolated against this so the
   * frosted surface fades in as the hero scrolls away.
   */
  scrollY: SharedValue<number>
  /** Opacity interpolation range — start of fade in. */
  fadeStart: number
  /** End of fade in (collapsed surface fully opaque from this value up). */
  fadeEnd: number
  /**
   * JS state derived from `useAnimatedReaction(scrollY > HANDOFF_AT)`
   * in the parent. Drives pointerEvents + accessibility flags.
   */
  isActive: boolean

  onBack:  () => void
  onShare: () => void
  onFav:   () => void
}

/**
 * Voucher Detail collapsed top chrome — pinned safe-area frosted bar
 * that takes over from the hero NavRow once the user scrolls past
 * the coupon hero.
 *
 * **Round 6 redesign — richer voucher context.** Designed
 * specifically for Voucher Detail (NOT a copy of Merchant Profile's
 * collapsed chrome):
 *
 *   • Type-color left stripe (4pt wide, full height) — chromatic
 *     anchor that reads as "collapsed voucher hero", not generic
 *     app chrome. Color matches `voucherGradient(type)` end color.
 *
 *   • Row 1: [back] · {voucher title} · [SAVE £X chip] · [share] [fav]
 *     - Title truncates with ellipsis on long names.
 *     - SAVE chip uses brand-rose tint with the gradient's end color,
 *       compact (14pt 800 amount + 9pt eyebrow).
 *
 *   • Row 2 (meta): {voucherTypeLabel} · {merchantName} · REDEEM AT
 *     {branchName}
 *     - Type label and merchant name in muted navy.
 *     - REDEEM AT prefix in brand-rose 10pt 800 — same visual
 *       language as MerchantRow's REDEEM AT panel so voucher
 *       (merchant-wide content) and branch (branch-LEVEL action
 *       context) read as consistent concepts across the screen.
 *     - When branchName is null, the REDEEM AT segment is dropped
 *       gracefully (we don't fabricate "Resolving…" copy here).
 *
 * Motion (Emil framework): scroll-driven opacity interpolation.
 * Reduced-motion path uses a step function (opacity flips at
 * fadeEnd, no fade) so iOS Reduce Motion users still get the safe-
 * area protection without the visual fade.
 */
export function CollapsedHeader({
  title,
  type,
  estimatedSaving,
  merchantName,
  branchName,
  isFavourited,
  insetTop,
  scrollY,
  fadeStart,
  fadeEnd,
  isActive,
  onBack,
  onShare,
  onFav,
}: Props) {
  const reducedMotion = useReducedMotion()
  const typeLabel    = voucherTypeLabel(type)
  const [, gradEnd]  = voucherGradient(type)

  // Opacity interpolation — entire header (incl. frosted surface)
  // fades from 0 to 1 across [fadeStart, fadeEnd]. Reduced motion
  // path: step at fadeEnd (no fade, but still appears to protect
  // the safe area).
  const animStyle = useAnimatedStyle(() => {
    if (reducedMotion) {
      return { opacity: scrollY.value >= fadeEnd ? 1 : 0 }
    }
    return {
      opacity: interpolate(
        scrollY.value,
        [fadeStart, fadeEnd],
        [0, 1],
        Extrapolation.CLAMP,
      ),
    }
  })

  return (
    <Animated.View
      pointerEvents={isActive ? 'box-none' : 'none'}
      style={[
        styles.root,
        { height: insetTop + ROW_1_H + ROW_2_H },
        animStyle,
      ]}
      accessibilityElementsHidden={!isActive}
      importantForAccessibility={isActive ? 'auto' : 'no-hide-descendants'}
      testID="collapsed-header-root"
    >
      {/* Frosted safe-area surface — physically protects the Dynamic
          Island / notch once active. */}
      {Platform.OS === 'android' ? (
        <View style={[StyleSheet.absoluteFillObject, styles.androidFallback]} pointerEvents="none" />
      ) : (
        <BlurView intensity={32} tint="default" style={StyleSheet.absoluteFillObject} pointerEvents="none" />
      )}

      {/* Type-color left stripe — chromatic anchor to the hero. */}
      <View style={[styles.typeStripe, { backgroundColor: gradEnd }]} pointerEvents="none" />

      {/* Hairline separator at bottom edge. */}
      <View style={styles.hairline} pointerEvents="none" />

      {/* Row 1 — back / title / save chip / share / favourite */}
      <View style={[styles.row1, { paddingTop: insetTop + 6 }]} pointerEvents="box-none">
        <NavBtn onPress={onBack} accessibilityLabel="Go back">
          <ArrowLeft size={20} color={color.navy} strokeWidth={2.4} />
        </NavBtn>

        <View style={styles.titleWrap} pointerEvents="none">
          <Text
            variant="body.md"
            style={styles.title}
            numberOfLines={1}
            ellipsizeMode="tail"
            testID="collapsed-header-title"
          >
            {title}
          </Text>
        </View>

        <SaveChip amount={estimatedSaving} accentColor={gradEnd} />

        <View style={styles.rightActions} pointerEvents="box-none">
          <NavBtn onPress={onShare} accessibilityLabel="Share voucher">
            <Share2 size={18} color={color.navy} strokeWidth={2.2} />
          </NavBtn>
          <NavBtn
            onPress={onFav}
            accessibilityLabel={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
          >
            <Heart
              size={18}
              color={isFavourited ? color.brandRose : color.navy}
              fill={isFavourited ? color.brandRose : 'none'}
              strokeWidth={2.2}
            />
          </NavBtn>
        </View>
      </View>

      {/* Row 2 — meta: type · merchant · REDEEM AT branch */}
      <View style={styles.row2} pointerEvents="none" testID="collapsed-header-meta">
        <Text variant="label.md" style={styles.metaLine} numberOfLines={1} ellipsizeMode="tail">
          <Text style={styles.metaTypeLabel}>{typeLabel.toUpperCase()}</Text>
          <Text style={styles.metaSep}> · </Text>
          <Text style={styles.metaMerchant}>{merchantName}</Text>
          {branchName ? (
            <>
              <Text style={styles.metaSep}> · </Text>
              <Text style={styles.redeemAtPrefix}>REDEEM AT </Text>
              <Text style={styles.redeemAtBranch}>{branchName.toUpperCase()}</Text>
            </>
          ) : null}
        </Text>
      </View>
    </Animated.View>
  )
}

// ── Internal pieces ──────────────────────────────────────────────────────────

function NavBtn({
  onPress,
  accessibilityLabel,
  children,
}: {
  onPress: () => void
  accessibilityLabel: string
  children: React.ReactNode
}) {
  return (
    <Pressable
      onPress={() => {
        lightHaptic()
        onPress()
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={10}
      style={({ pressed }) => [styles.navBtn, pressed && styles.navBtnPressed]}
    >
      {children}
    </Pressable>
  )
}

function SaveChip({ amount, accentColor }: { amount: number; accentColor: string }) {
  return (
    <View style={[styles.saveChip, { borderColor: accentColor + '30' }]} testID="collapsed-header-save-chip">
      <LinearGradient
        colors={[`${accentColor}10`, `${accentColor}20`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <Text style={[styles.saveChipLabel, { color: accentColor }]}>SAVE</Text>
      <Text style={[styles.saveChipAmount, { color: accentColor }]}>{formatPounds(amount)}</Text>
    </View>
  )
}

const ROW_1_H = 52
const ROW_2_H = 24
const STRIPE_W = 4

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    overflow: 'hidden',
  },
  androidFallback: {
    backgroundColor: 'rgba(245,240,235,0.94)',
  },
  typeStripe: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: STRIPE_W,
    zIndex: 1,
  },
  hairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    zIndex: 1,
  },
  // Row 1 — back / title / save chip / actions
  row1: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_1_H,
    paddingLeft: STRIPE_W + 12,
    paddingRight: 14,
    gap: 10,
    zIndex: 2,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#010C35',
    letterSpacing: -0.2,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  navBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  // SAVE chip — compact gradient pill in the type's accent color.
  saveChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  saveChipLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  saveChipAmount: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  // Row 2 — meta line
  row2: {
    height: ROW_2_H,
    paddingLeft: STRIPE_W + 60,   // align under the title (past back button)
    paddingRight: 14,
    justifyContent: 'flex-start',
    zIndex: 2,
  },
  metaLine: {
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: '#9CA3AF',
  },
  metaTypeLabel: {
    color: '#4B5563',
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  metaSep: {
    color: '#D1D5DB',
  },
  metaMerchant: {
    color: '#4B5563',
    fontWeight: '700',
  },
  redeemAtPrefix: {
    color: color.brandRose,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  redeemAtBranch: {
    color: color.brandRose,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
})
