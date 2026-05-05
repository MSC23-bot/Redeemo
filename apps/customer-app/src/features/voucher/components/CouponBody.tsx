import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'

type Props = {
  description: string | null
  terms: string | null
  expiryDate: string | null      // ISO
}

/**
 * Bottom half of the coupon — white background, reads description +
 * terms + expiry. The white surface contrasts the type-coloured
 * CouponHeader above (separated by PerforationLine).
 */
export function CouponBody({ description, terms, expiryDate }: Props) {
  const expiryLabel = expiryDate
    ? `Expires ${new Date(expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : null

  return (
    <View style={styles.root} testID="coupon-body">
      {description ? (
        <Text variant="body.md" style={styles.description}>
          {description}
        </Text>
      ) : null}

      {terms ? (
        <View style={styles.section}>
          <Text variant="label.md" style={styles.sectionTitle}>Terms</Text>
          <Text variant="body.sm" style={styles.terms}>{terms}</Text>
        </View>
      ) : null}

      {expiryLabel ? (
        <Text variant="label.md" style={styles.expiry} testID="coupon-expiry">
          {expiryLabel}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 16,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
  },
  section: {
    gap: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#6B7280',
  },
  terms: {
    fontSize: 13,
    lineHeight: 19,
    color: '#4B5563',
  },
  expiry: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
})
