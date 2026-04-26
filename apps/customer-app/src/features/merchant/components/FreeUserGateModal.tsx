import React from 'react'
import { View, Pressable, Modal, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Lock, Tag } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { Text } from '@/design-system/Text'
import { color, spacing } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import Animated, {
  useAnimatedStyle, withRepeat, withTiming, withSequence,
  Easing, SlideInDown,
} from 'react-native-reanimated'

type Props = {
  visible: boolean
  onDismiss: () => void
  merchantName: string
  voucherCount: number
}

export function FreeUserGateModal({ visible, onDismiss, merchantName, voucherCount }: Props) {
  const router = useRouter()

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: withRepeat(
      withSequence(
        withTiming(0.5, { duration: 1250, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.15, { duration: 1250, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    ),
  }))

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <Animated.View entering={SlideInDown.springify().damping(18).stiffness(260)} style={styles.modal}>
          {/* Top gradient accent */}
          <LinearGradient
            colors={color.brandGradient as unknown as string[]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.topAccent}
          />

          {/* Lock icon with glow */}
          <Animated.View style={[styles.iconBox, glowStyle]}>
            <LinearGradient
              colors={color.brandGradient as unknown as string[]}
              style={styles.iconGradient}
            >
              <Lock size={32} color="#FFF" />
            </LinearGradient>
          </Animated.View>

          {/* Title */}
          <Text variant="display.sm" style={styles.title}>
            Unlock Voucher Redemption
          </Text>

          {/* Subtitle */}
          <Text variant="body.sm" color="secondary" align="center" style={styles.subtitle}>
            Subscribe to redeem exclusive vouchers from{' '}
            <Text variant="body.sm" style={styles.merchantBold}>{merchantName}</Text>{' '}
            and hundreds of local businesses.
          </Text>

          {/* Voucher count */}
          <View style={styles.voucherRow}>
            <Tag size={12} color={color.brandRose} />
            <Text variant="label.lg" style={styles.voucherCount}>
              {voucherCount} voucher{voucherCount !== 1 ? 's' : ''} waiting to be redeemed
            </Text>
          </View>

          {/* Monthly CTA */}
          <Pressable
            onPress={() => { lightHaptic(); onDismiss(); router.push('/(auth)/subscription-prompt' as never) }}
            style={styles.monthlyBtn}
          >
            <LinearGradient
              colors={color.brandGradient as unknown as string[]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.monthlyGradient}
            >
              <Text variant="heading.sm" style={styles.monthlyText}>Subscribe — £6.99/mo</Text>
            </LinearGradient>
          </Pressable>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text variant="label.md" color="tertiary" meta style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Annual CTA */}
          <Pressable
            onPress={() => { lightHaptic(); onDismiss(); router.push('/(auth)/subscription-prompt' as never) }}
            style={styles.annualBtn}
          >
            <Text variant="label.lg" style={styles.annualText}>£69.99/year</Text>
            <View style={styles.saveBadge}>
              <Text variant="label.md" style={styles.saveText}>SAVE 2 MONTHS</Text>
            </View>
          </Pressable>

          {/* Dismiss */}
          <Pressable onPress={onDismiss} style={styles.dismissBtn}>
            <Text variant="label.lg" color="tertiary" meta style={styles.dismissText}>Maybe later</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(1,12,53,0.5)',
    paddingHorizontal: 24,
  },
  modal: {
    backgroundColor: '#FFF',
    borderRadius: 28,
    paddingTop: 40,
    paddingHorizontal: 24,
    paddingBottom: 32,
    width: '100%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 80,
    shadowOffset: { width: 0, height: 24 },
    elevation: 20,
    alignItems: 'center',
    overflow: 'hidden',
  },
  topAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  iconBox: {
    marginBottom: 20,
    shadowColor: color.brandRose,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  iconGradient: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#010C35',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    marginTop: 12,
  },
  merchantBold: {
    fontWeight: '700',
    color: '#010C35',
  },
  voucherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  voucherCount: {
    fontSize: 12,
    fontWeight: '700',
    color: color.brandRose,
  },
  monthlyBtn: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 24,
    shadowColor: color.brandRose,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  monthlyGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  monthlyText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 16,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    fontSize: 12,
  },
  annualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  annualText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#010C35',
  },
  saveBadge: {
    backgroundColor: 'rgba(22,163,74,0.1)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  saveText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#16A34A',
    letterSpacing: 0.5,
  },
  dismissBtn: {
    marginTop: 20,
  },
  dismissText: {
    fontSize: 13,
    fontWeight: '600',
  },
})
