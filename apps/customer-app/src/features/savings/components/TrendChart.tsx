import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { spacing, radius, elevation, layout } from '@/design-system/tokens'
import type { MonthBreakdown } from '@/lib/api/savings'
import { SavingsCardTitleRow } from './TopBranches'

// §Savings Rebaseline spec §Insight Section / Card 1 "6-Month Trend".
// Always 6 bars (trailing 6 months including current); each bar is a
// 44pt touch target. £0 months render as a small visible stub (still
// tappable — triggers the £0 empty-state insight).  Highlighted bar
// (selected month if set, else current month) reads in brand-rose
// with a dot above; other bars use solid grey tokens.
//
// §Savings device-QA fixup 2026-05-18 — bars made unconditionally
// visible.  The previous scaleY-based entrance animation
// (`useSharedValue(0)` + `withDelay+withSpring(1)` + `transformOrigin:
// 'bottom'`) shipped bars at scaleY=0 on mount.  In production on
// real devices the spring did not always tick — bars stayed
// invisible until the user interacted with the surface.  Per Emil:
// "If the purpose is just 'it looks cool' and the user will see it
// often, don't animate."  The 6-Month Trend is the user's reference
// chart — visibility is the product feature.  Entrance animation
// removed.  Bars render at their final height immediately.

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CHART_HEIGHT = 120
const MIN_BAR_HEIGHT = 6

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

  // §Savings device-QA fixup 2026-05-18 — palette uses solid grey
  // tokens for non-highlighted bars (not low-alpha navy).  The
  // previous `rgba(1,12,53,0.06)` £0-stub was invisible on white card
  // on real devices.  Solid `border.subtle` / `border.default` greys
  // read clearly while staying quiet next to the focal brand-rose.
  const barColor = isHighlighted
    ? '#E20C04'                       // brand-rose — the focal bar only
    : saving > 0
    ? '#D1D5DB'                       // border.default — active, visible
    : '#E5E7EB'                       // border.subtle — £0 stub, still visible
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
  barTrack: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '100%',
    maxWidth: 32,
  },
  // §Savings device-QA fixup 2026-05-18 — explicit width on the bar
  // so it renders reliably regardless of parent flex-stretch
  // behaviour.  transformOrigin dropped — no transform-based
  // entrance animation any more, so the property has nothing to
  // anchor.
  bar: {
    width: '100%',
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
