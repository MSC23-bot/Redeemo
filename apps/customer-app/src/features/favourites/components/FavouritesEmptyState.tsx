import React, { useEffect } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Heart } from 'lucide-react-native'
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'

type Props = { onDiscover: () => void }

export function FavouritesEmptyState({ onDiscover }: Props) {
  const ty = useSharedValue(0)

  useEffect(() => {
    ty.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 1500 }),
        withTiming(0, { duration: 1500 }),
      ),
      -1,
      true,
    )
  }, [ty])

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }))

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.iconCircle, floatStyle]}>
        <Heart size={28} color="#E20C04" strokeWidth={1.5} />
      </Animated.View>
      <Text style={styles.title}>No favourites yet</Text>
      <Text style={styles.body}>
        Tap the heart on any merchant or voucher to save it here for quick access.
      </Text>
      <Pressable onPress={onDiscover} style={styles.ctaWrapper}>
        <LinearGradient
          colors={['#E20C04', '#E84A00']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.cta}
        >
          <Text style={styles.ctaText}>Discover merchants</Text>
        </LinearGradient>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300, paddingHorizontal: 32 },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(226,12,4,0.06)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 15, fontFamily: 'Lato-Bold', color: '#010C35', marginBottom: 8 },
  body: { fontSize: 12, color: '#9CA3AF', lineHeight: 18, textAlign: 'center', maxWidth: 220, marginBottom: 24 },
  ctaWrapper: { borderRadius: 100, overflow: 'hidden' },
  cta: {
    paddingHorizontal: 20, paddingVertical: 10,
    shadowColor: '#E20C04', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 14,
  },
  ctaText: { fontSize: 12, fontFamily: 'Lato-Bold', color: '#FFFFFF' },
})
