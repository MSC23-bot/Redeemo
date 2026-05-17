import React from 'react'
import { View, StyleSheet, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

// §Savings Rebaseline spec §State 3 "Hero header":
// 5-stop brand gradient + dark vignette overlay matching the
// VoucherDetailScreen depth technique.  Reused as the chrome for all
// three states (free / subscriber-empty / populated).
export function SavingsHeroGradient({
  children,
  style,
}: {
  children: React.ReactNode
  style?: ViewStyle | ViewStyle[]
}) {
  return (
    <View style={style}>
      <LinearGradient
        colors={['#B80E08', '#D10A03', '#E20C04', '#CC3500', '#C83200']}
        locations={[0, 0.28, 0.52, 0.78, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
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
