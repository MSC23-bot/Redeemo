import React from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import { ViewStyle } from 'react-native'
import { color } from '../tokens'

export function GradientBrand({ children, style }: { children?: React.ReactNode; style?: ViewStyle }) {
  return (
    <LinearGradient colors={[...color.brandGradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={style}>
      {children}
    </LinearGradient>
  )
}
