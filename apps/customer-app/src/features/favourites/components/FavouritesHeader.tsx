/**
 * Phase 3C.1g M2.5 — Favourites tab header with Merchants / Vouchers
 * switcher + counts.
 *
 * Device-QA R1 (2026-05-30): user-facing copy reads "Merchants · N"
 * (was "Places · N" per spec §8).  Internal `'places'` tab
 * discriminator unchanged for URL / cache / test stability.
 */

import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/design-system/Text'
import { color, spacing } from '@/design-system/tokens'

export type FavouritesTab = 'places' | 'vouchers'

interface Props {
  activeTab:    FavouritesTab
  placesCount:  number
  vouchersCount: number
  onTabChange:  (tab: FavouritesTab) => void
}

export function FavouritesHeader({ activeTab, placesCount, vouchersCount, onTabChange }: Props): React.ReactElement {
  return (
    <View style={styles.container} testID="favourites-header">
      <Text variant="display.sm" style={styles.title}>Favourites</Text>
      <View style={styles.tabs}>
        <TabButton
          label="Merchants"
          count={placesCount}
          active={activeTab === 'places'}
          onPress={() => onTabChange('places')}
          testID="favourites-tab-places"
        />
        <TabButton
          label="Vouchers"
          count={vouchersCount}
          active={activeTab === 'vouchers'}
          onPress={() => onTabChange('vouchers')}
          testID="favourites-tab-vouchers"
        />
      </View>
    </View>
  )
}

function TabButton({
  label, count, active, onPress, testID,
}: {
  label: string
  count: number
  active: boolean
  onPress: () => void
  testID: string
}): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} · ${count}`}
      testID={testID}
    >
      <Text variant="heading.sm" style={active ? styles.tabLabelActive : styles.tabLabel}>
        {label} · {count}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing[4],
    paddingTop:        spacing[3],
    paddingBottom:     spacing[3],
    backgroundColor:   color.cream,
  },
  title: {
    color:        color.text.primary,
    marginBottom: spacing[3],
  },
  tabs: {
    flexDirection: 'row',
    gap:           spacing[2],
  },
  tab: {
    flex:              1,
    paddingVertical:   spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius:      999,
    backgroundColor:   color.surface.tint,
    alignItems:        'center',
  },
  tabActive: {
    backgroundColor: color.brandRose,
  },
  tabLabel: {
    color: color.text.primary,
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
})
