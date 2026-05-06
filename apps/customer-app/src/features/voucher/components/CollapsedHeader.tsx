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
import type { VoucherType } from '@/lib/api/voucher'
import { voucherGradient, formatPounds } from '../utils/voucherTheme'

type Props = {
  /** Voucher title — shown on the third line as voucher-specific context. */
  title: string
  /**
   * Voucher type — drives the 4pt left-edge color stripe + the
   * SAVE chip's accent color.
   */
  type: VoucherType
  /** Estimated saving — surfaced in the right-side SAVE chip. */
  estimatedSaving: number
  /** Merchant business name — primary line, sits next to back button. */
  merchantName: string
  /**
   * Branch name (selected). The full backend value (e.g. "Covelum —
   * Brightlingsea") is stripped of the merchant prefix via
   * `branchShortName()` so the chrome matches the merchant profile
   * surface, where the same branch displays as just "Brightlingsea".
   *
   * When null (selectedBranch unresolved), the line is omitted
   * gracefully — no fabricated copy.
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
 * **Round 10 — consistent with Merchant Profile chrome.** Owner
 * direction: the round-9 BlurView + dark voucher-banner-image
 * combination made navy text unreadable. Use the same collapsed
 * style as the Merchant Profile screen (solid cream `#FFF9F5` bg,
 * no blur).
 *
 * Other round-10 changes:
 *   • Reordered: merchant + branch first (next to back button),
 *     voucher title last. Rationale: the back button returns to
 *     the merchant profile — putting merchant context next to the
 *     back button correctly hints at the destination. Putting the
 *     voucher title there (round-8/9) created false implication
 *     that back was related to the voucher.
 *   • Branch is stripped of the merchant prefix via
 *     `branchShortName()` — same helper the merchant profile uses,
 *     so "Covelum — Brightlingsea" displays as "Brightlingsea".
 *   • SAVE chip given explicit clearance from the row edges so
 *     the bottom doesn't touch the hairline border.
 *   • Type-color left stripe (4pt) preserved as the only
 *     voucher-specific visual cue beyond the SAVE chip — matches
 *     the merchant profile pattern of "consistent chrome with
 *     subtle screen-specific accent".
 *
 * Layout (3-line text stack + SAVE chip):
 *
 *   ┌────────────────────────────────────────────────────┐
 *   │ [4pt type-color stripe — left edge]                  │
 *   │ [safe-area]                                          │
 *   ├────────────────────────────────────────────────────┤
 *   │ [<]  Covelum Restaurant            ┌──────┐         │
 *   │      Brightlingsea                  │ SAVE │         │
 *   │      Free Filter Coffee with Any... │ £2.50│         │
 *   │                                     └──────┘         │
 *   └────────────────────────────────────────────────────┘
 *
 * Typography (consistent with merchant profile collapsed chrome):
 *   Merchant 15pt 700 navy / Branch 13pt 500 muted / Title 12pt 600
 *   navy. Single font family. Hierarchy via scale + weight contrast
 *   (impeccable's law).
 *
 * Overflow protection (impeccable + ui-ux-pro-max):
 *   - All three text Texts: numberOfLines=1 + ellipsizeMode="tail"
 *   - Merchant + title use adjustsFontSizeToFit + minimumFontScale
 *   - SAVE chip amount: adjustsFontSizeToFit for large values
 *   - Wrapper overflow:hidden as final safety
 *
 * Motion (Emil framework — unchanged): scroll-driven opacity.
 * Reduced-motion → step at fadeEnd.
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
      style={[
        styles.saveChip,
        {
          borderColor: accentColor + '33',
          backgroundColor: accentColor + '0F',
        },
      ]}
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

// Content row sized for 3-line text stack at merchant-profile-
// consistent typography:
//   15pt merchant + 2pt + 13pt branch + 4pt + 12pt title ≈ 46pt
//   + 12pt top + 12pt bottom = 70pt row.
//   Save chip is ~46pt tall (paddingV 8 + label 11 + 1 + amount 16),
//   so 70 - 46 = 24pt total clearance = 12pt above/below. No edge
//   collision.
const CONTENT_ROW_H = 70
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
    // Solid cream bg matching the merchant profile's CollapsedHeader
    // (apps/customer-app/src/features/merchant/components/
    // CollapsedHeader.tsx). Round-10 fix: round-9's BlurView picked
    // up the dark voucher-banner-image scrolling underneath, making
    // navy text unreadable. Solid cream guarantees consistent
    // contrast regardless of what's behind.
    backgroundColor: '#FFF9F5',
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
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  backBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  // ── 3-line text stack ──────────────────────────────────────
  textStack: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 2,
  },
  merchantText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#010C35',
    letterSpacing: -0.1,
  },
  branchText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#4B5563',
    letterSpacing: 0.1,
  },
  titleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: -0.05,
    marginTop: 2,
  },
  // ── SAVE chip ───────────────────────────────────────────────
  saveChip: {
    width: SAVE_CHIP_WIDTH,
    paddingVertical: 8,
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
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
    marginTop: 1,
  },
})
