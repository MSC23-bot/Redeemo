/**
 * RedemptionsTable (extracted from the global /redemptions page, A3): locks the
 * shared table contract, especially the `hideMerchantColumn` prop the per-merchant
 * Merchant 360 tab relies on.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { RedemptionsTable } from '../RedemptionsTable'
import type { AdminRedemptionRow } from '@/lib/api/redemptions'

function row(overrides: Partial<AdminRedemptionRow> = {}): AdminRedemptionRow {
  return {
    id: 'r1',
    redemptionCode: 'A7K2P9X4',
    voucher: { id: 'v1', title: 'Half-price pizza', type: 'BOGO' },
    branch: { id: 'b1', name: 'Main Branch' },
    merchant: { id: 'm1', businessName: 'Acme Coffee' },
    customerName: 'Sarah K.',
    redeemedAt: '2026-07-01T10:00:00.000Z',
    status: 'AWAITING_VALIDATION',
    validatedAt: null,
    validationMethod: null,
    validatedByLabel: null,
    estimatedSaving: 5,
    isTestData: false,
    ...overrides,
  }
}

describe('RedemptionsTable', () => {
  it('shows the Merchant column by default (cross-merchant global view)', () => {
    render(<RedemptionsTable items={[row()]} />)
    expect(screen.getByRole('columnheader', { name: 'Merchant' })).toBeInTheDocument()
    expect(screen.getByTestId('redemption-row-r1')).toHaveTextContent('Acme Coffee')
    expect(screen.getByTestId('redemption-row-r1')).toHaveTextContent('A7K2 P9X4')
  })

  it('hides the Merchant column when hideMerchantColumn is set (per-merchant view)', () => {
    render(<RedemptionsTable items={[row()]} hideMerchantColumn />)
    expect(screen.queryByRole('columnheader', { name: 'Merchant' })).not.toBeInTheDocument()
    expect(screen.getByTestId('redemption-row-r1')).not.toHaveTextContent('Acme Coffee')
    // Other columns still render.
    expect(screen.getByRole('columnheader', { name: 'Voucher' })).toBeInTheDocument()
    expect(screen.getByTestId('redemption-row-r1')).toHaveTextContent('Main Branch')
  })

  it('shows the empty state when there are no rows', () => {
    render(<RedemptionsTable items={[]} />)
    expect(screen.getByText(/no redemptions match this search/i)).toBeInTheDocument()
  })
})
