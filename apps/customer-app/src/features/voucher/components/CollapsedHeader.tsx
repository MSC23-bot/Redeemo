import React from 'react'
import { View, Pressable, StyleSheet, Platform } from 'react-native'
import { BlurView } from 'expo-blur'
import { ArrowLeft } from 'lucide-react-native'
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
import { voucherGradient, formatPounds } from '../utils/voucherTheme'

type Props = {
  /** Voucher title — third (and most contextual) line. */
  title: string
  /**
   * Voucher type — drives the 4pt left-edge color stripe (chromatic
   * anchor to the hero) AND the SAVE chip's accent color.
   */
  type: VoucherType
  /** Estimated saving — surfaced in the right-side SAVE chip. */
  estimatedSaving: number
  /** Merchant business name — first/primary line. */
  merchantName: string
  /**
   * Branch name (selected) — second line. When null
   * (selectedBranch unresolved or all-suspended fallback), the
   * branch line is omitted gracefully — we don't fabricate.
   */
  branchName: string | null
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

  onBack: () => void
}

/**
 * Voucher Detail collapsed top chrome — pinned safe-area frosted bar
 * that takes over from the hero NavRow once the user scrolls past
 * the coupon hero.
 *
 * **Round 8 redesign — owner direction (impeccable + ui-ux-pro-max):**
 *
 *   • Three-line text stack on the left (vertical hierarchy):
 *       Merchant Name (15pt 800 navy)         — primary identity
 *       Branch Name   (11pt 600 muted-navy)   — context
 *       Voucher Title (12pt 500 navy)         — what's on the page
 *   • SAVE chip on the right (vertically centered):
 *       SAVE label (8pt 800 type-accent, letter-spaced)
 *       Amount    (14pt 800 type-accent)
 *   • 4pt left-edge type-color stripe (chromatic anchor to hero).
 *   • Back button on the left edge (36×36 with hitSlop).
 *   • Share + favourite REMOVED per owner direction — collapsed
 *     chrome carries voucher identity context only, not actions.
 *
 * Typography hierarchy follows impeccable's law of "scale + weight
 * contrast (≥1.25 ratio between steps)":
 *   - Merchant 15pt 800 / Branch 11pt 600 / Title 12pt 500
 *   - Steps: 15→12 (1.25x), 12→11 (1.09x but weight diff compensates)
 *
 * Color palette stays restrained (impeccable's "Restrained" strategy):
 *   - Navy (#010C35) for primary text (merchant, title)
 *   - Muted-navy (#4B5563) for secondary text (branch)
 *   - Type-accent for stripe + SAVE chip (one focal point)
 *
 * Overflow protection (ui-ux-pro-max's "nothing leaks"):
 *   - All text Texts: numberOfLines={1} + ellipsizeMode="tail"
 *   - Title additionally: adjustsFontSizeToFit + minimumFontScale=0.85
 *     (long titles shrink to fit before truncating)
 *   - Save chip: adjustsFontSizeToFit on the amount for large values
 *   - Wrapper: overflow:hidden as final safety
 *   - Calculated paddingRight reserves the SAVE chip's footprint so
 *     long merchant / title strings can never collide with the chip
 *
 * Motion (Emil framework — unchanged from round 5):
 *   Scroll-driven opacity. Reduced-motion → step at fadeEnd.
 */
export function CollapsedHeader({
  title,
  type,
  estimatedSaving,
  merchantName,
  branchName,
  insetTop,
  scrollY,
  fadeStart,
  fadeEnd,
  isActive,
  onBack,
}: Props) {
  const reducedMotion = useReducedMotion()
  const [, gradEnd]   = voucherGradient(type)

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

  // Wrapper height = safe area + content row height. Content row is
  // sized to comfortably hold three lines of text (merchant/branch/
  // title) with consistent line-spacing, plus 8pt vertical padding
  // top + bottom.
  const contentRowHeight = branchName ? CONTENT_ROW_3_LINES : CONTENT_ROW_2_LINES
  const wrapperHeight    = insetTop + contentRowHeight

  return (
    <Animated.View
      pointerEvents={isActive ? 'box-none' : 'none'}
      style={[
        styles.root,
        { height: wrapperHeight },
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

      {/* Safe-area spacer — pushes content below the status bar. */}
      <View style={{ height: insetTop }} pointerEvents="none" />

      {/* Content row: back · text stack · save chip */}
      <View style={[styles.contentRow, { height: contentRowHeight }]} pointerEvents="box-none">
        <Pressable
          onPress={() => {
            lightHaptic()
            onBack()
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
        >
          <ArrowLeft size={20} color={color.navy} strokeWidth={2.4} />
        </Pressable>

        <View style={styles.textStack} pointerEvents="none">
          <Text
            variant="body.md"
            style={styles.merchantText}
            numberOfLines={1}
            ellipsizeMode="tail"
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            testID="collapsed-header-merchant"
          >
            {merchantName}
          </Text>

          {branchName ? (
            <Text
              variant="label.md"
              style={styles.branchText}
              numberOfLines={1}
              ellipsizeMode="tail"
              testID="collapsed-header-branch"
            >
              {branchName}
            </Text>
          ) : null}

          <Text
            variant="body.sm"
            style={styles.titleText}
            numberOfLines={1}
            ellipsizeMode="tail"
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            testID="collapsed-header-title"
          >
            {title}
          </Text>
        </View>

        <SaveChip amount={estimatedSaving} accentColor={gradEnd} />
      </View>
    </Animated.View>
  )
}

// ── SAVE chip ────────────────────────────────────────────────────────────────

function SaveChip({ amount, accentColor }: { amount: number; accentColor: string }) {
  return (
    <View
      style={[styles.saveChip, { borderColor: accentColor + '33', backgroundColor: accentColor + '0F' }]}
      testID="collapsed-header-save-chip"
    >
      <Text style={[styles.saveChipLabel, { color: accentColor }]}>SAVE</Text>
      <Text
        style={[styles.saveChipAmount, { color: accentColor }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {formatPounds(amount)}
      </Text>
    </View>
  )
}

// Content row sizing — chosen so 3 lines fit cleanly with consistent
// 4pt vertical gaps + 10pt top/bottom padding. 2-line variant
// (no branch) shaves the branch line + its gap.
const CONTENT_ROW_3_LINES = 78  // 10 + 15 + 4 + 11 + 4 + 13 + 11 ≈ 78pt
const CONTENT_ROW_2_LINES = 60  // 10 + 15 + 4 + 13 + 10 ≈ 52pt with extra slack

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
  // ── Content row ─────────────────────────────────────────────
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: STRIPE_W + 12,
    paddingRight: 14,
    gap: 12,
    zIndex: 2,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  backBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  // ── Text stack (merchant / branch / title) ──────────────────
  textStack: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 3,
  },
  merchantText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#010C35',
    letterSpacing: -0.2,
  },
  branchText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 0.1,
  },
  titleText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#374151',
    letterSpacing: -0.05,
  },
  // ── SAVE chip ───────────────────────────────────────────────
  saveChip: {
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveChipLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  saveChipAmount: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginTop: 1,
  },
})
