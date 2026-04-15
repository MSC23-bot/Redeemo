import React from 'react'
import { View, ViewProps } from 'react-native'
import { color, radius, spacing, elevation } from '../tokens'

export function Card({ children, style, ...rest }: ViewProps & { children: React.ReactNode }) {
  return (
    <View
      style={[
        { padding: spacing[4], backgroundColor: color.surface.raised, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border.subtle },
        elevation.sm,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  )
}
