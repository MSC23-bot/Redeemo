/**
 * Phase 3C.1g M2.5 — `<FavouritesEmptyState>`.
 *
 * Spec §8.4 + §9.4 — lightweight icon, per-tab copy + CTA.
 */

import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/design-system/Text'
import { color, radius, spacing } from '@/design-system/tokens'
import { Heart } from '@/design-system/icons'
import type { FavouritesTab } from './FavouritesHeader'

interface Props {
  tab:    FavouritesTab
  onCta:  () => void
  testID?: string
}

const COPY: Record<FavouritesTab, { headline: string; body: string; cta: string }> = {
  places: {
    headline: 'No places saved yet',
    body:     'Save places you want to visit by tapping the heart on any merchant.',
    cta:      'Discover places',
  },
  vouchers: {
    headline: 'No vouchers saved yet',
    body:     'Save vouchers you want to redeem later by tapping the heart on any voucher.',
    cta:      'Browse vouchers',
  },
}

export function FavouritesEmptyState({ tab, onCta, testID }: Props): React.ReactElement {
  const copy = COPY[tab]
  return (
    <View style={styles.container} testID={testID ?? `favourites-empty-${tab}`}>
      <View style={styles.iconWrap}>
        <Heart size={40} color={color.brandRose} strokeWidth={1.6} />
      </View>
      <Text variant="display.sm" style={styles.headline}>{copy.headline}</Text>
      <Text variant="body.md" style={styles.body}>{copy.body}</Text>
      <Pressable
        onPress={onCta}
        style={styles.cta}
        accessibilityRole="button"
        accessibilityLabel={copy.cta}
      >
        <Text variant="heading.sm" style={styles.ctaLabel}>{copy.cta}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems:        'center',
    paddingVertical:   spacing[8],
    paddingHorizontal: spacing[5],
    gap:               spacing[3],
  },
  iconWrap: {
    width:           80,
    height:          80,
    borderRadius:    40,
    backgroundColor: color.surface.tint,
    alignItems:      'center',
    justifyContent:  'center',
  },
  headline: {
    color:     color.text.primary,
    textAlign: 'center',
  },
  body: {
    color:     color.text.secondary,
    textAlign: 'center',
  },
  cta: {
    marginTop:         spacing[2],
    paddingVertical:   spacing[3],
    paddingHorizontal: spacing[5],
    backgroundColor:   color.brandRose,
    borderRadius:      radius.md,
  },
  ctaLabel: {
    color: '#FFFFFF',
  },
})
