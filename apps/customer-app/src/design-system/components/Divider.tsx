import React from 'react'
import { View } from 'react-native'
import { color, spacing } from '../tokens'

export function Divider({ vertical = false }: { vertical?: boolean }) {
  return <View style={vertical ? { width: 1, backgroundColor: color.border.subtle, marginHorizontal: spacing[2] } : { height: 1, backgroundColor: color.border.subtle, marginVertical: spacing[2] }} />
}
