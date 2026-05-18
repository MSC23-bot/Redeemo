import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { TopPlaces, groupByMerchant, type MerchantPlace } from '@/features/savings/components/TopBranches'
import type { BranchSaving } from '@/lib/api/savings'

// §Savings fidelity fixup-3 2026-05-17: TopPlaces test surface.
// Component was renamed from `TopBranches` (branch-level rows) to
// `TopPlaces` (merchant-grouped rows) per device QA owner direction.
// File path stays at `TopBranches.tsx` for git-history continuity.

function makeBranch(overrides: Partial<BranchSaving> = {}): BranchSaving {
  return {
    branchId:        'br-bright',
    branchName:      'Covelum — Brightlingsea',
    merchantId:      'cov',
    merchantName:    'Covelum',
    merchantLogoUrl: null,
    saving:          15,
    count:           1,
    ...overrides,
  }
}

function makePlace(overrides: Partial<MerchantPlace> = {}): MerchantPlace {
  return {
    merchantId:      'cov',
    merchantName:    'Covelum',
    merchantLogoUrl: null,
    saving:          15,
    count:           1,
    ...overrides,
  }
}

describe('groupByMerchant', () => {
  // Locked owner direction (fidelity fixup-3): multi-branch merchants
  // collapse into a single "Top places" row.  Sum saving + count.
  it('collapses two branches of the same merchant into one row', () => {
    const branches = [
      makeBranch({ branchId: 'br-bright', branchName: 'Covelum — Brightlingsea', saving: 12, count: 2 }),
      makeBranch({ branchId: 'br-colch',  branchName: 'Covelum — Colchester',    saving:  8, count: 1 }),
    ]
    const places = groupByMerchant(branches)
    expect(places).toHaveLength(1)
    expect(places[0]).toMatchObject({
      merchantId:   'cov',
      merchantName: 'Covelum',
      saving:       20,
      count:        3,
    })
  })

  it('keeps separate merchants distinct + sorts descending by total saving', () => {
    const branches = [
      makeBranch({ merchantId: 'a', merchantName: 'A',  saving: 5,  count: 1 }),
      makeBranch({ merchantId: 'b', merchantName: 'B',  saving: 30, count: 2 }),
      makeBranch({ merchantId: 'c', merchantName: 'C',  saving: 12, count: 1 }),
    ]
    const places = groupByMerchant(branches)
    expect(places.map((p) => p.merchantId)).toEqual(['b', 'c', 'a'])
  })

  it('prefers first non-null logo when merging branches of the same merchant', () => {
    const branches = [
      makeBranch({ branchId: 'b1', merchantLogoUrl: null }),
      makeBranch({ branchId: 'b2', merchantLogoUrl: 'https://cdn/cov.png' }),
    ]
    const places = groupByMerchant(branches)
    expect(places[0]?.merchantLogoUrl).toBe('https://cdn/cov.png')
  })

  it('returns an empty array when given no branches', () => {
    expect(groupByMerchant([])).toEqual([])
  })
})

describe('TopPlaces', () => {
  it('renders the "Top places" card title with the supplied context label on the right', () => {
    const places = [makePlace()]
    const { getByText } = render(
      <TopPlaces places={places} onPress={() => {}} contextLabel="This month" />,
    )
    expect(getByText('Top places')).toBeTruthy()
    expect(getByText('This month')).toBeTruthy()
  })

  it('omits the context label when not supplied', () => {
    const places = [makePlace()]
    const { queryByText } = render(<TopPlaces places={places} onPress={() => {}} />)
    expect(queryByText('This month')).toBeNull()
  })

  it('renders one row per merchantId with merchantName primary + visit count secondary', () => {
    const places = [makePlace({ merchantName: 'Covelum', count: 3, saving: 20 })]
    const { getByText, getByTestId } = render(
      <TopPlaces places={places} onPress={() => {}} />,
    )
    expect(getByText('Covelum')).toBeTruthy()
    // Secondary line is "{count} visits" — branch identity is
    // intentionally hidden here per the locked owner direction.
    expect(getByText('3 visits')).toBeTruthy()
    expect(getByTestId('savings-top-places-row-cov')).toBeTruthy()
  })

  it('uses singular "visit" when count is 1', () => {
    const places = [makePlace({ count: 1 })]
    const { getByText } = render(<TopPlaces places={places} onPress={() => {}} />)
    expect(getByText('1 visit')).toBeTruthy()
  })

  it('saving renders bare "£20.00" right-aligned (no leading "+")', () => {
    const places = [makePlace({ saving: 20 })]
    const { getByText, queryByText } = render(<TopPlaces places={places} onPress={() => {}} />)
    expect(getByText('£20.00')).toBeTruthy()
    expect(queryByText('+£20.00')).toBeNull()
  })

  it('renders nothing when places array is empty + no emptyLabel', () => {
    const { queryByTestId } = render(<TopPlaces places={[]} onPress={() => {}} />)
    expect(queryByTestId('savings-top-places')).toBeNull()
    expect(queryByTestId('savings-top-places-empty')).toBeNull()
  })

  it('renders empty-state card when emptyLabel supplied + places is empty', () => {
    const { getByTestId, getByText } = render(
      <TopPlaces places={[]} onPress={() => {}} emptyLabel="No place savings in April" contextLabel="April" />,
    )
    expect(getByTestId('savings-top-places-empty')).toBeTruthy()
    expect(getByText('No place savings in April')).toBeTruthy()
    expect(getByText('Top places')).toBeTruthy()
    expect(getByText('April')).toBeTruthy()
  })

  it('slices to first 2 entries when more are provided', () => {
    const places = [
      makePlace({ merchantId: 'a', merchantName: 'A' }),
      makePlace({ merchantId: 'b', merchantName: 'B' }),
      makePlace({ merchantId: 'c', merchantName: 'C' }),
      makePlace({ merchantId: 'd', merchantName: 'D' }),
    ]
    const { getByTestId, queryByTestId } = render(<TopPlaces places={places} onPress={() => {}} />)
    expect(getByTestId('savings-top-places-row-a')).toBeTruthy()
    expect(getByTestId('savings-top-places-row-b')).toBeTruthy()
    expect(queryByTestId('savings-top-places-row-c')).toBeNull()
    expect(queryByTestId('savings-top-places-row-d')).toBeNull()
  })

  it('tap fires onPress with merchantId (single-arg)', () => {
    const onPress = jest.fn()
    const places = [makePlace({ merchantId: 'cov' })]
    const { getByTestId } = render(<TopPlaces places={places} onPress={onPress} />)
    fireEvent.press(getByTestId('savings-top-places-row-cov'))
    expect(onPress).toHaveBeenCalledWith('cov')
  })

  it('accessibility label includes merchant, amount, redemption count', () => {
    const places = [makePlace({ merchantName: 'Covelum', saving: 15, count: 2 })]
    const { getByTestId } = render(<TopPlaces places={places} onPress={() => {}} />)
    const row = getByTestId('savings-top-places-row-cov')
    const a11y = row.props.accessibilityLabel as string
    expect(a11y).toContain('Covelum')
    expect(a11y).toContain('£15.00')
    expect(a11y).toMatch(/2 redemptions/)
  })
})
