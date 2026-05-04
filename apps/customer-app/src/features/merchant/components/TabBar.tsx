import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

export type TabId = 'vouchers' | 'about' | 'branches' | 'reviews'

type TabDef = {
  id: TabId
  label: string
  count?: number
}

type Props = {
  tabs: TabDef[]
  activeTab: TabId
  onTabPress: (tab: TabId) => void
}

// Visual correction round §2 (post-PR-#35 QA): tab bar anchored against
// the warm cream page surface. Previously the white tab bar washed into
// the white page. Now: top + bottom borders + soft shadow give it
// presence whether sticky or not, without heavy chrome.
//
// Active-indicator height pulse REMOVED (was decorative — Emil framework:
// "if purpose is just 'looks cool' don't animate"). The brand-red
// indicator + slim font-weight differentiation are enough to convey
// active state; pulsing on every branch switch was visual noise.
//
// Label scale calibrated: 13pt → 12pt active 600 / 11.5pt inactive 600.
// Slimmer labels give the 4-tab row breathing room on 375pt phones —
// "Other Locations (1)" no longer crowds adjacent tabs.
export function TabBar({ tabs, activeTab, onTabPress }: Props) {
  return (
    <View style={styles.container}>
      {tabs.map(tab => {
        const isActive = tab.id === activeTab
        return (
          <Pressable
            key={tab.id}
            onPress={() => { lightHaptic(); onTabPress(tab.id) }}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab.label}${tab.count !== undefined ? `, ${tab.count} items` : ''}`}
          >
            <View style={styles.labelRow}>
              <Text
                variant="label.md"
                style={[
                  styles.label,
                  isActive ? styles.labelActive : styles.labelInactive,
                ]}
              >
                {tab.label}
              </Text>
              {tab.count !== undefined && (
                <View style={[styles.countBadge, isActive ? styles.countActive : styles.countInactive]}>
                  <Text variant="label.md" style={[
                    styles.countText,
                    { color: isActive ? color.brandRose : '#9CA3AF' },
                  ]}>
                    {tab.count}
                  </Text>
                </View>
              )}
            </View>

            {isActive && (
              <View testID="tab-active-indicator" style={styles.indicatorWrap} pointerEvents="none">
                <LinearGradient
                  colors={color.brandGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.indicatorGradient}
                />
              </View>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#FCFAF7',
    // Top border anchors the tab bar against the cream page surface.
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    // Subtle shadow that strengthens when sticky-mode engages — perceived
    // as elevation rather than chrome.
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 12,
    position: 'relative',
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
    color: color.navy,
    fontWeight: '700',
  },
  labelInactive: {
    color: '#9CA3AF',
    fontWeight: '600',
  },
  countBadge: {
    minWidth: 17,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countActive: {
    backgroundColor: 'rgba(226,12,4,0.1)',
  },
  countInactive: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  countText: {
    fontSize: 10,
    fontWeight: '800',
  },
  indicatorWrap: {
    position: 'absolute',
    bottom: 0,
    left: '18%',
    right: '18%',
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    overflow: 'hidden',
  },
  indicatorGradient: {
    flex: 1,
  },
})
