import React, { useEffect } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { spacing, radius, elevation, layout } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'
import type { MonthBreakdown } from '@/lib/api/savings'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CHART_HEIGHT = 120
const MIN_BAR_HEIGHT = 3
const BAR_STAGGER = 75

function monthLabel(yyyymm: string): string {
  const m = parseInt(yyyymm.split('-')[1], 10)
  return MONTH_LABELS[m - 1]
}

function Bar({
  month,
  saving,
  maxSaving,
  isSelected,
  isCurrent,
  index,
  onPress,
}: {
  month: string
  saving: number
  maxSaving: number
  isSelected: boolean
  isCurrent: boolean
  index: number
  onPress: () => void
}) {
  const scale = useMotionScale()
  const scaleY = useSharedValue(0)
  const barHeight = maxSaving > 0 ? Math.max(MIN_BAR_HEIGHT, (saving / maxSaving) * CHART_HEIGHT) : MIN_BAR_HEIGHT

  useEffect(() => {
    if (scale === 0) {
      scaleY.value = 1
      return
    }
    scaleY.value = withDelay(
      650 + index * BAR_STAGGER,
      withSpring(1, { damping: 14, stiffness: 180 }),
    )
  }, [index, scale, scaleY])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: scaleY.value }],
  }))

  const isHighlighted = isSelected || (isCurrent && !isSelected)
  const barColor = isHighlighted ? '#E20C04' : saving > 0 ? 'rgba(226,12,4,0.18)' : 'rgba(226,12,4,0.10)'
  const label = monthLabel(month)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, £${saving.toFixed(2)} saved`}
      style={styles.barColumn}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
    >
      {/* Dot indicator for selected/current */}
      <View style={[styles.dot, { opacity: isHighlighted ? 1 : 0 }]} />

      {/* Bar */}
      <View style={[styles.barTrack, { height: CHART_HEIGHT }]}>
        <Animated.View
          style={[
            styles.bar,
            { height: barHeight, backgroundColor: barColor },
            animStyle,
          ]}
        />
      </View>

      {/* Month label */}
      <Text
        variant="label.md"
        style={[styles.monthLabel, isHighlighted && styles.monthLabelActive]}
        meta
      >
        {label}
      </Text>
    </Pressable>
  )
}

type Props = {
  months: MonthBreakdown[] // 6 items, [0]=most recent (reversed from backend's 12-item array)
  selectedMonth: string | null
  currentMonth: string
  onMonthSelect: (month: string) => void
}

export function TrendChart({ months, selectedMonth, currentMonth, onMonthSelect }: Props) {
  const maxSaving = Math.max(...months.map((m) => m.saving), 1)

  // Display oldest→newest (left→right), so reverse the array
  const displayMonths = [...months].reverse()

  return (
    <View style={styles.card}>
      <Text variant="label.eyebrow" style={styles.sectionLabel}>6-Month Trend</Text>
      <View style={styles.chartRow}>
        {displayMonths.map((m, i) => (
          <Bar
            key={m.month}
            month={m.month}
            saving={m.saving}
            maxSaving={maxSaving}
            isSelected={selectedMonth === m.month}
            isCurrent={m.month === currentMonth}
            index={i}
            onPress={() => onMonthSelect(m.month)}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: spacing[4],
    ...elevation.sm,
  },
  sectionLabel: {
    marginBottom: spacing[3],
    color: '#9CA3AF',
  },
  chartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    minWidth: layout.minTouchTarget,
    gap: spacing[1],
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E20C04',
    marginBottom: 4,
  },
  barTrack: {
    justifyContent: 'flex-end',
    width: '100%',
    maxWidth: 32,
  },
  bar: {
    borderRadius: radius.xs,
    transformOrigin: 'bottom',
  },
  monthLabel: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  monthLabelActive: {
    color: '#E20C04',
    fontFamily: 'Lato-SemiBold',
  },
})
