import React from 'react'
import { View, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import { FavouritesTabSwitcher } from './FavouritesTabSwitcher'

export type TabId = 'merchants' | 'vouchers'

type Props = {
  activeTab: TabId
  onTabPress: (tab: TabId) => void
  merchantCount: number
  voucherCount: number
}

export function FavouritesHeader({ activeTab, onTabPress, merchantCount, voucherCount }: Props) {
  const insets = useSafeAreaInsets()
  const topPad = Math.max(insets.top, 44)

  return (
    <View>
      <LinearGradient
        colors={['#B80E08', '#D10A03', '#E20C04', '#CC3500', '#C83200']}
        locations={[0, 0.28, 0.52, 0.78, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, { paddingTop: topPad }]}
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.15)', 'transparent']}
          style={styles.vignetteTop}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.18)']}
          style={styles.vignetteBottom}
          pointerEvents="none"
        />

        <Text style={styles.title}>Favourites</Text>

        <FavouritesTabSwitcher
          activeTab={activeTab}
          onTabPress={onTabPress}
          merchantCount={merchantCount}
          voucherCount={voucherCount}
        />
      </LinearGradient>
    </View>
  )
}

const styles = StyleSheet.create({
  gradient: {
    paddingBottom: 0,
    paddingHorizontal: 16,
    position: 'relative',
  },
  vignetteTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '15%',
  },
  vignetteBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '18%',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Lato-Bold',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginTop: 8,
    marginBottom: 16,
  },
})
