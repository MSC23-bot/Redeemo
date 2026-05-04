import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'

type Props = {
  merchantName: string
}

// Section 1 of the visual correction round (post-PR-#35 QA): MerchantHeadline
// is now responsible only for the merchant name. The brand-red branch line
// moved into the new BranchContextBand component, where it gets the band's
// signature tinted treatment + coordinated transition motion.
//
// The headline strip's `paddingLeft` accounts for the HeroSection's logo,
// which is positioned absolute with `bottom: -28, left: spacing[4]` (16pt)
// at 56pt × 56pt. Logo right edge is therefore at ~76pt; we add 16pt gap
// = 92pt. The merchant name sits in the y-range that aligns with the
// logo's bottom-half, producing the "logo + name" iconography.
export function MerchantHeadline({ merchantName }: Props) {
  return (
    <View style={styles.root}>
      <Text variant="display.sm" style={styles.name} numberOfLines={2} ellipsizeMode="tail">
        {merchantName}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    paddingTop: 14,
    paddingLeft: 92,
    paddingRight: 16,
    paddingBottom: 4,
  },
  name: {
    color: '#0F0E1F',
    fontWeight: '800',
    letterSpacing: -0.3,
  },
})
