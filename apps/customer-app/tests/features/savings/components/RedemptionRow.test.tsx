import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { RedemptionRow } from '@/features/savings/components/RedemptionRow'
import type { SavingsRedemption } from '@/lib/api/savings'

// §Savings Rebaseline (PR-B, Revision 2): RedemptionRow pins.
// Three locked adaptations verified here:
//   1. Show-to-staff badge window: 2h (PRESENTATION_WINDOW_MS), NOT 24h.
//   2. Voucher type label sourced from canonical `voucherTypeLabel`
//      helper, covering TIME_LIMITED + REUSABLE.
//   3. Meta line includes `branchShortName(branch.name)` between type
//      and relative time.

function makeRedemption(overrides: Partial<SavingsRedemption> = {}): SavingsRedemption {
  return {
    id:              'red-1',
    redeemedAt:      new Date(Date.now() - 30 * 60_000).toISOString(),  // 30 min ago
    estimatedSaving: 12.5,
    isValidated:     false,
    validatedAt:     null,
    merchant:        { id: 'cov', businessName: 'Covelum', logoUrl: null },
    voucher:         { id: 'v-1', title: 'BOGO Karaara', voucherType: 'BOGO' },
    branch:          { id: 'br-1', name: 'Covelum — Brightlingsea' },
    ...overrides,
  }
}

describe('RedemptionRow — badge windows', () => {
  it('shows "Show to staff" amber pill when not validated AND ≤ 2 hours since redemption', () => {
    const r = makeRedemption({
      redeemedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      isValidated: false,
    })
    const { getByTestId, queryByTestId } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    expect(getByTestId('savings-row-badge-show-to-staff')).toBeTruthy()
    expect(queryByTestId('savings-row-badge-validated')).toBeNull()
    expect(queryByTestId('savings-row-badge-plain')).toBeNull()
  })

  it('hides "Show to staff" badge when not validated AND > 2 hours have elapsed (matches §AE5 hide boundary)', () => {
    const r = makeRedemption({
      redeemedAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),   // 3h ago — past 2h gate
      isValidated: false,
    })
    const { getByTestId, queryByTestId } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    expect(queryByTestId('savings-row-badge-show-to-staff')).toBeNull()
    expect(getByTestId('savings-row-badge-plain')).toBeTruthy()
  })

  it('shows green "Validated ✓" badge when validated AND ≤ 24h since validation', () => {
    const r = makeRedemption({
      redeemedAt: new Date(Date.now() - 4 * 60 * 60_000).toISOString(),
      isValidated: true,
      validatedAt: new Date(Date.now() - 60 * 60_000).toISOString(),       // 1h ago
    })
    const { getByTestId, queryByTestId } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    expect(getByTestId('savings-row-badge-validated')).toBeTruthy()
    expect(queryByTestId('savings-row-badge-show-to-staff')).toBeNull()
  })

  it('shows plain "Redeemed" text when validated > 24h ago', () => {
    const r = makeRedemption({
      isValidated: true,
      validatedAt: new Date(Date.now() - 48 * 60 * 60_000).toISOString(),
    })
    const { getByTestId } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    expect(getByTestId('savings-row-badge-plain')).toBeTruthy()
  })
})

describe('RedemptionRow — voucher type label + branch meta', () => {
  it('renders TIME_LIMITED with "Time limited" label (canonical voucherTypeLabel)', () => {
    const r = makeRedemption({ voucher: { id: 'v', title: 't', voucherType: 'TIME_LIMITED' } })
    const { getByText } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    expect(getByText(/Time limited/)).toBeTruthy()
  })

  it('renders REUSABLE with "Reusable" label (canonical voucherTypeLabel)', () => {
    const r = makeRedemption({ voucher: { id: 'v', title: 't', voucherType: 'REUSABLE' } })
    const { getByText } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    expect(getByText(/Reusable/)).toBeTruthy()
  })

  it('meta line shows branchShortName between type and relative time (multi-branch disambiguation)', () => {
    const r = makeRedemption({
      branch: { id: 'br-1', name: 'Covelum — Brightlingsea' },
      voucher: { id: 'v', title: 't', voucherType: 'BOGO' },
      redeemedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),  // 2h ago
    })
    const { getByText } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    // branchShortName('Covelum — Brightlingsea') → 'Brightlingsea'
    // voucherTypeLabel('BOGO') → 'Buy one, get one free' (canonical
    // helper).  NOTE: this diverges from the brainstorm's compact
    // 'BOGO' short form — flagged as a design-fidelity divergence in
    // the PR-B design report.  Owner decision pending: live with the
    // verbose label, OR add a short-label variant, OR shorten the
    // canonical helper (would ripple across Voucher Detail / Merchant
    // Profile / SuccessPopup / ShowToStaff).
    expect(getByText(/Buy one, get one free · Brightlingsea · /)).toBeTruthy()
  })
})

describe('RedemptionRow — tap + a11y', () => {
  it('tap fires onPress with the voucher id', () => {
    const r = makeRedemption()
    const onPress = jest.fn()
    const { getByTestId } = render(<RedemptionRow redemption={r} onPress={onPress} />)
    fireEvent.press(getByTestId('savings-redemption-row-red-1'))
    expect(onPress).toHaveBeenCalledWith('v-1')
  })

  it('accessibility label includes merchant, branch, type, amount, and relative time', () => {
    const r = makeRedemption({
      redeemedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
      branch: { id: 'br-1', name: 'Covelum — Brightlingsea' },
    })
    const { getByTestId } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    const row = getByTestId('savings-redemption-row-red-1')
    const a11y = row.props.accessibilityLabel as string
    expect(a11y).toContain('Covelum')
    expect(a11y).toContain('Brightlingsea')
    expect(a11y).toContain('Buy one, get one free')
    expect(a11y).toContain('£12.50')
    expect(a11y).toMatch(/(min|h|d|Just) ago|Just now/)
  })
})
