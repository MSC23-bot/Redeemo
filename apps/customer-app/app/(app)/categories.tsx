import React from 'react'
import { View } from 'react-native'
import { Text } from '@/design-system'

export default function CategoriesRoute() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="body.md">All Categories</Text>
    </View>
  )
}
