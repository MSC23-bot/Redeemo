import React from 'react'
import { View, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Check } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, radius, elevation } from '@/design-system/tokens'

type Props = {
  redemptionCode: string
  branchName: string
  redeemedAt: string
}

export function RedemptionDetailsCard({ redemptionCode, branchName, redeemedAt }: Props) {
  const date = new Date(redeemedAt)
  const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Check size={14} color="#FFF" />
        </View>
        <View>
          <Text variant="heading.sm" color="primary" style={{ fontWeight: '800', fontSize: 15 }}>Redemption Details</Text>
          <Text variant="label.md" color="tertiary" style={{ fontSize: 11 }}>{dateStr} at {timeStr}</Text>
        </View>
      </View>

      {/* Info rows */}
      <View style={styles.infoRows}>
        <InfoRow label="Code" value={redemptionCode} mono />
        <InfoRow label="Branch" value={branchName} />
        <InfoRow label="Date" value={dateStr} />
        <InfoRow label="Time" value={timeStr} />
      </View>

      {/* QR Code */}
      <View style={styles.qrSection}>
        <Text variant="label.eyebrow" color="tertiary" style={styles.qrLabel}>Redemption QR Code</Text>
        <View style={styles.qrBox}>
          <View style={styles.qrPattern} />
          <View style={styles.qrLogo}>
            <LinearGradient colors={[color.brandRose, color.brandCoral]} style={styles.qrLogoInner}>
              <Text variant="label.lg" color="inverse" style={{ fontWeight: '800' }}>R</Text>
            </LinearGradient>
          </View>
        </View>
      </View>
    </View>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text variant="label.md" color="tertiary" style={{ fontSize: 12 }}>{label}</Text>
      <Text
        variant={mono ? 'label.lg' : 'label.lg'}
        color="primary"
        style={[{ fontWeight: '700', fontSize: 12 }, mono && styles.monoValue]}
      >
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 14,
    marginTop: spacing[4],
    backgroundColor: '#FFF',
    borderRadius: radius.xl,
    padding: spacing[5],
    ...elevation.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#16A34A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoRows: { gap: 8, marginBottom: spacing[4] },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  monoValue: { fontWeight: '800', fontSize: 16, letterSpacing: 3, fontVariant: ['tabular-nums'] },
  qrSection: {
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: color.border.subtle,
    paddingTop: spacing[4],
    alignItems: 'center',
  },
  qrLabel: { marginBottom: spacing[3], fontSize: 10 },
  qrBox: {
    width: 100,
    height: 100,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  qrPattern: { width: 80, height: 80, backgroundColor: color.surface.subtle, borderRadius: 2 },
  qrLogo: { position: 'absolute', width: 20, height: 20 },
  qrLogoInner: { flex: 1, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
})
