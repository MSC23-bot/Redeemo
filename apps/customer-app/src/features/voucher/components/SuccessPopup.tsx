import React, { useEffect } from 'react'
import { View, Modal, Pressable, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withDelay, withTiming, FadeIn } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Check, Eye, Star, Tag } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, radius } from '@/design-system/tokens'
import { lightHaptic, successHaptic } from '@/design-system/haptics'
import { useMotionScale } from '@/design-system/useMotionScale'
import type { VoucherType } from '@/lib/api/redemption'

type Props = {
  visible: boolean
  redemptionCode: string
  voucherTitle: string
  voucherType: VoucherType
  merchantName: string
  branchName: string
  imageUrl: string | null
  redeemedAt: string
  onShowToStaff: () => void
  onRateReview: () => void
  onDone: () => void
}

export function SuccessPopup({
  visible, redemptionCode, voucherTitle, voucherType,
  merchantName, branchName, imageUrl, redeemedAt,
  onShowToStaff, onRateReview, onDone,
}: Props) {
  const scale = useSharedValue(0.8)
  const ty = useSharedValue(30)
  const checkScale = useSharedValue(0)
  const motionScale = useMotionScale()

  useEffect(() => {
    if (visible) {
      successHaptic()
      if (motionScale > 0) {
        scale.value = withSpring(1, { damping: 12, stiffness: 120 })
        ty.value = withSpring(0, { damping: 12, stiffness: 120 })
        checkScale.value = withDelay(200, withSpring(1, { damping: 10, stiffness: 180 }))
      } else {
        scale.value = 1
        ty.value = 0
        checkScale.value = 1
      }
    } else {
      scale.value = 0.8
      ty.value = 30
      checkScale.value = 0
    }
  }, [visible, scale, ty, checkScale, motionScale])

  const modalStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: ty.value }],
  }))

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }))

  if (!visible) return null

  const date = new Date(redeemedAt)
  const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const typeColor = color.voucher.byType[voucherType]

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <View style={styles.overlay}>
        <Animated.View style={[styles.modal, modalStyle]}>
          {/* Header */}
          <LinearGradient colors={[color.brandRose, color.brandCoral]} style={styles.header}>
            <Animated.View style={[styles.checkCircle, checkStyle]}>
              <Check size={24} color="#FFF" strokeWidth={3} />
            </Animated.View>
            <Text variant="heading.md" color="inverse" style={styles.headerTitle}>Voucher Redeemed!</Text>
            <Text variant="label.md" style={styles.headerSubtitle}>Show this to staff to claim your discount</Text>
          </LinearGradient>

          {/* Voucher strip */}
          <View style={styles.voucherStrip}>
            <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
            <View style={styles.stripInfo}>
              <Text variant="label.md" style={[styles.typeLabel, { color: typeColor }]}>
                {voucherType.replace(/_/g, ' ')}
              </Text>
              <Text variant="label.lg" color="primary" style={{ fontWeight: '700', fontSize: 12 }}>{voucherTitle}</Text>
              <Text variant="label.md" color="tertiary" style={{ fontSize: 10 }}>{merchantName}</Text>
            </View>
          </View>

          {/* Body */}
          <View style={styles.body}>
            {/* Code */}
            <View style={styles.codeBox}>
              <Text variant="label.eyebrow" color="tertiary" style={styles.codeLabel}>Redemption Code</Text>
              <Text variant="display.md" color="primary" style={styles.codeValue}>{redemptionCode}</Text>
            </View>

            {/* Info rows */}
            <View style={styles.infoRows}>
              <View style={styles.infoRow}>
                <Text variant="label.md" color="tertiary">Date</Text>
                <Text variant="label.md" color="primary" style={{ fontWeight: '700' }}>{dateStr}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text variant="label.md" color="tertiary">Time</Text>
                <Text variant="label.md" color="primary" style={{ fontWeight: '700' }}>{timeStr}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text variant="label.md" color="tertiary">Branch</Text>
                <Text variant="label.md" color="primary" style={{ fontWeight: '700' }}>{branchName}</Text>
              </View>
            </View>

            {/* Show to Staff button */}
            <Pressable onPress={() => { lightHaptic(); onShowToStaff() }} accessibilityRole="button">
              <LinearGradient
                colors={[color.brandRose, color.brandCoral]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.showToStaffBtn}
              >
                <Eye size={14} color="#FFF" />
                <Text variant="label.lg" color="inverse" style={{ fontWeight: '800', fontSize: 14 }}>Show to Staff</Text>
              </LinearGradient>
            </Pressable>

            {/* Secondary actions */}
            <View style={styles.secondaryRow}>
              <Pressable onPress={() => { lightHaptic(); onRateReview() }} style={styles.secondaryBtn} accessibilityRole="button">
                <Star size={13} color="#7C3AED" />
                <Text variant="label.md" style={styles.rateText}>Rate & Review</Text>
              </Pressable>
              <Pressable onPress={() => { lightHaptic(); onDone() }} style={styles.doneBtn} accessibilityRole="button">
                <Text variant="label.md" color="primary" style={{ fontWeight: '600' }}>Done</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(1,12,53,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 60,
  },
  modal: {
    maxWidth: 330,
    width: '100%',
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 32 },
    elevation: 20,
    backgroundColor: '#FFF',
  },
  header: {
    alignItems: 'center',
    paddingTop: 22,
    paddingHorizontal: 22,
    paddingBottom: 18,
  },
  checkCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#16A34A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    marginBottom: spacing[2],
    shadowColor: '#16A34A',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  headerTitle: { fontWeight: '800', fontSize: 18 },
  headerSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 4 },
  voucherStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: color.cream,
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
  },
  typeDot: { width: 4, height: 28, borderRadius: 2 },
  stripInfo: { flex: 1 },
  typeLabel: { fontWeight: '800', fontSize: 9, textTransform: 'uppercase' },
  body: { padding: spacing[4] },
  codeBox: {
    alignItems: 'center',
    backgroundColor: '#F8F6F3',
    borderRadius: radius.md + 2,
    paddingVertical: spacing[3],
    marginBottom: spacing[3],
  },
  codeLabel: { fontSize: 9, marginBottom: 4 },
  codeValue: { fontWeight: '800', fontSize: 26, letterSpacing: 4, fontVariant: ['tabular-nums'] },
  infoRows: { marginBottom: spacing[4] },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  showToStaffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: 14,
    borderRadius: radius.md + 2,
    shadowColor: color.brandRose,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    marginBottom: spacing[3],
  },
  secondaryRow: { flexDirection: 'row', gap: spacing[2] },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: 'rgba(124,58,237,0.06)',
    borderWidth: 1.5,
    borderColor: '#7C3AED',
  },
  rateText: { color: '#7C3AED', fontWeight: '700' },
  doneBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.border.default,
  },
})
