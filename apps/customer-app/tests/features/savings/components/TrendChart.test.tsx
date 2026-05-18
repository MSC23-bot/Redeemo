import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { TrendChart } from '@/features/savings/components/TrendChart'
import type { MonthBreakdown } from '@/lib/api/savings'

const months: MonthBreakdown[] = [
  { month: '2026-05', saving: 32, count: 5 },
  { month: '2026-04', saving: 0,  count: 0 },
  { month: '2026-03', saving: 18, count: 3 },
  { month: '2026-02', saving: 10, count: 2 },
  { month: '2026-01', saving: 22, count: 4 },
  { month: '2025-12', saving: 12, count: 2 },
]

describe('TrendChart', () => {
  it('renders 6 bars in the trend card', () => {
    const { getByTestId } = render(
      <TrendChart months={months} selectedMonth={null} currentMonth="2026-05" onMonthSelect={() => {}} />,
    )
    expect(getByTestId('savings-trend-chart')).toBeTruthy()
    expect(getByTestId('savings-trend-bar-2026-05')).toBeTruthy()
    expect(getByTestId('savings-trend-bar-2026-04')).toBeTruthy()
    expect(getByTestId('savings-trend-bar-2026-03')).toBeTruthy()
    expect(getByTestId('savings-trend-bar-2026-02')).toBeTruthy()
    expect(getByTestId('savings-trend-bar-2026-01')).toBeTruthy()
    expect(getByTestId('savings-trend-bar-2025-12')).toBeTruthy()
  })

  it('£0 month bar is still tappable (triggers onMonthSelect)', () => {
    const onSelect = jest.fn()
    const { getByTestId } = render(
      <TrendChart months={months} selectedMonth={null} currentMonth="2026-05" onMonthSelect={onSelect} />,
    )
    fireEvent.press(getByTestId('savings-trend-bar-2026-04'))
    expect(onSelect).toHaveBeenCalledWith('2026-04')
  })

  it('tap on current month fires onMonthSelect (parent uses this to reset to default)', () => {
    const onSelect = jest.fn()
    const { getByTestId } = render(
      <TrendChart months={months} selectedMonth={null} currentMonth="2026-05" onMonthSelect={onSelect} />,
    )
    fireEvent.press(getByTestId('savings-trend-bar-2026-05'))
    expect(onSelect).toHaveBeenCalledWith('2026-05')
  })
})

describe('TrendChart — selected-vs-current highlight (fixup 2026-05-17)', () => {
  // Locked logic per the fidelity-fixup brief:
  //   if `selectedMonth` is set → SELECTED bar wins, current month
  //                                gets no special treatment
  //   if `selectedMonth` is null → CURRENT month is the highlighted bar
  // Previously both selected AND current got the same red treatment
  // when a past month was selected, making it unclear which month
  // the insight cards were actually showing.

  it('no selection → current month bar is the highlight (only one)', () => {
    const { getByTestId } = render(
      <TrendChart months={months} selectedMonth={null} currentMonth="2026-05" onMonthSelect={() => {}} />,
    )
    expect(getByTestId('savings-trend-bar-2026-05').props.accessibilityState.selected).toBe(true)
    // Every other month is NOT highlighted.
    expect(getByTestId('savings-trend-bar-2026-04').props.accessibilityState.selected).toBe(false)
    expect(getByTestId('savings-trend-bar-2026-03').props.accessibilityState.selected).toBe(false)
    expect(getByTestId('savings-trend-bar-2026-02').props.accessibilityState.selected).toBe(false)
    expect(getByTestId('savings-trend-bar-2026-01').props.accessibilityState.selected).toBe(false)
    expect(getByTestId('savings-trend-bar-2025-12').props.accessibilityState.selected).toBe(false)
  })

  it('selection past-month → selected bar is the ONLY highlight, current does NOT compete', () => {
    const { getByTestId } = render(
      <TrendChart
        months={months}
        selectedMonth="2026-03"
        currentMonth="2026-05"
        onMonthSelect={() => {}}
      />,
    )
    // Selected month: highlighted.
    expect(getByTestId('savings-trend-bar-2026-03').props.accessibilityState.selected).toBe(true)
    // Current month: NOT highlighted — the locked regression fix.
    expect(getByTestId('savings-trend-bar-2026-05').props.accessibilityState.selected).toBe(false)
    // Other months: NOT highlighted.
    expect(getByTestId('savings-trend-bar-2026-04').props.accessibilityState.selected).toBe(false)
    expect(getByTestId('savings-trend-bar-2026-02').props.accessibilityState.selected).toBe(false)
    expect(getByTestId('savings-trend-bar-2026-01').props.accessibilityState.selected).toBe(false)
    expect(getByTestId('savings-trend-bar-2025-12').props.accessibilityState.selected).toBe(false)
  })

  it('selection = current month → only one highlight (no double treatment)', () => {
    // Edge: if selectedMonth === currentMonth, behavior should still
    // produce exactly one highlighted bar (the one that matches both).
    // The hasSelection branch wins; the current-month fallback never
    // runs.  Visual result is identical regardless of which branch.
    const { getByTestId } = render(
      <TrendChart
        months={months}
        selectedMonth="2026-05"
        currentMonth="2026-05"
        onMonthSelect={() => {}}
      />,
    )
    expect(getByTestId('savings-trend-bar-2026-05').props.accessibilityState.selected).toBe(true)
    expect(getByTestId('savings-trend-bar-2026-04').props.accessibilityState.selected).toBe(false)
  })
})
