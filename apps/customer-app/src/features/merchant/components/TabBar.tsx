import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, Easing } from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import { useMotionScale } from '@/design-system/useMotionScale'

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
  /** Trigger value: change to fire the active-indicator pulse. Pass selectedBranch.id. */
  switchTrigger?: string | null
}

export function TabBar({ tabs, activeTab, onTabPress, switchTrigger }: Props) {
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
                variant="label.lg"
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

            {isActive && <ActiveTabIndicator switchTrigger={switchTrigger} />}
          </Pressable>
        )
      })}
    </View>
  )
}

function ActiveTabIndicator({ switchTrigger }: { switchTrigger?: string | null | undefined }) {
  const motionScale = useMotionScale()
  const heightSv = useSharedValue(3)
  const isFirstRender = React.useRef(true)

  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (motionScale === 0) return
    heightSv.value = withSequence(
      withTiming(4, { duration: 125, easing: Easing.out(Easing.ease) }),
      withTiming(3, { duration: 125, easing: Easing.out(Easing.ease) }),
    )
  }, [switchTrigger, motionScale, heightSv])

  const animatedStyle = useAnimatedStyle(() => ({ height: heightSv.value }))

  return (
    <Animated.View
      testID="tab-active-indicator"
      style={[styles.indicatorWrap, animatedStyle]}
      pointerEvents="none"
    >
      <LinearGradient
        colors={color.brandGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.indicatorGradient}
      />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0EBE6',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 13,
    position: 'relative',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  label: {
    fontSize: 13,
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
    minWidth: 18,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countActive: {
    backgroundColor: 'rgba(226,12,4,0.1)',
  },
  countInactive: {
    backgroundColor: '#F0EBE6',
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
