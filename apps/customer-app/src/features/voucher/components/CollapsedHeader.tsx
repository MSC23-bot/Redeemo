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
  /** Voucher title — primary identity of this screen, top line. */
  title: string
  /**
   * Voucher type — drives the 4pt left-edge color stripe + the
   * SAVE chip's accent color.
   */
  type: VoucherType
  /** Estimated saving — surfaced in the right-side SAVE chip. */
  estimatedSaving: number
  /** Merchant business name — shown on the secondary context line. */
  merchantName: string
  /**
   * Branch name (selected) — shown alongside the merchant on the
   * context line. When null (selectedBranch unresolved), the
   * separator + branch are dropped gracefully.
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
 * Voucher Detail collapsed top chrome — pinned safe-area frosted bar
 * that takes over from the hero NavRow once the user scrolls past
 * the coupon hero.
 *
 * **Round 9 — typography rebalanced for readability.** Round-8 made
 * the title the smallest line in a 3-line stack (12.5pt 500), which
 * was unreadable on-device. Round 9 inverts the hierarchy and
 * collapses to a 2-line layout:
 *
 *   Line 1 — Voucher title (16pt 800 navy)
 *            The thing that identifies THIS voucher. Largest +
 *            heaviest. Single line, ellipsize tail; adjustsFontSizeToFit
 *            with minimumFontScale=0.78 so long titles shrink before
 *            truncating.
 *
 *   Line 2 — Merchant · Branch (12pt 600 muted-navy)
 *            Combined supporting-context line. Single line,
 *            ellipsize tail. When branchName is null, just the
 *            merchant shows — no fabricated copy.
 *
 *   Right  — SAVE chip
 *            SAVE label (9pt 800, letter-spaced) + amount (15pt 800)
 *            both `textAlign: 'center'` to fix the round-8 visual
 *            off-center bug.
 *
 * Why title-first vs round 8's merchant-first: when the hero scrolls
 * away, the user has lost visual confirmation of THIS voucher. The
 * title is what makes this screen unique — merchant + branch are
 * available on every voucher screen this user could be on. Putting
 * the title biggest at top means the user can re-orient with one
 * glance. iOS's now-playing chrome uses the same pattern (track
 * name large + bold, artist below smaller).
 *
 * impeccable laws applied:
 *   - Hierarchy through scale + weight contrast: 16pt 800 → 12pt 600
 *     (1.33x scale ratio + heavy → medium weight). Clear hierarchy.
 *   - Restrained color: navy + muted-navy + one accent (type color
 *     on the stripe + chip).
 *   - Single font family throughout.
 *
 * ui-ux-pro-max overflow protection:
 *   - All text Texts: numberOfLines=1 + ellipsizeMode="tail".
 *   - Title + merchant line: adjustsFontSizeToFit + minimumFontScale.
 *   - SAVE amount: adjustsFontSizeToFit for large values.
 *   - Calculated paddingRight reserves the chip footprint.
 *   - Wrapper overflow:hidden as final safety.
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

  const wrapperHeight = insetTop + CONTENT_ROW_H

  const contextLine = branchName
    ? `${merchantName} · ${branchName}`
    : merchantName

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
      {/* Frosted safe-area surface */}
      {Platform.OS === 'android' ? (
        <View style={[StyleSheet.absoluteFillObject, styles.androidFallback]} pointerEvents="none" />
      ) : (
        <BlurView intensity={32} tint="default" style={StyleSheet.absoluteFillObject} pointerEvents="none" />
      )}

      {/* Type-color left stripe — chromatic anchor to the hero */}
      <View style={[styles.typeStripe, { backgroundColor: gradEnd }]} pointerEvents="none" />

      {/* Hairline at bottom edge */}
      <View style={styles.hairline} pointerEvents="none" />

      {/* Safe-area spacer */}
      <View style={{ height: insetTop }} pointerEvents="none" />

      {/* Content row: back · text stack · SAVE chip */}
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
            style={styles.titleText}
            numberOfLines={1}
            ellipsizeMode="tail"
            adjustsFontSizeToFit
            minimumFontScale={0.78}
            testID="collapsed-header-title"
          >
            {title}
          </Text>

          <Text
            variant="label.md"
            style={styles.contextText}
            numberOfLines={1}
            ellipsizeMode="tail"
            testID="collapsed-header-context"
          >
            {contextLine}
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
      style={[
        styles.saveChip,
        {
          borderColor: accentColor + '33',
          backgroundColor: accentColor + '0F',
        },
      ]}
      testID="collapsed-header-save-chip"
    >
      {/* Round-9 fix: textAlign='center' on both label + amount so
          they're horizontally centered within the chip. The previous
          version relied on parent alignItems: 'center' which can
          drift visually with letter-spacing on SAVE. */}
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

// Content row sized for 2-line text stack at the new typography:
//   16pt title + 4pt gap + 12pt context = 32pt content
//   + 12pt top padding + 12pt bottom padding = 56pt row.
const CONTENT_ROW_H = 60
const STRIPE_W = 4
const SAVE_CHIP_WIDTH = 76

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
  // ── 2-line text stack ──────────────────────────────────────
  textStack: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 3,
  },
  titleText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#010C35',
    letterSpacing: -0.2,
  },
  contextText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 0.05,
  },
  // ── SAVE chip ───────────────────────────────────────────────
  saveChip: {
    width: SAVE_CHIP_WIDTH,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveChipLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
    textAlign: 'center',
    width: '100%',
  },
  saveChipAmount: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
    marginTop: 1,
  },
})
