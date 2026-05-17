import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { TopBranches } from '@/features/savings/components/TopBranches'
import type { BranchSaving } from '@/lib/api/savings'

// §Savings Rebaseline (PR-B, Revision 2): TopBranches pins.
//   - Multi-branch merchant splits into TWO distinct rows.
//   - branchShortName trims merchant prefix on the primary label.
//   - Secondary line carries merchantName untrimmed.
//   - Tap fires onPress(branchId, merchantId) with BOTH values.
//   - Slice to top 2 entries.

function makeBranch(overrides: Partial<BranchSaving> = {}): BranchSaving {
  return {
    branchId:        'br-1',
    branchName:      'Brightlingsea',
    merchantId:      'cov',
    merchantName:    'Covelum',
    merchantLogoUrl: null,
    saving:          15,
    count:           2,
    ...overrides,
  }
}

describe('TopBranches', () => {
  it('renders TWO rows for a multi-branch merchant (shared merchantId, distinct branchIds)', () => {
    const branches = [
      makeBranch({ branchId: 'br-bright', branchName: 'Brightlingsea', saving: 15 }),
      makeBranch({ branchId: 'br-colch',  branchName: 'Colchester',    saving: 10 }),
    ]
    const { getByTestId } = render(<TopBranches branches={branches} onPress={() => {}} />)
    expect(getByTestId('savings-top-branches-row-br-bright')).toBeTruthy()
    expect(getByTestId('savings-top-branches-row-br-colch')).toBeTruthy()
  })

  it('trims merchant prefix on primary label via branchShortName ("Covelum — Brightlingsea" → "Brightlingsea")', () => {
    const branches = [makeBranch({ branchName: 'Covelum — Brightlingsea' })]
    const { getByText, queryByText } = render(<TopBranches branches={branches} onPress={() => {}} />)
    expect(getByText('Brightlingsea')).toBeTruthy()
    // The full untrimmed name MUST NOT appear as the primary label.
    expect(queryByText('Covelum — Brightlingsea')).toBeNull()
  })

  it('secondary line carries merchantName untrimmed', () => {
    const branches = [makeBranch({ branchName: 'Covelum — Brightlingsea', merchantName: 'Covelum' })]
    const { getByText } = render(<TopBranches branches={branches} onPress={() => {}} />)
    expect(getByText('Covelum')).toBeTruthy()
  })

  it('renders nothing when branches array is empty', () => {
    const { queryByTestId } = render(<TopBranches branches={[]} onPress={() => {}} />)
    expect(queryByTestId('savings-top-branches')).toBeNull()
  })

  it('slices to first 2 entries when more are provided', () => {
    const branches = [
      makeBranch({ branchId: 'a', branchName: 'A' }),
      makeBranch({ branchId: 'b', branchName: 'B' }),
      makeBranch({ branchId: 'c', branchName: 'C' }),
      makeBranch({ branchId: 'd', branchName: 'D' }),
    ]
    const { getByTestId, queryByTestId } = render(<TopBranches branches={branches} onPress={() => {}} />)
    expect(getByTestId('savings-top-branches-row-a')).toBeTruthy()
    expect(getByTestId('savings-top-branches-row-b')).toBeTruthy()
    expect(queryByTestId('savings-top-branches-row-c')).toBeNull()
    expect(queryByTestId('savings-top-branches-row-d')).toBeNull()
  })

  it('tap fires onPress(branchId, merchantId) with BOTH values (not just branchId)', () => {
    const branches = [makeBranch({ branchId: 'br-bright', merchantId: 'cov' })]
    const onPress = jest.fn()
    const { getByTestId } = render(<TopBranches branches={branches} onPress={onPress} />)
    fireEvent.press(getByTestId('savings-top-branches-row-br-bright'))
    expect(onPress).toHaveBeenCalledWith('br-bright', 'cov')
  })

  it('accessibility label uses the trimmed primary + carried merchantName', () => {
    const branches = [makeBranch({ branchName: 'Covelum — Brightlingsea', merchantName: 'Covelum', saving: 15, count: 2 })]
    const { getByTestId } = render(<TopBranches branches={branches} onPress={() => {}} />)
    const row = getByTestId('savings-top-branches-row-br-1')
    const a11y = row.props.accessibilityLabel as string
    expect(a11y).toContain('Brightlingsea')
    expect(a11y).toContain('Covelum')
    expect(a11y).toContain('£15.00')
    expect(a11y).toContain('2 redemptions')
  })
})
