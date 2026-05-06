import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { ArrowLeft } from 'lucide-react-native'
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
import { branchShortName } from '@/features/merchant/utils/branchShortName'

type Props = {
  /** Merchant business name — primary line. */
  merchantName: string
  /**
   * Branch name (selected). Stripped of the merchant prefix via
   * `branchShortName()`. Null when selectedBranch unresolved.
   */
  branchName: string | null
  /**
   * Merchant logo URL — rendered as a 36pt rounded square next to
   * the back button, matching the merchant profile's collapsed
   * chrome. Branch-aware resolution happens in the parent screen
   * (sb.logoUrl ?? merchant.logoUrl). When null, the logo box
   * shows a placeholder so layout stays stable.
   */
  logoUrl: string | null
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
 * **Round 12 — logo + cream gradient + breathing room.** Owner
 * direction:
 *   • Add the merchant logo (consistent with merchant profile).
 *   • Add a vertical cream gradient (#FFF9F5 → #FCF0E5) — same
 *     palette as the merchant profile's identity zone, "lighter at
 *     top, slightly more present at the bottom" so the chrome
 *     blends like fabric rather than sitting as a flat box.
 *   • More breathing room beneath the branch line so it doesn't
 *     touch the bottom hairline.
 *
 * Layout:
 *
 *   ┌────────────────────────────────────────────────┐
 *   │ [safe-area]                                      │
 *   ├────────────────────────────────────────────────┤
 *   │ [<]  [logo]  Covelum Restaurant                   │
 *   │              Brightlingsea                        │
 *   │                                                   │
 *   └────────────────────────────────────────────────┘
 *   (subtle vertical gradient: cream top → slightly darker bottom)
 *
 * Typography (matching merchant profile collapsed chrome, slightly
 * bigger per round-11 owner direction):
 *   Merchant 17pt 700 navy / Branch 14pt 500 muted-navy
 *
 * Branch is stripped of the merchant prefix via `branchShortName()`
 * — same helper the merchant profile uses ("Covelum — Brightlingsea"
 * → "Brightlingsea").
 *
 * Scroll-driven opacity (Emil framework — unchanged): fades 0→1
 * across [fadeStart, fadeEnd]. Reduced-motion → step at fadeEnd.
 */
export function CollapsedHeader({
  merchantName,
  branchName,
  logoUrl,
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
      {/* Vertical cream gradient — light at top, slightly more
          present at the bottom. Same palette + craft as the
          merchant profile's identity zone (round-5 §12: brand-
          family hue at H≈28). Gives the chrome architectural
          depth without sitting as a flat opaque box. */}
      <LinearGradient
        colors={['#FFF9F5', '#FCF0E5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      {/* Hairline at bottom edge — subtle border-bottom that grounds
          the chrome over the body content scrolling beneath. */}
      <View style={styles.hairline} pointerEvents="none" />

      {/* Safe-area spacer */}
      <View style={{ height: insetTop }} pointerEvents="none" />

      {/* Content row: back · logo · text stack */}
      <View style={styles.contentRow} pointerEvents="box-none">
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

        <View style={styles.logoBox} testID="collapsed-header-logo">
          {logoUrl ? (
            <Image
              source={{ uri: logoUrl }}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={styles.logoPlaceholder} />
          )}
        </View>

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

// 2-line stack with explicit padding so the branch line never
// touches the bottom hairline (round-12 fix). Vertical layout:
//   8pt top padding
//   17pt merchant + 3pt gap + 14pt branch ≈ 34pt content
//   16pt bottom padding (more than top — gives the branch line
//                        clear separation from the hairline)
//   = 58pt content row.
const CONTENT_ROW_H = 58

const LOGO_SIZE = 36

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    overflow: 'hidden',
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
    paddingTop: 8,
    paddingBottom: 16,
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
  // ── Merchant logo ───────────────────────────────────────────
  // Rounded square (12pt radius) so the logo reads as a brand mark
  // on a light cream surface — same shape language as the merchant
  // profile collapsed header.
  logoBox: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  logoPlaceholder: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.04)',
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
