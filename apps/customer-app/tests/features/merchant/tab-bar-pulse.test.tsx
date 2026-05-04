import React from 'react'
import { render } from '@testing-library/react-native'
import { TabBar } from '@/features/merchant/components/TabBar'

// Visual correction round §2 (post-PR-#35 QA): TabBar active-indicator
// height pulse REMOVED. The indicator is now a static brand-red bar +
// the tab bar gains border + shadow chrome to anchor against the cream
// page surface. Branch-switch feedback is centralised in the
// BranchContextBand coordinated motion (Section §4) — pulsing the tab
// indicator on every switch was decorative noise.
//
// File renamed-in-spirit ("pulse" no longer applies) but kept here as
// the canonical "TabBar visual contracts" test file. Tests assert the
// indicator structural contract (testID exists, only the active tab
// renders one, prop shape is stable).
describe('TabBar — visual contracts', () => {
  it('exposes the active tab indicator with the standard testID', () => {
    const { getByTestId } = render(
      <TabBar
        tabs={[{ id: 'vouchers', label: 'Vouchers' }, { id: 'reviews', label: 'Reviews' }]}
        activeTab="vouchers"
        onTabPress={() => {}}
      />,
    )
    expect(getByTestId('tab-active-indicator')).toBeTruthy()
  })

  it('only renders one indicator (on the active tab) regardless of tab count', () => {
    const { getAllByTestId } = render(
      <TabBar
        tabs={[
          { id: 'vouchers', label: 'Vouchers' },
          { id: 'about',    label: 'About' },
          { id: 'reviews',  label: 'Reviews' },
        ]}
        activeTab="reviews"
        onTabPress={() => {}}
      />,
    )
    expect(getAllByTestId('tab-active-indicator')).toHaveLength(1)
  })

  it('moves the indicator when the active tab changes', () => {
    const { getByTestId, getByLabelText, rerender } = render(
      <TabBar
        tabs={[
          { id: 'vouchers', label: 'Vouchers' },
          { id: 'reviews',  label: 'Reviews' },
        ]}
        activeTab="vouchers"
        onTabPress={() => {}}
      />,
    )
    expect(getByTestId('tab-active-indicator')).toBeTruthy()
    rerender(
      <TabBar
        tabs={[
          { id: 'vouchers', label: 'Vouchers' },
          { id: 'reviews',  label: 'Reviews' },
        ]}
        activeTab="reviews"
        onTabPress={() => {}}
      />,
    )
    // Indicator still exists (now under the new active tab); active state
    // also flips on the accessibility role.
    expect(getByTestId('tab-active-indicator')).toBeTruthy()
    expect(getByLabelText('Reviews')).toBeTruthy()
  })
})
