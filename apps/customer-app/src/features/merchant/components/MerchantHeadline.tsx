import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'

type Props = {
  merchantName: string
  branchLine:   string | null
}

export function MerchantHeadline({ merchantName, branchLine }: Props) {
  return (
    <View style={styles.root}>
      <Text variant="display.lg" style={styles.name} numberOfLines={1} ellipsizeMode="tail">
        {merchantName}
      </Text>
      {branchLine ? (
        <Text
          variant="label.lg"
          style={styles.branchLine}
          numberOfLines={1}
          ellipsizeMode="tail"
          testID="merchant-branch-line"
          accessibilityLiveRegion="polite"
        >
          {branchLine}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root:       { gap: 2 },
  name:       { color: '#010C35', fontWeight: '800' },
  branchLine: { color: '#E20C04', fontWeight: '700' },
})
