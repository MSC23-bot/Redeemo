import React from 'react'
import { View, StyleSheet } from 'react-native'
import { FileText, Check, Shield, Info } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, radius, elevation } from '@/design-system/tokens'

type Props = {
  terms: string | null
  isRedeemed?: boolean
}

const FAIR_USE_ITEMS = [
  'Present voucher before ordering',
  'For personal use only — non-transferable',
  'Merchant reserves the right to refuse',
]

export function CouponBody({ terms, isRedeemed }: Props) {
  const termsList = terms ? terms.split('\n').filter(Boolean) : []

  return (
    <View style={[styles.container, isRedeemed && styles.dimmed]}>
      {/* Terms & Conditions */}
      {termsList.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FileText size={16} color={color.brandRose} />
            <Text variant="label.lg" color="primary" style={styles.sectionTitle}>Terms & Conditions</Text>
          </View>
          {termsList.map((term, i) => (
            <View key={i} style={styles.termRow}>
              <Check size={12} color={color.savingsGreen ?? '#16A34A'} />
              <Text variant="body.sm" color="secondary" style={styles.termText}>{term}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Fair Use Policy */}
      <View style={styles.fairUseCard}>
        <View style={styles.sectionHeader}>
          <Shield size={14} color={color.brandRose} />
          <Text variant="label.md" color="primary" style={styles.fairUseTitle}>Fair Use Policy</Text>
        </View>
        {FAIR_USE_ITEMS.map((item, i) => (
          <View key={i} style={styles.fairUseRow}>
            <Info size={11} color={color.text.tertiary} />
            <Text variant="label.md" color="secondary" style={styles.fairUseText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    marginHorizontal: 14,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    padding: spacing[5],
    paddingTop: spacing[5],
    paddingBottom: spacing[6],
    ...elevation.sm,
  },
  dimmed: { opacity: 0.45 },
  section: { marginBottom: spacing[5] },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: spacing[3] },
  sectionTitle: { fontWeight: '800', fontSize: 14 },
  termRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
  },
  termText: { flex: 1, fontSize: 12, lineHeight: 19.2 },
  fairUseCard: {
    backgroundColor: color.cream,
    borderRadius: radius.lg,
    padding: spacing[4] + 2,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  fairUseTitle: { fontWeight: '800', fontSize: 12 },
  fairUseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    paddingVertical: 4,
  },
  fairUseText: { flex: 1, fontSize: 11 },
})
