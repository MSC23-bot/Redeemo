import React from 'react'
import { View, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

/**
 * 5-stop brand gradient matching VoucherDetailScreen depth technique.
 * Spec: linear-gradient(145deg, #B80E08 0%, #D10A03 28%, #E20C04 52%, #CC3500 78%, #C83200 100%)
 * Plus dark vignette + radial scatter depth overlays.
 */
export function SavingsHeroGradient({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={style}>
      {/* Primary 5-stop gradient */}
      <LinearGradient
        colors={['#B80E08', '#D10A03', '#E20C04', '#CC3500', '#C83200']}
        locations={[0, 0.28, 0.52, 0.78, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Dark vignette overlay for depth */}
      <LinearGradient
        colors={['rgba(0,0,0,0.18)', 'transparent', 'rgba(0,0,0,0.2)']}
        locations={[0, 0.4, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  )
}
