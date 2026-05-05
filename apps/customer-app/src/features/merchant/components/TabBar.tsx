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
      {/* Round 5 §10: gradient bottom-stop shifted from warm
          off-white (#F5F1E9) to neutral grey (#F5F5F5) per user
          direction "not quite white yet, it's quite warm — want
          white that goes with the body". Same ~4% lightness delta
          as the §8 / §9 versions, but fully neutral. Reads as
          white-matching-the-body with a soft architectural
          "indent" at the bar's bottom edge.
          No blur — flat gradient only, clear of the
          glassmorphism-as-default ban. */}
      <LinearGradient
        colors={['#FFFFFF', '#F5F5F5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
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
  // Round 5 §10 (impeccable polish): gradient bottom shifted to
  // neutral grey (was warm off-white). Bar now reads as
  // white-matching-the-body with a soft architectural indent at
  // the bottom edge — no warmth.
  //
  //   IDENTITY  #FFF9F5
  //   TAB BAR   #FFFFFF → #F5F5F5  (subtle neutral gradient)
  //   BODY      #FFFFFF
  //   CARDS     #FFFFFF + card shadow
  //
  // Shadow opacity bumped back up 0.05 → 0.07: white-on-white
  // (bar/body) has zero tonal contrast, so shadow needs to carry
  // more boundary work than the §8 cream version. Still well
  // below the original 0.10 — softer than §7, sharper than §8.
  //
  // Fallback bg `#FFFFFF` for Android in case LinearGradient fails
  // to render. Border-bottom 0.05 alpha kept for a crisp edge
  // beneath the gradient.
  //
  // Sticky-header text sizes verified against the rest of the
  // surface (14pt labels sit between content card titles 16pt and
  // meta row 13pt — appropriate "navigation chrome" tier).
  container: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
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
  // Round 5 §5 (impeccable polish): inactive count badge drops the
  // grey wash bg (visual noise that cluttered the inactive tabs);
  // active count keeps its brand-red 12% bg as the differentiator.
  // The active label pill carries the primary "you are here" cue,
  // and the count colour shift (active #E20C04 / inactive #4B5563)
  // does the rest.
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
    backgroundColor: 'transparent',
  },
  countText: {
    fontSize: 11,
    fontWeight: '800',
  },
  // Round 5 §5 (impeccable polish): indicator refined from a
  // bottom-edge strip (left:24% right:24% bottom:0 height:2) to a
  // narrower, slightly raised brand-red underline. Pairs with the
  // pill bg as a subtle secondary anchor rather than a competing
  // active cue. testID `tab-active-indicator` retained — covered
  // by tab-bar-pulse.test.tsx structural contract.
  indicatorWrap: {
    position: 'absolute',
    bottom: 4,
    left: '32%',
    right: '32%',
    height: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  indicatorGradient: {
    flex: 1,
  },
})
