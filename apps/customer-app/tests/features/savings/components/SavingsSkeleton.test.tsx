import React from 'react'
import { render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SavingsSkeleton, InsightSkeleton } from '@/features/savings/components/SavingsSkeleton'

const initialMetrics = {
  frame:  { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

function wrap(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>)
}

// §Savings Rebaseline (PR-B, Revision 2): structural skeleton pins.
//   - All six structural blocks mount (hero / trend / top-branches /
//     categories / roi / rows).
//   - accessibilityRole === 'progressbar' + accessibilityLabel set.
//   - InsightSkeleton renders the two-card subset for month drill-down.

describe('SavingsSkeleton', () => {
  it('mounts the root with progressbar role + "Loading your savings" label', () => {
    const { getByTestId } = wrap(<SavingsSkeleton />)
    const root = getByTestId('savings-skeleton')
    expect(root.props.accessibilityRole).toBe('progressbar')
    expect(root.props.accessibilityLabel).toBe('Loading your savings')
  })

  it('mounts all six structural blocks (hero + 3 cards + ROI + rows)', () => {
    const { getByTestId } = wrap(<SavingsSkeleton />)
    expect(getByTestId('savings-skeleton-hero')).toBeTruthy()
    expect(getByTestId('savings-skeleton-card-trend')).toBeTruthy()
    expect(getByTestId('savings-skeleton-card-top-branches')).toBeTruthy()
    expect(getByTestId('savings-skeleton-card-categories')).toBeTruthy()
    expect(getByTestId('savings-skeleton-card-roi')).toBeTruthy()
    expect(getByTestId('savings-skeleton-rows')).toBeTruthy()
  })
})

describe('InsightSkeleton', () => {
  it('renders the two-card subset (top branches + categories) for month drill-down', () => {
    const { getByTestId } = wrap(<InsightSkeleton />)
    expect(getByTestId('savings-insight-skeleton')).toBeTruthy()
    expect(getByTestId('savings-insight-skeleton-top-branches')).toBeTruthy()
    expect(getByTestId('savings-insight-skeleton-categories')).toBeTruthy()
  })
})
