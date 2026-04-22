import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Crown, X } from 'lucide-react-native'
import { Text } from '@/design-system/Text'

type Props = {
  onSubscribe: () => void
  onDismiss: () => void
}

export function NudgeBanner({ onSubscribe, onDismiss }: Props) {
  return (
    <Pressable onPress={onSubscribe} style={styles.wrapper} accessibilityRole="button">
      <LinearGradient
        colors={['rgba(226,12,4,0.06)', 'rgba(232,74,0,0.04)']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={styles.container}
      >
        <LinearGradient
          colors={['#E20C04', '#E84A00']}
          style={styles.crownCircle}
        >
          <Crown size={14} color="#FFFFFF" />
        </LinearGradient>

        <Text style={styles.text}>
          <Text style={styles.bold}>Subscribe to redeem</Text>
          {' — Unlock all your favourite vouchers from £6.99/mo'}
        </Text>

        <Pressable
          onPress={(e) => { e.stopPropagation(); onDismiss() }}
          hitSlop={12}
          accessibilityLabel="Dismiss"
          style={styles.dismiss}
        >
          <X size={14} color="rgba(156,163,175,0.6)" />
        </Pressable>
      </LinearGradient>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrapper: { marginHorizontal: 12, marginTop: 10 },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226,12,4,0.10)',
  },
  crownCircle: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  text: { flex: 1, fontSize: 10.5, color: '#4B5563', lineHeight: 15 },
  bold: { fontFamily: 'Lato-Bold', color: '#010C35' },
  dismiss: { padding: 4 },
})
