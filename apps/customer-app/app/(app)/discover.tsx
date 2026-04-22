import { View, Text } from 'react-native'
import { color, typography } from '@/design-system'

export default function DiscoverScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: color.surface.page, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: color.text.secondary, ...typography.body }}>Coming soon</Text>
    </View>
  )
}
