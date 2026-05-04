import React from 'react'
import { render } from '@testing-library/react-native'
import { TabBar } from '@/features/merchant/components/TabBar'

describe('TabBar — sticky-mode active-indicator pulse', () => {
  it('exposes the active tab indicator with the standard testID', () => {
    const { getByTestId } = render(
      <TabBar
        tabs={[{ id: 'vouchers', label: 'Vouchers' }, { id: 'reviews', label: 'Reviews' }]}
        activeTab="vouchers"
        onTabPress={() => {}}
        switchTrigger={null}
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
        switchTrigger={null}
      />,
    )
    expect(getAllByTestId('tab-active-indicator')).toHaveLength(1)
  })

  it('accepts switchTrigger prop without crashing on null/undefined', () => {
    const { rerender } = render(
      <TabBar
        tabs={[{ id: 'vouchers', label: 'Vouchers' }]}
        activeTab="vouchers"
        onTabPress={() => {}}
        switchTrigger={null}
      />,
    )
    rerender(
      <TabBar
        tabs={[{ id: 'vouchers', label: 'Vouchers' }]}
        activeTab="vouchers"
        onTabPress={() => {}}
        switchTrigger="branch-1"
      />,
    )
    rerender(
      <TabBar
        tabs={[{ id: 'vouchers', label: 'Vouchers' }]}
        activeTab="vouchers"
        onTabPress={() => {}}
        switchTrigger="branch-2"
      />,
    )
    // No assertion needed beyond not crashing — the rerender chain exercises
    // the isFirstRender skip + the subsequent change path. Visual feel is
    // verified on-device.
  })
})
