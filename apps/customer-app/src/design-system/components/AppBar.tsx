import React from 'react'
import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
// eslint-disable-next-line tokens/no-raw-tokens
import { ChevronLeft } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../Text'
import { color, layout, spacing } from '../tokens'

type Props = {
  title?: string
  right?: React.ReactNode
  showBack?: boolean
}

export function AppBar({ title, right, showBack = true }: Props) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: color.surface.page, borderBottomWidth: 1, borderBottomColor: color.border.subtle }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: layout.appBarHeight, paddingHorizontal: spacing[4] }}>
        {showBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={8} style={{ padding: spacing[2] }}>
            <ChevronLeft size={24} color={color.navy} />
          </Pressable>
        ) : <View style={{ width: 40 }} />}
        <View style={{ flex: 1, alignItems: 'center' }}>
          {title && <Text variant="heading.sm">{title}</Text>}
        </View>
        <View style={{ minWidth: 40, alignItems: 'flex-end' }}>{right}</View>
      </View>
    </View>
  )
}
