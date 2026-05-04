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
                numberOfLines={1}
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
                    // Round 4 §5: inactive count text matches the
                    // darker inactive label (#4B5563) for consistent
                    // tab-row legibility.
                    { color: isActive ? color.brandRose : '#4B5563' },
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
  // Round 4 §7: tab bar is white. Header treatment now carried
  // entirely by elevation — stronger downward drop shadow + faint
  // bottom border separator so the user sees a clear "this is the
  // header, content scrolls under it" boundary even when both
  // surfaces share the same white tone.
  //
  //   IDENTITY  #FFF9F5  (warm cream — top zone)
  //   TAB BAR   #FFFFFF  (white + header shadow)
  //   BODY      #FFFFFF  (white)
  //   CARDS     #FFFFFF  (white + card shadow)
  container: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 5,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 12,
    position: 'relative',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  // Round 3 §B4: active tab gets a brand-red 5% pill background.
  labelRowActive: {
    backgroundColor: 'rgba(226,12,4,0.05)',
  },
  // Round 4 §6: labels bumped 13 → 14pt — round 4 §5's 13pt still
  // read as too small in the bigger header tab bar.
  label: {
    fontSize: 14,
    letterSpacing: -0.1,
  },
  labelActive: {
    color: color.navy,
    fontWeight: '700',
  },
  // Round 4 §5: inactive label colour deepened from `#6B7280` →
  // `#4B5563` per direction "needs to be a bit darker than what it
  // is right now, but obviously not too dark because it needs to be
  // different when it's selected".
  labelInactive: {
    color: '#4B5563',
    fontWeight: '600',
  },
  countBadge: {
    minWidth: 19,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countActive: {
    backgroundColor: 'rgba(226,12,4,0.12)',
  },
  countInactive: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  countText: {
    fontSize: 11,
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
