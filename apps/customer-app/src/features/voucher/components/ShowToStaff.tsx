import React, { useState, useEffect } from 'react'
import { View, Modal, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { useAnimatedStyle, withRepeat, withTiming, useSharedValue, Easing } from 'react-native-reanimated'
import { Tag, Clock } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, radius } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import { useMotionScale } from '@/design-system/useMotionScale'
import type { VoucherType } from '@/lib/api/redemption'

const TYPE_LABELS: Record<VoucherType, string> = {
  BOGO: 'BUY ONE GET ONE FREE',
  DISCOUNT_FIXED: 'DISCOUNT',
  DISCOUNT_PERCENT: 'DISCOUNT',
  FREEBIE: 'FREEBIE',
  SPEND_AND_SAVE: 'SPEND & SAVE',
  PACKAGE_DEAL: 'PACKAGE DEAL',
  TIME_LIMITED: 'TIME-LIMITED OFFER',
  REUSABLE: 'REUSABLE',
}

type Props = {
  visible: boolean
  redemptionCode: string
  voucherTitle: string
  voucherType: VoucherType
  merchantName: string
  branchName: string
  customerName: string
  redeemedAt: string
  onDone: () => void
}

function LiveClock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const formatted = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    + ' · '
    + now.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })

  return (
    <View testID="live-clock" style={styles.clockRow}>
      <Clock size={18} color={color.brandRose} />
      <Text variant="heading.md" color="primary" style={styles.clockText}>{formatted}</Text>
    </View>
  )
}

export function ShowToStaff({
  visible, redemptionCode, voucherTitle, voucherType,
  merchantName, branchName, customerName, redeemedAt,
  onDone,
}: Props) {
  const pulseScale = useSharedValue(1)
  const pulseOpacity = useSharedValue(1)
  const motionScale = useMotionScale()

  useEffect(() => {
    if (visible && motionScale > 0) {
      pulseScale.value = withRepeat(
        withTiming(0.6, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        -1, true,
      )
      pulseOpacity.value = withRepeat(
        withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        -1, true,
      )
    }
  }, [visible, pulseScale, pulseOpacity, motionScale])

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }))

  if (!visible) return null

  const typeColor = color.voucher.byType[voucherType]
  const date = new Date(redeemedAt)
  const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <LinearGradient
        colors={['#E20C04', '#C50A03', '#B80902', '#E84A00']}
        locations={[0, 0.3, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        {/* Type badge */}
        <View style={[styles.typeBadge, { backgroundColor: typeColor }]}>
          <Tag size={12} color="#FFF" />
          <Text variant="label.eyebrow" color="inverse" style={styles.typeText}>
            {TYPE_LABELS[voucherType]}
          </Text>
        </View>

        {/* Voucher info */}
        <Text variant="heading.lg" color="inverse" style={styles.voucherTitle}>{voucherTitle}</Text>
        <Text variant="body.sm" style={styles.voucherMeta}>{merchantName} · {branchName}</Text>

        {/* Animated code card */}
        <View style={styles.codeCardOuter}>
          <View style={styles.codeCard}>
            {/* LIVE badge */}
            <View style={styles.liveBadge}>
              <Animated.View style={[styles.liveDot, pulseStyle]} />
              <Text variant="label.eyebrow" style={styles.liveText}>LIVE</Text>
            </View>

            {/* Code */}
            <Text variant="display.lg" color="primary" style={styles.code}>{redemptionCode}</Text>

            {/* QR placeholder */}
            <View style={styles.qrBox}>
              <View style={styles.qrPattern} />
              <View style={styles.qrLogo}>
                <LinearGradient colors={[color.brandRose, color.brandCoral]} style={styles.qrLogoInner}>
                  <Text variant="label.lg" color="inverse" style={{ fontWeight: '800' }}>R</Text>
                </LinearGradient>
              </View>
            </View>

            {/* Live clock */}
            <View style={styles.clockDivider} />
            <LiveClock />
          </View>
        </View>

        {/* Info card */}
        <View style={styles.infoCard}>
          <InfoRow label="Customer" value={customerName} />
          <InfoRow label="Voucher Type" value={voucherType.replace(/_/g, ' ')} />
          <InfoRow label="Redeemed" value={`${dateStr} at ${timeStr}`} />
        </View>

        {/* Done button */}
        <Pressable
          onPress={() => { lightHaptic(); onDone() }}
          accessibilityRole="button"
          style={styles.doneButton}
        >
          <Text variant="heading.sm" color="inverse" style={{ fontWeight: '700', fontSize: 15 }}>Done</Text>
        </Pressable>
      </LinearGradient>
    </Modal>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text variant="body.sm" style={styles.infoLabel}>{label}</Text>
      <Text variant="body.sm" color="inverse" style={styles.infoValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 54, paddingHorizontal: 24, paddingBottom: 32, alignItems: 'center' },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    marginBottom: spacing[3],
  },
  typeText: { letterSpacing: 0.12 * 12, fontSize: 12 },
  voucherTitle: { fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  voucherMeta: { color: 'rgba(255,255,255,0.75)', textAlign: 'center', fontSize: 13, marginBottom: spacing[6] },
  codeCardOuter: {
    width: '100%',
    padding: 3,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: spacing[5],
  },
  codeCard: {
    backgroundColor: '#FFF',
    borderRadius: radius.xl - 2,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing[3] },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.brandRose },
  liveText: { color: color.brandRose, fontWeight: '800', fontSize: 10 },
  code: { fontWeight: '800', fontSize: 38, letterSpacing: 6, fontVariant: ['tabular-nums'], marginBottom: spacing[5] },
  qrBox: {
    width: 160,
    height: 160,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: color.border.subtle,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  qrPattern: { width: 120, height: 120, backgroundColor: color.surface.subtle, borderRadius: 4 },
  qrLogo: { position: 'absolute', width: 28, height: 28 },
  qrLogoInner: { flex: 1, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  clockDivider: {
    width: '100%',
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: color.border.subtle,
    marginTop: spacing[4],
    marginBottom: spacing[4],
  },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  clockText: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  infoCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.lg,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    marginBottom: spacing[5],
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  infoLabel: { color: 'rgba(255,255,255,0.6)', fontWeight: '500', fontSize: 13 },
  infoValue: { fontWeight: '700', fontSize: 13 },
  doneButton: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 15,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
})
