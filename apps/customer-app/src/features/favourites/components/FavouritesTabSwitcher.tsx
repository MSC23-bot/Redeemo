import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { lightHaptic } from '@/design-system/haptics'
import type { TabId } from './FavouritesHeader'

type Props = {
  activeTab: TabId
  onTabPress: (tab: TabId) => void
  merchantCount: number
  voucherCount: number
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'merchants', label: 'Merchants' },
  { id: 'vouchers',  label: 'Vouchers'  },
]

export function FavouritesTabSwitcher({ activeTab, onTabPress, merchantCount, voucherCount }: Props) {
  const counts: Record<TabId, number> = { merchants: merchantCount, vouchers: voucherCount }
  const activeIndex = TABS.findIndex(t => t.id === activeTab)
  const indicatorX = useSharedValue(activeIndex)

  const handlePress = (tab: TabId) => {
    lightHaptic()
    const idx = TABS.findIndex(t => t.id === tab)
    indicatorX.value = withSpring(idx, { damping: 20, stiffness: 200 })
    onTabPress(tab)
  }

  const indicatorStyle = useAnimatedStyle(() => ({
    left: `${indicatorX.value * 50 + 50 * 0.22}%` as any,
  }))

  return (
    <View style={styles.container}>
      {TABS.map(tab => {
        const isActive = tab.id === activeTab
        const count = counts[tab.id]
        return (
          <Pressable
            key={tab.id}
            onPress={() => handlePress(tab.id)}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab.label}, ${count} items`}
          >
            <View style={styles.labelRow}>
              <Text style={[styles.label, isActive ? styles.labelActive : styles.labelInactive]}>
                {tab.label}
              </Text>
              <View style={[styles.countBadge, isActive ? styles.countBadgeActive : styles.countBadgeInactive]}>
                <Text style={[styles.countText, { color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.4)' }]}>
                  {count}
                </Text>
              </View>
            </View>
          </Pressable>
        )
      })}
      <Animated.View style={[styles.indicator, indicatorStyle]} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
    position: 'relative',
    backgroundColor: 'transparent',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 12,
    letterSpacing: -0.1,
  },
  labelActive: {
    fontFamily: 'Lato-Bold',
    color: '#FFFFFF',
    fontWeight: '700',
  },
  labelInactive: {
    fontFamily: 'Lato-SemiBold',
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '600',
  },
  countBadge: {
    minWidth: 16,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  countBadgeInactive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  countText: {
    fontSize: 9,
    fontFamily: 'Lato-Bold',
    fontWeight: '800',
  },
  indicator: {
    position: 'absolute',
    bottom: -1,
    width: '56%',
    height: 3,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
})
