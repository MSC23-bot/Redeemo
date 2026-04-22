import React, { useEffect, useState, useCallback, useRef } from 'react'
import { View, Modal, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Check, Tag } from 'lucide-react-native'
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { color, spacing, radius } from '@/design-system/tokens'
import { successHaptic, lightHaptic } from '@/design-system/haptics'
import { useMotionScale } from '@/design-system/useMotionScale'
import { QRCodeBlock } from './QRCodeBlock'
import { formatCode } from '../utils/formatCode'
import { useRedemptionPolling } from '../hooks/useRedemptionPolling'
import { useBrightnessBoost } from '../hooks/useBrightnessBoost'
import { useScreenshotGuard } from '../hooks/useScreenshotGuard'
import { useAutoHideTimer } from '../hooks/useAutoHideTimer'
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

const AUTO_DISMISS_MS = 4_000

function LiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const text = now.toLocaleTimeString('en-GB', { hour12: false })
    + ' · '
    + now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <View
      testID="live-clock"
    >
      <Text variant="heading.md" color="primary" style={styles.clockText}>{text}</Text>
    </View>
  )
}

function LivePill() {
  const scale = useSharedValue(1)
  const opacity = useSharedValue(1)
  const motion = useMotionScale()
  useEffect(() => {
    if (motion <= 0) return
    scale.value   = withRepeat(withTiming(0.6, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true)
    opacity.value = withRepeat(withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true)
  }, [scale, opacity, motion])
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }))
  return (
    <View style={styles.livePill}>
      <Animated.View style={[styles.liveDot, style]} />
      <Text variant="label.eyebrow" style={styles.liveText}>LIVE</Text>
    </View>
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

export function ShowToStaff(props: Props) {
  const { visible, redemptionCode, voucherTitle, voucherType, merchantName, branchName, customerName, redeemedAt, onDone } = props
  const [screenshotBanner, setScreenshotBanner] = useState(false)
  const autoDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pollState = useRedemptionPolling(redemptionCode, { enabled: visible })
  useBrightnessBoost(visible)
  useScreenshotGuard(redemptionCode, {
    active: visible && pollState.phase !== 'validated',
    onBannerShown: useCallback(() => {
      setScreenshotBanner(true)
      setTimeout(() => setScreenshotBanner(false), 4_000)
    }, []),
  })

  const isValidated = pollState.phase === 'validated'
  const autoHide = useAutoHideTimer({ active: visible, frozen: isValidated })

  useEffect(() => {
    if (!isValidated) return
    successHaptic()
    autoDismissTimer.current = setTimeout(onDone, AUTO_DISMISS_MS)
    return () => {
      if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current)
      autoDismissTimer.current = null
    }
  }, [isValidated, onDone])

  const cancelAutoDismiss = useCallback(() => {
    if (autoDismissTimer.current) {
      clearTimeout(autoDismissTimer.current)
      autoDismissTimer.current = null
    }
  }, [])

  if (!visible) return null

  const formatted = formatCode(redemptionCode)
  const blurred   = autoHide.state === 'hidden' && !isValidated
  const typeColor = color.voucher.byType[voucherType]
  const date = new Date(redeemedAt)
  const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <Pressable style={{ flex: 1 }} onPress={autoHide.resetTimer}>
        <LinearGradient
          colors={['#E20C04', '#C50A03', '#B80902', '#E84A00']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.container}
        >
          {screenshotBanner ? (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.screenshotBanner}>
              <Text variant="body.sm" color="inverse" style={{ textAlign: 'center' }}>
                Screenshots of this screen are logged. Sharing a redemption code with someone else may result in account review.
              </Text>
            </Animated.View>
          ) : null}

          {isValidated ? (
            <Pressable
              testID="validated-surface"
              style={styles.validatedSurface}
              onPress={cancelAutoDismiss}
            >
              <Animated.View entering={FadeIn} style={styles.validatedInner}>
                <View style={styles.tick}><Check size={48} color="#fff" /></View>
                <Text variant="display.md" color="inverse" style={styles.validatedTitle}>Validated ✓</Text>
                <Text variant="body.md" style={styles.validatedMeta}>{merchantName} · {branchName}</Text>
                <Pressable
                  onPress={() => { lightHaptic(); cancelAutoDismiss(); onDone() }}
                  accessibilityRole="button"
                  style={styles.doneButton}
                >
                  <Text variant="heading.sm" color="inverse">Done</Text>
                </Pressable>
              </Animated.View>
            </Pressable>
          ) : (
            <>
              <View style={[styles.typeBadge, { backgroundColor: typeColor }]}>
                <Tag size={12} color="#FFF" />
                <Text variant="label.eyebrow" color="inverse">{TYPE_LABELS[voucherType]}</Text>
              </View>

              <Text variant="heading.lg" color="inverse" style={styles.voucherTitle}>{voucherTitle}</Text>
              <Text variant="body.sm" style={styles.voucherMeta}>{merchantName} · {branchName}</Text>

              <View style={styles.codeCard}>
                <LivePill />
                <Text variant="display.lg" color="primary" style={styles.code}>{formatted}</Text>

                <View style={styles.qrWrap}>
                  {blurred ? (
                    <Pressable
                      onPress={autoHide.resetTimer}
                      accessibilityRole="button"
                      accessibilityLabel="Code hidden. Tap to show again."
                      style={styles.blurFallback}
                    >
                      <Text variant="body.md" color="primary">Tap to show again</Text>
                    </Pressable>
                  ) : (
                    <QRCodeBlock value={redemptionCode} size={240} hero />
                  )}
                </View>

                <View style={styles.clockDivider} />
                <LiveClock />

                <Text
                  variant="body.sm"
                  color="secondary"
                  accessibilityLiveRegion="polite"
                  style={styles.statusLine}
                >
                  {pollState.phase === 'timed-out'
                    ? 'Still waiting for staff to validate — you can ask them to scan again'
                    : autoHide.state === 'warning'
                      ? 'Screen will dim in 10s. Tap to keep showing.'
                      : 'Waiting for staff to validate…'}
                </Text>
              </View>

              <View style={styles.infoCard}>
                <InfoRow label="Customer" value={customerName} />
                <InfoRow label="Redeemed" value={`${dateStr} at ${timeStr}`} />
              </View>

              <Pressable
                onPress={() => { lightHaptic(); onDone() }}
                accessibilityRole="button"
                style={styles.doneButton}
              >
                <Text variant="heading.sm" color="inverse" style={{ fontWeight: '700', fontSize: 15 }}>Done</Text>
              </Pressable>
            </>
          )}
        </LinearGradient>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 54, paddingHorizontal: 24, paddingBottom: 32, alignItems: 'center' },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.md, marginBottom: spacing[3] },
  voucherTitle: { fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  voucherMeta: { color: 'rgba(255,255,255,0.75)', textAlign: 'center', fontSize: 13, marginBottom: spacing[6] },
  codeCard: { width: '100%', backgroundColor: '#FFF', borderRadius: radius.xl, paddingVertical: 24, paddingHorizontal: 20, alignItems: 'center' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing[3] },
  liveDot:  { width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.brandRose },
  liveText: { color: color.brandRose, fontWeight: '800', fontSize: 10 },
  code:     { fontWeight: '800', fontSize: 34, letterSpacing: 6, fontVariant: ['tabular-nums'], marginBottom: spacing[5] },
  qrWrap:   { alignItems: 'center', justifyContent: 'center', minHeight: 240 },
  blurFallback: { width: 240, height: 240, backgroundColor: 'rgba(0,0,0,0.04)', alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  clockDivider: { width: '100%', borderTopWidth: 2, borderStyle: 'dashed', borderColor: color.border.subtle, marginTop: spacing[4], marginBottom: spacing[4] },
  clockText:    { fontWeight: '800', fontVariant: ['tabular-nums'] },
  statusLine:   { marginTop: spacing[3], textAlign: 'center' },
  screenshotBanner: { position: 'absolute', top: 54, left: 24, right: 24, backgroundColor: 'rgba(0,0,0,0.72)', padding: spacing[3], borderRadius: radius.md, zIndex: 10 },
  infoCard: { width: '100%', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.lg, padding: spacing[4], borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', marginTop: spacing[4], marginBottom: spacing[4] },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  infoLabel: { color: 'rgba(255,255,255,0.6)', fontWeight: '500', fontSize: 13 },
  infoValue: { fontWeight: '700', fontSize: 13 },
  validatedSurface: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  validatedInner:   { alignItems: 'center' },
  tick: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center', marginBottom: spacing[4] },
  validatedTitle: { fontWeight: '800' },
  validatedMeta:  { color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  doneButton: { marginTop: spacing[6], paddingVertical: 14, paddingHorizontal: 44, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.lg },
})
