/**
 * RedemptionsTable (extracted from the global /redemptions page, A3): locks the
 * shared table contract, especially the `hideMerchantColumn` prop the per-merchant
 * Merchant 360 tab relies on.
 *
 * B3 additions: the Merchant/Branch cells are quick-links into the Merchant 360
 * workspace, and clicking a row (but NOT a quick-link inside it) opens the
 * read-only RedemptionDetailDrawer built from that row's own data alone.
 */
import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { RedemptionsTable } from '../RedemptionsTable'
import { apiFetch } from '@/lib/api/client'
import type { AdminRedemptionRow } from '@/lib/api/redemptions'

jest.mock('@/lib/api/client', () => ({
  apiFetch: jest.fn(),
}))

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>

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

// ── B3: Merchant/Branch quick-links ──────────────────────────────────────────

describe('RedemptionsTable quick-links', () => {
  it('the Merchant cell links to the Merchant 360 Redemptions tab', () => {
    render(<RedemptionsTable items={[row({ merchant: { id: 'm-42', businessName: 'Acme Coffee' } })]} />)
    const link = within(screen.getByTestId('redemption-row-r1')).getByRole('link', { name: 'Acme Coffee' })
    expect(link).toHaveAttribute('href', '/merchants/m-42?tab=redemptions')
  })

  it('the Branch cell links to the Merchant 360 Branches tab', () => {
    render(
      <RedemptionsTable
        items={[row({ merchant: { id: 'm-42', businessName: 'Acme Coffee' }, branch: { id: 'b-9', name: 'High Street' } })]}
      />
    )
    const link = within(screen.getByTestId('redemption-row-r1')).getByRole('link', { name: 'High Street' })
    expect(link).toHaveAttribute('href', '/merchants/m-42?tab=branches')
  })

  it('the Branch cell is still a quick-link when the Merchant column is hidden (per-merchant tab)', () => {
    render(
      <RedemptionsTable
        items={[row({ merchant: { id: 'm-42', businessName: 'Acme Coffee' }, branch: { id: 'b-9', name: 'High Street' } })]}
        hideMerchantColumn
      />
    )
    const link = within(screen.getByTestId('redemption-row-r1')).getByRole('link', { name: 'High Street' })
    expect(link).toHaveAttribute('href', '/merchants/m-42?tab=branches')
  })
})

// ── B3: row click opens the read-only detail drawer ──────────────────────────

describe('RedemptionsTable row click opens the detail drawer', () => {
  it('is closed by default', () => {
    render(<RedemptionsTable items={[row()]} />)
    expect(screen.queryByTestId('redemption-detail-drawer')).not.toBeInTheDocument()
  })

  it('opens with this row\'s data when a non-link part of the row is clicked', () => {
    render(<RedemptionsTable items={[row({ customerName: 'Priya N.' })]} />)
    fireEvent.click(screen.getByTestId('redemption-row-r1'))
    const drawer = screen.getByTestId('redemption-detail-drawer')
    expect(drawer).toBeInTheDocument()
    expect(within(drawer).getByTestId('redemption-detail-customer')).toHaveTextContent('Priya N.')
  })

  it('the Close button dismisses the drawer', () => {
    render(<RedemptionsTable items={[row()]} />)
    fireEvent.click(screen.getByTestId('redemption-row-r1'))
    expect(screen.getByTestId('redemption-detail-drawer')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('redemption-detail-drawer')).not.toBeInTheDocument()
  })

  it('Escape dismisses the drawer', () => {
    render(<RedemptionsTable items={[row()]} />)
    fireEvent.click(screen.getByTestId('redemption-row-r1'))
    fireEvent.keyDown(screen.getByTestId('redemption-detail-drawer'), { key: 'Escape' })
    expect(screen.queryByTestId('redemption-detail-drawer')).not.toBeInTheDocument()
  })

  it('scrim click dismisses the drawer', () => {
    render(<RedemptionsTable items={[row()]} />)
    fireEvent.click(screen.getByTestId('redemption-row-r1'))
    fireEvent.click(screen.getByTestId('redemption-detail-scrim'))
    expect(screen.queryByTestId('redemption-detail-drawer')).not.toBeInTheDocument()
  })

  it('never fires a fetch just from opening or closing the drawer (D67 list-only contract)', () => {
    render(<RedemptionsTable items={[row()]} />)
    fireEvent.click(screen.getByTestId('redemption-row-r1'))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(mockedApiFetch).not.toHaveBeenCalled()
  })
})

// ── B3: quick-links must not break row interactions ──────────────────────────

describe('RedemptionsTable links do not break row interactions', () => {
  it('clicking the Merchant quick-link does NOT open the detail drawer', () => {
    render(<RedemptionsTable items={[row({ merchant: { id: 'm-42', businessName: 'Acme Coffee' } })]} />)
    fireEvent.click(screen.getByRole('link', { name: 'Acme Coffee' }))
    expect(screen.queryByTestId('redemption-detail-drawer')).not.toBeInTheDocument()
  })

  it('clicking the Branch quick-link does NOT open the detail drawer', () => {
    render(<RedemptionsTable items={[row({ branch: { id: 'b-9', name: 'High Street' } })]} />)
    fireEvent.click(screen.getByRole('link', { name: 'High Street' }))
    expect(screen.queryByTestId('redemption-detail-drawer')).not.toBeInTheDocument()
  })

  it('clicking elsewhere in the same row (after a link click) still opens the drawer', () => {
    render(<RedemptionsTable items={[row({ merchant: { id: 'm-42', businessName: 'Acme Coffee' } })]} />)
    fireEvent.click(screen.getByRole('link', { name: 'Acme Coffee' }))
    expect(screen.queryByTestId('redemption-detail-drawer')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('redemption-row-r1'))
    expect(screen.getByTestId('redemption-detail-drawer')).toBeInTheDocument()
  })
})
