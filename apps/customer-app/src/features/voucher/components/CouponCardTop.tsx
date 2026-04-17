import React from 'react'
import { View, StyleSheet, Image } from 'react-native'
import { Clock, Check, Tag } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, radius } from '@/design-system/tokens'
import type { VoucherType } from '@/lib/api/redemption'

type Props = {
  imageUrl: string | null
  voucherType: VoucherType
  expiryDate: string | null
  terms: string | null
  isRedeemed?: boolean
}

function InfoPill({ label, variant, icon }: { label: string; variant: 'green' | 'red' | 'neutral'; icon?: React.ReactNode }) {
  const bgMap = { green: '#ECFDF5', red: '#FEF2F2', neutral: 'rgba(0,0,0,0.04)' }
  const textMap = { green: '#166534', red: '#B91C1C', neutral: color.text.secondary }

  return (
    <View style={[styles.pill, { backgroundColor: bgMap[variant] }]}>
      {icon}
      <Text variant="label.md" style={{ color: textMap[variant], fontSize: 11 }}>{label}</Text>
    </View>
  )
}

export function CouponCardTop({ imageUrl, voucherType, expiryDate, isRedeemed }: Props) {
  const hasExpiry = !!expiryDate
  const expiryLabel = hasExpiry
    ? `Expires ${new Date(expiryDate!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'Ongoing'

  return (
    <View style={[styles.container, isRedeemed && styles.dimmed]}>
      {/* Banner image */}
      <View style={styles.banner}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.bannerImage} resizeMode="cover" />
        ) : (
          <View style={[styles.bannerImage, styles.bannerPlaceholder]} />
        )}
      </View>

      {/* Info */}
      <View style={styles.details}>
        <Text variant="label.eyebrow" color="tertiary" style={styles.sectionLabel}>Voucher Details</Text>
        <View style={styles.pillRow}>
          {hasExpiry ? (
            <InfoPill label={expiryLabel} variant="red" icon={<Clock size={10} color="#B91C1C" />} />
          ) : (
            <InfoPill label="Ongoing" variant="green" icon={<Check size={10} color="#166534" />} />
          )}
          <InfoPill label={voucherType.replace(/_/g, ' ')} variant="neutral" />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    marginHorizontal: 14,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  dimmed: { opacity: 0.6 },
  banner: { height: 160, backgroundColor: color.surface.subtle },
  bannerImage: { width: '100%', height: '100%' },
  bannerPlaceholder: { backgroundColor: color.surface.subtle },
  details: { padding: spacing[4] },
  sectionLabel: { marginBottom: spacing[2], letterSpacing: 0.1 * 11 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
  },
})
