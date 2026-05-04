import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'

type Props = {
  merchantName: string
  logoUrl: string | null
}

// Visual correction round 3 §A1 (post-PR-#35 QA): logo + name now
// composed as a horizontal flex row. The logo previously sat
// absolute-positioned inside HeroSection (overlapping the hero/headline
// boundary) while the name lived alone in MerchantHeadline with a hard
// `paddingLeft: 92` to clear it. That worked for long names but left
// short names visually floating in the right-of-logo gutter.
//
// Now: logo is a flex-row sibling of the name. The row uses
// `marginTop: -28` so the logo still overlaps the hero by half its
// height (preserving the hero/identity bridge), and the name occupies
// `flex: 1` next to it — so a short name sits snug to the logo, and a
// long name wraps inside the available width (numberOfLines=2).
export function MerchantHeadline({ merchantName, logoUrl }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.logoBox}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.logoImage} contentFit="cover" />
        ) : (
          <View style={styles.logoPlaceholder} />
        )}
      </View>
      <View style={styles.nameWrap}>
        <Text variant="display.sm" style={styles.name} numberOfLines={2} ellipsizeMode="tail">
          {merchantName}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    marginTop: -28,        // overlap hero by half the logo height
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  logoBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FFF',
    backgroundColor: '#FFF',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  logoImage: {
    width: 52,
    height: 52,
    borderRadius: 12,
  },
  logoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: color.surface.subtle,
  },
  nameWrap: {
    flex: 1,
    paddingBottom: 2,      // align name baseline with logo's vertical centre
  },
  name: {
    color: '#0F0E1F',
    fontWeight: '800',
    letterSpacing: -0.3,
  },
})
