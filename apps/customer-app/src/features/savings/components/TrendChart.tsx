import React, { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { spacing, radius, elevation, layout } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'
import type { MonthBreakdown } from '@/lib/api/savings'
import { SavingsCardTitleRow } from './TopBranches'

// §Savings Rebaseline spec §Insight Section / Card 1 "6-Month Trend".
// Always 6 bars (trailing 6 months including current); each bar is a
// 44pt touch target. £0 months render as a 3pt stub (still tappable —
// triggers the £0 empty-state insight). Current month bar full red +
// dot indicator above; others muted.  Bars animate scaleY 0→1 from
// bottom on mount with spring easing; 75ms stagger per bar starting
// at 650ms.  Reduce-motion snaps to 1.

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CHART_HEIGHT = 120
const MIN_BAR_HEIGHT = 3
const BAR_STAGGER = 75

function monthLabel(yyyymm: string): string {
  const monStr = yyyymm.split('-')[1] ?? '1'
  const m = parseInt(monStr, 10)
  return MONTH_LABELS[m - 1] ?? ''
}

function Bar({
  month,
  saving,
  maxSaving,
  isHighlighted,
  index,
  onPress,
}: {
  month: string
  saving: number
  maxSaving: number
  // §Savings fixup 2026-05-17: parent now decides which bar is
  // "active" (selected wins over current).  Bar no longer composes
  // its own highlight from `isSelected || isCurrent` — that produced
  // two competing red treatments when a user selected a past month.
  isHighlighted: boolean
  index: number
  onPress: () => void
}) {
  const scale = useMotionScale()
  const scaleY = useSharedValue(0)
  const barHeight =
    maxSaving > 0 ? Math.max(MIN_BAR_HEIGHT, (saving / maxSaving) * CHART_HEIGHT) : MIN_BAR_HEIGHT

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

  const barColor = isHighlighted
    ? '#E20C04'
    : saving > 0
    ? 'rgba(226,12,4,0.18)'
    : 'rgba(226,12,4,0.10)'
  const label = monthLabel(month)

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, £${saving.toFixed(2)} saved`}
      accessibilityState={{ selected: isHighlighted }}
      hapticStyle="none"
      style={styles.barColumn}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      testID={`savings-trend-bar-${month}`}
    >
      <View style={[styles.dot, { opacity: isHighlighted ? 1 : 0 }]} />
      <View style={[styles.barTrack, { height: CHART_HEIGHT }]}>
        <Animated.View
          style={[
            styles.bar,
            { height: barHeight, backgroundColor: barColor },
            animStyle,
          ]}
        />
      </View>
      <Text
        variant="label.md"
        style={[styles.monthLabel, isHighlighted && styles.monthLabelActive]}
        meta
      >
        {label}
      </Text>
    </PressableScale>
  )
}

type Props = {
  // 6-item array, most-recent first (descending) — same as
  // `summary.monthlyBreakdown.slice(0, 6)`.  Component reverses
  // internally so display reads oldest → newest, left → right.
  months: MonthBreakdown[]
  selectedMonth: string | null
  currentMonth: string
  onMonthSelect: (month: string) => void
}

export function TrendChart({ months, selectedMonth, currentMonth, onMonthSelect }: Props) {
  const maxSaving = Math.max(...months.map((m) => m.saving), 1)
  const displayMonths = [...months].reverse()

  // §Savings fixup 2026-05-17 — locked highlight rule:
  //   selectedMonth set  → the selected bar wins, current month gets
  //                        no special treatment
  //   selectedMonth null → the current month bar is highlighted
  // Previously: `isSelected || (isCurrent && !isSelected)` — under a
  // selection both bars got the active red treatment, making it
  // ambiguous which month the insight cards were showing.
  const hasSelection = selectedMonth !== null

  // §Savings fidelity fixup-3 2026-05-17: brainstorm card-title
  // context label shows the date range (e.g. "Nov — Apr") so the
  // user knows at a glance which 6-month window the chart spans.
  const rangeLabel = displayMonths.length >= 2
    ? `${monthLabel(displayMonths[0]!.month)} — ${monthLabel(displayMonths[displayMonths.length - 1]!.month)}`
    : displayMonths.length === 1
    ? monthLabel(displayMonths[0]!.month)
    : undefined

  return (
    <View style={styles.card} testID="savings-trend-chart">
      <SavingsCardTitleRow title="6-Month Trend" context={rangeLabel} />
      <View style={styles.chartRow}>
        {displayMonths.map((m, i) => {
          const isHighlighted = hasSelection
            ? selectedMonth === m.month
            : m.month === currentMonth
          return (
            <Bar
              key={m.month}
              month={m.month}
              saving={m.saving}
              maxSaving={maxSaving}
              isHighlighted={isHighlighted}
              index={i}
              onPress={() => onMonthSelect(m.month)}
            />
          )
        })}
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
  // Kept for backward compat / unrelated references; the title now
  // renders via the shared `SavingsCardTitleRow` helper.
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
