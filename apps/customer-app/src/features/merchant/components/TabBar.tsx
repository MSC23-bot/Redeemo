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

// Visual correction round 3 §B4 (post-PR-#35 QA): active tab now gets a
// brand-red 5% pill behind its label as the primary "active" cue. The
// indicator strip below is retained (slimmer) so the tab-bar's bottom
// edge still announces the active column when scrolling stickies into
// view, but the pill carries the moment-to-moment "you are here" signal.
//
// Inactive label colour deepened from `#9CA3AF` → `#6B7280` so labels
// read clearly at small sizes against the warm cream page; borders
// strengthened from 0.06 → 0.10 alpha so the bar's edges are findable
// without being heavy.
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
            <View style={[styles.labelRow, isActive && styles.labelRowActive]}>
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
                    { color: isActive ? color.brandRose : '#6B7280' },
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
    // Round 3 §B4: stronger borders (0.06 → 0.10 alpha) so the tab-bar
    // edge is findable against the cream page without being chunky.
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.10)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.10)',
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
    paddingTop: 10,
    paddingBottom: 10,
    position: 'relative',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  // Round 3 §B4: active tab gets a brand-red 5% pill background.
  // Replaces the previous "indicator only" cue — pill is the primary
  // active state, indicator is the secondary anchor at the bottom edge.
  labelRowActive: {
    backgroundColor: 'rgba(226,12,4,0.05)',
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
    // Round 3 §B4: deeper inactive label so the tab row reads at glance.
    color: '#6B7280',
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
    backgroundColor: 'rgba(226,12,4,0.12)',
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
    left: '24%',
    right: '24%',
    height: 2,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    overflow: 'hidden',
  },
  indicatorGradient: {
    flex: 1,
  },
})
