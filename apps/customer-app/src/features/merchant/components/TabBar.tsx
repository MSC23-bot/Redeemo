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
      {/* Round 5 §14: tab bar joins the brand cream language. Top
          stop matches the identity zone's bottom (`#FAEAE0`) for
          visual continuity — the bar feels like a continuation of
          the metadata header rather than a separate neutral chrome
          element. Bottom stop deepens to `#F5DDC8` as the architectural
          anchor before the body. All in brand H 30 hue family. */}
      {/* Round 5 §16: tab bar realigned to the BODY section per
          user direction "navbar should be more inline with its tab
          body rather than the metadata". §15 had the tab bar's
          top stop matching the metadata's bottom — making the bar
          feel like a continuation of the metadata header. Now the
          top stop matches the body (`#FFF9F5`) and only deepens
          subtly at the bottom for a soft anchor. The clean tonal
          step is now at the TOP edge of the tab bar (metadata
          cream → bar's light body-aligned tone), giving a clear
          two-section split: metadata above, tab bar + body below
          as one continuous content zone. */}
      <LinearGradient
        colors={['#FFF9F5', '#FBF1E6']}
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
            {/* Round 5 §18: active label pill (`labelRowActive`)
                removed per user direction "don't think the pill
                highlight on the navbar when a label is selected
                is required — just the underline and the number
                in tint, is enough". The active state now reads
                via the bottom underline + the brand-red tinted
                count badge alone — cleaner, less competing cues. */}
            <View style={styles.labelRow}>
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
  // Round 5 §14: tab bar bg joins the brand cream language —
  // top matches identity-zone bottom (`#FAEAE0`), bottom anchors
  // deeper at `#F5DDC8`. Reads as a continuation of the metadata
  // header rather than a separate neutral chrome island. Body
  // below is a lighter cream off-white (`#FCEFE5`) so the tab
  // bar's deeper cream anchors before the body lightens back up.
  //
  //   IDENTITY  #FFF9F5 → #FAEAE0   cream gradient
  //   TAB BAR   #FAEAE0 → #F5DDC8   deeper cream anchor band
  //   BODY      #FCEFE5             warm off-white
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
    backgroundColor: '#FFF9F5',
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
  // Round 5 §18: `labelRowActive` style retired — the active label
  // pill bg was redundant with the bottom underline + brand-red
  // tinted count badge already carrying the active cue.
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
  // Round 5 §13: count badges refined per user feedback "the
  // numbers next to Vouchers / Branches / Reviews look a bit odd".
  //
  //   • Inactive bg restored at very subtle `rgba(0,0,0,0.04)`
  //     (was transparent in §5, was 0.06 before that). The §5
  //     "drop the wash entirely" produced a floating-numeral feel
  //     where active had a pill and inactive had nothing — the
  //     visual asymmetry read as odd. Both states now have a pill
  //     container; intensity differentiation does the active /
  //     inactive work.
  //   • Text weight 800 → 700 — 800 at 11pt was chunky.
  //   • tabular-nums via fontVariant so single-digit / double-digit
  //     counts (3 vs 12) line up at consistent widths.
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
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
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
