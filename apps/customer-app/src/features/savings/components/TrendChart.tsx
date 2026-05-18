import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import { spacing, radius, elevation, layout } from '@/design-system/tokens'
import type { MonthBreakdown } from '@/lib/api/savings'
import { SavingsCardTitleRow } from './TopBranches'

// §Savings Rebaseline spec §Insight Section / Card 1 "6-Month Trend".
// Always 6 bars (trailing 6 months including current); each bar is a
// 44pt touch target. £0 months render as a small visible stub (still
// tappable — triggers the £0 empty-state insight).  Highlighted bar
// (selected month if set, else current month) reads in brand-rose
// with a dot above; other bars in muted brand-rose tints.
//
// §Savings device-QA round-2 fixup 2026-05-18 — bars STILL invisible
// after round-1 palette/animation fix.  Two root causes:
//
//   1. PressableScale outer-wrapper bug: PressableScale renders
//      <Animated.View style={barColumn}><Pressable>…</Pressable>
//      </Animated.View>.  The `style` lands on the outer Animated
//      View, NOT the inner Pressable that contains the bars.  The
//      inner Pressable has NO width.  barTrack inside used
//      `width: '100%'` — 100% of an undefined parent width is 0.
//      The bar collapsed to 0 width and rendered invisible.
//
//   2. Per owner direction this round: bars MUST be brand-red, not
//      navy/grey.  Round-1 swapped to navy tints; reverted.
//
// Both fixed by:
//   - Swap PressableScale → bare Pressable (the chart bar doesn't
//     need a press-scale animation; the dot indicator is the
//     selection affordance).  The `barColumn` style now lands
//     directly on the Pressable, giving the children a real width
//     constraint.
//   - Explicit pixel widths on barTrack + bar (28pt) — no more
//     percentage-of-undefined chain.
//   - Palette: highlighted solid brand-rose; saving>0 brand-rose at
//     22% alpha; £0 stub at 10% alpha.

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CHART_HEIGHT   = 120
const MIN_BAR_HEIGHT = 6
const BAR_WIDTH      = 28

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
  onPress,
}: {
  month: string
  saving: number
  maxSaving: number
  // §Savings fixup 2026-05-17: parent decides which bar is "active"
  // (selected wins over current).  Bar no longer composes its own
  // highlight from `isSelected || isCurrent` — that produced two
  // competing red treatments when a user selected a past month.
  isHighlighted: boolean
  onPress: () => void
}) {
  const barHeight =
    maxSaving > 0 ? Math.max(MIN_BAR_HEIGHT, (saving / maxSaving) * CHART_HEIGHT) : MIN_BAR_HEIGHT

  // §Savings device-QA round-2 fixup 2026-05-18 — back to brand-red
  // per owner direction.  Highlighted bar solid; active months at
  // 22% alpha; £0 stubs at 10% alpha (visible but quiet).
  const barColor = isHighlighted
    ? '#E20C04'                       // brand-rose — focal bar
    : saving > 0
    ? 'rgba(226,12,4,0.22)'           // brand-rose at 22% — active
    : 'rgba(226,12,4,0.10)'           // brand-rose at 10% — £0 stub
  const label = monthLabel(month)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, £${saving.toFixed(2)} saved`}
      accessibilityState={{ selected: isHighlighted }}
      style={styles.barColumn}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      testID={`savings-trend-bar-${month}`}
    >
      <View style={[styles.dot, { opacity: isHighlighted ? 1 : 0 }]} />
      <View style={styles.barTrack}>
        <View
          style={[
            styles.bar,
            { height: barHeight, backgroundColor: barColor },
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
    </Pressable>
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
    ? `${monthLabel(displayMonths[0]!.month)} to ${monthLabel(displayMonths[displayMonths.length - 1]!.month)}`
    : displayMonths.length === 1
    ? monthLabel(displayMonths[0]!.month)
    : undefined

  return (
    <View style={styles.card} testID="savings-trend-chart">
      <SavingsCardTitleRow title="6-Month Trend" context={rangeLabel} />
      <View style={styles.chartRow}>
        {displayMonths.map((m) => {
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
              onPress={() => onMonthSelect(m.month)}
            />
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // §Savings impeccable 5/6 — tokenised: 20 → radius.lg (16).
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
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
  // §Savings device-QA round-2 fixup 2026-05-18 — explicit pixel
  // dimensions everywhere.  The previous `width: '100%'` chain
  // (bar → barTrack → Pressable → Animated.View) collapsed to 0
  // when PressableScale's outer-wrapper bug left the inner Pressable
  // without a concrete width.  Solid pixels avoid the percentage-of-
  // undefined trap entirely.
  barTrack: {
    width:          BAR_WIDTH,
    height:         CHART_HEIGHT,
    justifyContent: 'flex-end',
  },
  bar: {
    width:        BAR_WIDTH,
    borderRadius: radius.xs,
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
