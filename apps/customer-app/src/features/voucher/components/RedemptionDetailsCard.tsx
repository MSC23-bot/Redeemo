import React from 'react'
import { View, StyleSheet } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, radius, elevation } from '@/design-system/tokens'
import { redemptionApi, RedemptionStatusByCode } from '@/lib/api/redemption'
import { QRCodeBlock } from './QRCodeBlock'
import { formatCode } from '../utils/formatCode'

type Props = {
  redemptionCode: string
  branchName: string
  redeemedAt: string
}

export function RedemptionDetailsCard({ redemptionCode, branchName, redeemedAt }: Props) {
  const queryClient = useQueryClient()

  useFocusEffect(
    React.useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['redemption', 'by-code', redemptionCode] })
    }, [queryClient, redemptionCode])
  )

  const { data } = useQuery<RedemptionStatusByCode>({
    queryKey: ['redemption', 'by-code', redemptionCode],
    queryFn: () => redemptionApi.getMyRedemptionByCode(redemptionCode),
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    staleTime: 0,
  })

  const redeemed = new Date(redeemedAt)
  const dateStr  = redeemed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const timeStr  = redeemed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  const isValidated = data?.isValidated === true
  const formatted   = formatCode(redemptionCode)

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, isValidated && { backgroundColor: '#16A34A' }]}>
          <Check size={14} color="#FFF" />
        </View>
        <View>
          <Text variant="heading.sm" color="primary" style={styles.title}>Redemption Details</Text>
          <Text variant="label.md" color="tertiary" style={styles.subtitle}>{dateStr} at {timeStr}</Text>
        </View>
      </View>

      <View style={styles.infoRows}>
        <InfoRow label="Code" value={formatted} mono />
        <InfoRow label="Branch" value={branchName} />
        <InfoRow label="Date" value={dateStr} />
        <InfoRow label="Time" value={timeStr} />
      </View>

      {isValidated ? (
        <View style={styles.validatedBlock}>
          <Check size={18} color="#16A34A" />
          <Text variant="body.sm" color="primary" style={styles.validatedText}>
            Validated on {data?.validatedAt ? new Date(data.validatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
          </Text>
        </View>
      ) : (
        <View style={styles.qrSection}>
          <Text variant="label.eyebrow" color="tertiary" style={styles.qrLabel}>Redemption QR Code</Text>
          <QRCodeBlock value={redemptionCode} size={80} />
        </View>
      )}
    </View>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text variant="label.md" color="tertiary" style={styles.rowLabel}>{label}</Text>
      <Text variant="label.lg" color="primary" style={[styles.rowValue, mono && styles.mono]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 14, marginTop: spacing[4], backgroundColor: '#FFF', borderRadius: radius.xl, padding: spacing[5], ...elevation.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[4] },
  headerIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: color.brandRose, justifyContent: 'center', alignItems: 'center' },
  title:    { fontWeight: '800', fontSize: 15 },
  subtitle: { fontSize: 11 },
  infoRows: { gap: 8, marginBottom: spacing[4] },
  row:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontSize: 12 },
  rowValue: { fontWeight: '700', fontSize: 12 },
  mono:     { fontWeight: '800', fontSize: 16, letterSpacing: 3, fontVariant: ['tabular-nums'] },
  qrSection: { borderTopWidth: 2, borderStyle: 'dashed', borderColor: color.border.subtle, paddingTop: spacing[4], alignItems: 'center' },
  qrLabel:   { marginBottom: spacing[3], fontSize: 10 },
  validatedBlock: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], borderTopWidth: 2, borderStyle: 'dashed', borderColor: color.border.subtle, paddingTop: spacing[4], justifyContent: 'center' },
  validatedText: { fontWeight: '600' },
})
