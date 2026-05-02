import React from 'react'
import { View, Image, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'

type Props = {
  businessName: string
  bannerUrl: string | null
  logoUrl: string | null
}

export function AllBranchesUnavailable({ businessName, bannerUrl, logoUrl }: Props) {
  return (
    <View style={styles.root}>
      {bannerUrl ? <Image source={{ uri: bannerUrl }} style={styles.banner} /> : null}
      {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.logo} /> : null}
      <Text variant="display.sm" style={styles.name}>{businessName}</Text>
      <Text variant="body.sm" color="secondary" style={styles.message}>
        All branches are currently unavailable.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root:    { flex: 1, alignItems: 'center', backgroundColor: '#FFF' },
  banner:  { width: '100%', height: 180 },
  logo:    { width: 80, height: 80, borderRadius: 40, marginTop: -40 },
  name:    { marginTop: 16, fontSize: 22, fontWeight: '800', color: '#010C35' },
  message: { marginTop: 8, marginHorizontal: 32, textAlign: 'center' },
})
