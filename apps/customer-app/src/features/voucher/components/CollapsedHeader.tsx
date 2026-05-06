import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
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
import { branchShortName } from '@/features/merchant/utils/branchShortName'

type Props = {
  /** Merchant business name — primary line. */
  merchantName: string
  /**
   * Branch name (selected). The full backend value is stripped of
   * the merchant prefix via `branchShortName()` so the chrome
   * matches the merchant profile (where this same branch displays
   * as just "Brightlingsea"). When null, the branch line is omitted.
   */
  branchName: string | null
  /** Top safe-area inset (status bar / Dynamic Island height). */
  insetTop: number
  /**
   * Driven by the parent screen's `useAnimatedScrollHandler`.
   * Drives the opacity interpolation across [fadeStart, fadeEnd].
   */
  scrollY: SharedValue<number>
  fadeStart: number
  fadeEnd: number
  /** JS state from `useAnimatedReaction(scrollY > HANDOFF_AT)`. */
  isActive: boolean

  onBack: () => void
}

/**
 * Voucher Detail collapsed top chrome.
 *
 * **Round 11 — minimalist, matching Merchant Profile chrome.** Owner
 * direction: drop the SAVE chip, voucher title, and type stripe.
 * Keep only the back button, merchant name, and branch name.
 *
 * Layout (2-line text stack matching Merchant Profile collapsed):
 *
 *   ┌────────────────────────────────────────────────┐
 *   │ [safe-area]                                      │
 *   ├────────────────────────────────────────────────┤
 *   │ [<]   Covelum Restaurant                          │
 *   │       Brightlingsea                               │
 *   └────────────────────────────────────────────────┘
 *
 *   Merchant: 17pt 700 navy   (slightly larger than the merchant
 *                              profile's 15pt for prominence in the
 *                              voucher context)
 *   Branch:   14pt 500 muted  (slightly larger than the merchant
 *                              profile's 13pt to match)
 *
 * Background: solid cream `#FFF9F5` — same as merchant profile
 * collapsed header. Bottom hairline border. No BlurView (would
 * blend with dark voucher banner image scrolling below).
 *
 * Branch is stripped of the merchant prefix via `branchShortName()`
 * — same helper the merchant profile uses, so "Covelum —
 * Brightlingsea" displays as "Brightlingsea". No duplicate merchant
 * name across the two lines.
 *
 * Scroll-driven opacity (Emil framework — unchanged): fades 0→1
 * across [fadeStart, fadeEnd]. Reduced-motion → step at fadeEnd.
 *
 * `pointerEvents` flipped on the JS state from the parent's
 * `useAnimatedReaction(scrollY > HANDOFF_AT)`, so single-threshold
 * handoff with the hero NavRow is preserved.
 */
export function CollapsedHeader({
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

  // Strip the merchant prefix from the branch name so the collapsed
  // chrome matches the merchant profile (which displays just
  // "Brightlingsea" rather than "Covelum — Brightlingsea").
  const shortBranch = branchName ? branchShortName(branchName) : null

  const wrapperHeight = insetTop + CONTENT_ROW_H

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
      {/* Hairline at bottom edge */}
      <View style={styles.hairline} pointerEvents="none" />

      {/* Safe-area spacer */}
      <View style={{ height: insetTop }} pointerEvents="none" />

      {/* Content row: back · text stack */}
      <View style={[styles.contentRow, { height: CONTENT_ROW_H }]} pointerEvents="box-none">
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

          {shortBranch ? (
            <Text
              variant="label.md"
              style={styles.branchText}
              numberOfLines={1}
              ellipsizeMode="tail"
              testID="collapsed-header-branch"
            >
              {shortBranch}
            </Text>
          ) : null}
        </View>
      </View>
    </Animated.View>
  )
}

// 2-line stack: 17pt merchant + 3pt gap + 14pt branch ≈ 34pt
// + 11pt top + 11pt bottom = 56pt. Matches Merchant Profile's
// COMPACT_BAR_HEIGHT shape closely.
const CONTENT_ROW_H = 56

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    overflow: 'hidden',
    // Solid cream — identical to the merchant profile collapsed
    // chrome so they read as the same surface across the app.
    backgroundColor: '#FFF9F5',
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
    paddingHorizontal: 14,
    gap: 12,
    zIndex: 2,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  backBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  // ── 2-line text stack (merchant / branch) ──────────────────
  textStack: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 3,
  },
  merchantText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#010C35',
    letterSpacing: -0.2,
  },
  branchText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
    letterSpacing: 0.05,
  },
})
