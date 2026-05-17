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
