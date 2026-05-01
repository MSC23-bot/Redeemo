import React from 'react'
import { View, StyleSheet } from 'react-native'
import Svg, { Path, Circle } from 'react-native-svg'
import { Text } from '@/design-system/Text'
import { scale, ms } from '@/design-system/scale'

function AlertIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#E20C04" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Path d="M12 8v4" />
      <Path d="M12 16h.01" />
    </Svg>
  )
}

export function InlineError({ message, testID }: { message: string; testID?: string }) {
  return (
    <View
      style={styles.container}
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.iconWrap}><AlertIcon /></View>
      <Text style={styles.text}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(226, 12, 4, 0.07)',
    borderRadius: scale(12),
    paddingHorizontal: ms(12),
    paddingVertical: ms(10),
  },
  iconWrap: {
    marginRight: ms(8),
    marginTop: ms(2),
  },
  text: {
    flex: 1,
    fontSize: ms(13),
    lineHeight: ms(18),
    fontFamily: 'Lato-Regular',
    color: '#E20C04',
  },
})
