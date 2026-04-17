import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { MapPin, ChevronRight } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, radius, elevation } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

type Props = {
  merchantId: string
  businessName: string
  logoUrl: string | null
  category: string | null
  branchName: string | null
  distance: string | null
  isRedeemed?: boolean
}

export function MerchantRow({ merchantId, businessName, logoUrl, category, branchName, distance, isRedeemed }: Props) {
  const router = useRouter()

  return (
    <Pressable
      onPress={() => { lightHaptic(); router.push(`/merchant/${merchantId}` as never) }}
      accessibilityRole="button"
      accessibilityLabel={`View ${businessName} profile`}
      style={[styles.container, isRedeemed && { opacity: 0.75 }]}
    >
      <View style={styles.logo}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.logoImage} contentFit="cover" />
        ) : (
          <View style={[styles.logoImage, { backgroundColor: color.surface.subtle }]} />
        )}
      </View>
      <View style={styles.info}>
        <Text variant="label.lg" color="primary" style={{ fontWeight: '800' }}>{businessName}</Text>
        <View style={styles.metaRow}>
          <MapPin size={12} color={color.brandRose} />
          <Text variant="label.md" color="secondary">
            {[category, branchName, distance].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      <ChevronRight size={18} color={color.text.tertiary} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    marginHorizontal: 14,
    marginTop: spacing[4],
    backgroundColor: '#FFF',
    borderRadius: radius.lg,
    ...elevation.sm,
  },
  logo: { marginRight: spacing[3] },
  logoImage: { width: 44, height: 44, borderRadius: radius.md },
  info: { flex: 1, gap: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
})
