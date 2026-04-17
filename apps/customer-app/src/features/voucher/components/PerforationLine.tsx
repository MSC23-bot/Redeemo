import React from 'react'
import { View, StyleSheet } from 'react-native'
import { color } from '@/design-system/tokens'

type Props = {
  variant?: 'default' | 'small'
  testID?: string
}

const PAGE_BG = '#F5F0EB'

export function PerforationLine({ variant = 'default', testID }: Props) {
  const cutoutSize = variant === 'small' ? 24 : 28
  const containerHeight = 24

  return (
    <View testID={testID} style={[styles.container, { height: containerHeight, marginHorizontal: variant === 'small' ? 14 : 0 }]}>
      {/* Left cutout */}
      <View
        style={[
          styles.cutout,
          {
            width: cutoutSize,
            height: cutoutSize,
            borderRadius: cutoutSize / 2,
            left: -(cutoutSize / 2),
            top: -(cutoutSize / 2) + containerHeight / 2,
          },
        ]}
      />
      {/* Dashed line */}
      <View style={styles.dashedLine} />
      {/* Right cutout */}
      <View
        style={[
          styles.cutout,
          {
            width: cutoutSize,
            height: cutoutSize,
            borderRadius: cutoutSize / 2,
            right: -(cutoutSize / 2),
            top: -(cutoutSize / 2) + containerHeight / 2,
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: PAGE_BG,
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
  },
  cutout: {
    position: 'absolute',
    backgroundColor: PAGE_BG,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  dashedLine: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 11,
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,0,0,0.1)',
  },
})
