import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Lock, Check, X } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import { BottomSheet } from '@/design-system/motion/BottomSheet'

type Props = {
  visible: boolean
  /** Dismiss the modal — user picked "Maybe later" or tapped the close icon. */
  onDismiss: () => void
  /**
   * User picked a plan or the primary CTA. The Voucher Detail screen
   * routes to `/(auth)/subscription-prompt` — the actual plan
   * selection happens there. The modal does NOT pass query params
   * because `SubscribePromptScreen` doesn't currently honour them
   * (per round-16 owner direction: no ignored query params).
   */
  onSubscribe: () => void
}

/**
 * Voucher Detail subscription prompt — round-16 conversion path for
 * non-subscribed users browsing a voucher.
 *
 * Surface contract:
 *   • Slides up from the bottom of Voucher Detail AFTER voucher
 *     context has loaded (parent gates on `voucher` data being non-
 *     null + first focus per visit).
 *   • Dismissible: "Maybe later" + tap-out + close icon all dismiss.
 *   • Both plan buttons fire `onSubscribe` — the parent routes to
 *     `/(auth)/subscription-prompt` for the actual plan selection.
 *     No ignored query params; the user picks plan there.
 *   • Free-user sticky CTA on Voucher Detail still routes to the
 *     same screen, so the sheet is conversion polish, not a hard
 *     gate.
 *
 * Copy:
 *   • "Unlock Voucher Redemption" — reused from the deleted
 *     FreeUserGateModal (the headline still fits this surface).
 *   • Plan pricing "£6.99/mo" / "£69.99/yr" matches the project's
 *     subscription contract (Phase 2C, locked) and the
 *     SubscribePromptScreen UI.
 *   • "2 months free" annual benefit matches the live SubscribePromptScreen
 *     (line 141 of that file). Approved product copy.
 *   • No fabricated merchant/voucher counts, no "trusted by thousands"
 *     unsubstantiated claims (round-16 owner direction).
 */
export function SubscriptionPromptModal({ visible, onDismiss, onSubscribe }: Props) {
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Unlock Voucher Redemption">
      <View style={styles.root} testID="subscription-prompt-modal">
        {/* Close affordance — top-right of the sheet body */}
        <Pressable
          onPress={() => { lightHaptic(); onDismiss() }}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={10}
          style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
          testID="subscription-prompt-close"
        >
          <X size={18} color="#6B7280" strokeWidth={2.4} />
        </Pressable>

        {/* Lock icon — visual cue for "gated" without being aggressive */}
        <View style={styles.iconWrap} pointerEvents="none">
          <LinearGradient
            colors={[color.brandRose, color.brandCoral]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <Lock size={26} color="#FFFFFF" strokeWidth={2.4} />
        </View>

        <Text variant="heading.md" style={styles.title}>Unlock Voucher Redemption</Text>
        <Text variant="body.md" style={styles.body}>
          Subscribe to redeem this voucher and unlock eligible vouchers across all merchants on Redeemo.
        </Text>

        {/* Plans — both fire the same onSubscribe; the user selects
            plan on the SubscribePromptScreen itself. */}
        <Pressable
          onPress={() => { lightHaptic(); onSubscribe() }}
          accessibilityRole="button"
          accessibilityLabel="Annual plan, £69.99 per year, 2 months free"
          style={({ pressed }) => [styles.planBtn, styles.planAnnual, pressed && styles.planPressed]}
          testID="subscription-prompt-annual"
        >
          <View style={styles.planRow}>
            <View style={styles.planLeft}>
              <Text variant="label.md" style={[styles.planTitle, styles.planTitleAnnual]}>Annual</Text>
              <Text variant="label.md" style={[styles.planSub, styles.planSubAnnual]}>2 months free</Text>
            </View>
            <Text variant="heading.sm" style={[styles.planPrice, styles.planPriceAnnual]}>£69.99/yr</Text>
          </View>
          <View style={styles.bestValuePill}>
            <Check size={11} color="#FFFFFF" strokeWidth={2.6} />
            <Text variant="label.md" style={styles.bestValuePillText}>Best value</Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => { lightHaptic(); onSubscribe() }}
          accessibilityRole="button"
          accessibilityLabel="Monthly plan, £6.99 per month, cancel anytime"
          style={({ pressed }) => [styles.planBtn, styles.planMonthly, pressed && styles.planPressed]}
          testID="subscription-prompt-monthly"
        >
          <View style={styles.planRow}>
            <View style={styles.planLeft}>
              <Text variant="label.md" style={[styles.planTitle, styles.planTitleMonthly]}>Monthly</Text>
              <Text variant="label.md" style={[styles.planSub, styles.planSubMonthly]}>Cancel anytime</Text>
            </View>
            <Text variant="heading.sm" style={[styles.planPrice, styles.planPriceMonthly]}>£6.99/mo</Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => { lightHaptic(); onDismiss() }}
          accessibilityRole="button"
          accessibilityLabel="Maybe later"
          style={({ pressed }) => [styles.maybeLater, pressed && styles.maybeLaterPressed]}
          testID="subscription-prompt-maybe-later"
        >
          <Text variant="label.md" style={styles.maybeLaterText}>Maybe later</Text>
        </Pressable>
      </View>
    </BottomSheet>
  )
}

const NAVY     = '#010C35'
const TEXT_2ND = '#4B5563'

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
    zIndex: 5,
  },
  closeBtnPressed: {
    opacity: 0.85,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
    shadowColor: color.brandRose,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: NAVY,
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: TEXT_2ND,
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  // ── Plan buttons ─────────────────────────────────────────────
  planBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  planAnnual: {
    backgroundColor: '#FFFBEB',
    borderColor: '#D97706',
  },
  planMonthly: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  planPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planLeft: {
    flex: 1,
  },
  planTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  planTitleAnnual: {
    color: '#92400E',
  },
  planTitleMonthly: {
    color: '#065F46',
  },
  planSub: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  planSubAnnual: {
    color: '#92400E',
    opacity: 0.85,
  },
  planSubMonthly: {
    color: '#065F46',
    opacity: 0.85,
  },
  planPrice: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  planPriceAnnual: {
    color: '#92400E',
  },
  planPriceMonthly: {
    color: '#065F46',
  },
  bestValuePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#D97706',
    marginTop: 8,
  },
  bestValuePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  // ── Maybe later ──────────────────────────────────────────────
  maybeLater: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  maybeLaterPressed: {
    opacity: 0.7,
  },
  maybeLaterText: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_2ND,
  },
})
