/**
 * RedemptionDetailDrawer (B3): locks the read-only detail contract - every
 * field renders from the row prop ALONE (no fetch), the Merchant/Branch quick
 * links and the "View merchant" affordance point at the Merchant 360
 * workspace, and Escape/scrim/close-button dismissal all call onClose exactly
 * once (reusing the shared Dialog primitive, not hand-rolled).
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { RedemptionDetailDrawer } from '../RedemptionDetailDrawer'
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

describe('RedemptionDetailDrawer content', () => {
  it('renders the code grouped 4+4, voucher title/type, merchant, branch, and masked customer name', () => {
    render(<RedemptionDetailDrawer row={row()} onClose={jest.fn()} />)
    expect(screen.getByTestId('redemption-detail-code')).toHaveTextContent('A7K2 P9X4')
    expect(screen.getByTestId('redemption-detail-voucher-title')).toHaveTextContent('Half-price pizza')
    expect(screen.getByText('BOGO')).toBeInTheDocument()
    expect(screen.getByTestId('redemption-detail-merchant-link')).toHaveTextContent('Acme Coffee')
    expect(screen.getByTestId('redemption-detail-branch-link')).toHaveTextContent('Main Branch')
    expect(screen.getByTestId('redemption-detail-customer')).toHaveTextContent('Sarah K.')
  })

  it('shows the Test badge only when isTestData is true', () => {
    const { rerender } = render(<RedemptionDetailDrawer row={row({ isTestData: false })} onClose={jest.fn()} />)
    expect(screen.queryByText('Test')).not.toBeInTheDocument()

    rerender(<RedemptionDetailDrawer row={row({ isTestData: true })} onClose={jest.fn()} />)
    expect(screen.getByText('Test')).toBeInTheDocument()
  })

  it('renders "Not yet validated" and a dash method/validator when the row is awaiting validation', () => {
    render(
      <RedemptionDetailDrawer
        row={row({ status: 'AWAITING_VALIDATION', validatedAt: null, validationMethod: null, validatedByLabel: null })}
        onClose={jest.fn()}
      />
    )
    expect(screen.getByTestId('redemption-detail-validated-at')).toHaveTextContent('Not yet validated')
    expect(screen.getByTestId('redemption-detail-method')).toHaveTextContent('-')
    expect(screen.getByTestId('redemption-detail-validated-by')).toHaveTextContent('-')
  })

  it('renders the validated timestamp, method label, and validatedBy label when validated', () => {
    render(
      <RedemptionDetailDrawer
        row={row({
          status: 'VALIDATED',
          validatedAt: '2026-07-01T11:30:00.000Z',
          validationMethod: 'QR_SCAN',
          validatedByLabel: 'Jordan L.',
        })}
        onClose={jest.fn()}
      />
    )
    expect(screen.getByTestId('redemption-detail-validated-at')).not.toHaveTextContent('Not yet validated')
    expect(screen.getByTestId('redemption-detail-method')).toHaveTextContent('QR scan')
    expect(screen.getByTestId('redemption-detail-validated-by')).toHaveTextContent('Jordan L.')
  })

  it('labels a MANUAL validation as "Manual entry"', () => {
    render(<RedemptionDetailDrawer row={row({ status: 'VALIDATED', validationMethod: 'MANUAL' })} onClose={jest.fn()} />)
    expect(screen.getByTestId('redemption-detail-method')).toHaveTextContent('Manual entry')
  })

  it('degrades an unrecognized/legacy validationMethod to a dash rather than fabricating a label', () => {
    render(<RedemptionDetailDrawer row={row({ status: 'VALIDATED', validationMethod: 'PIN' })} onClose={jest.fn()} />)
    expect(screen.getByTestId('redemption-detail-method')).toHaveTextContent('-')
  })

  it('formats the saving as GBP currency', () => {
    render(<RedemptionDetailDrawer row={row({ estimatedSaving: 7.5 })} onClose={jest.fn()} />)
    expect(screen.getByText('£7.50')).toBeInTheDocument()
  })
})

describe('RedemptionDetailDrawer quick-links + View merchant affordance', () => {
  it('the Merchant link deep-links to the Merchant 360 Redemptions tab', () => {
    render(<RedemptionDetailDrawer row={row({ merchant: { id: 'm-42', businessName: 'Acme Coffee' } })} onClose={jest.fn()} />)
    expect(screen.getByTestId('redemption-detail-merchant-link')).toHaveAttribute('href', '/merchants/m-42?tab=redemptions')
  })

  it('the Branch link goes to the Merchant 360 Branches tab', () => {
    render(<RedemptionDetailDrawer row={row({ merchant: { id: 'm-42', businessName: 'Acme Coffee' } })} onClose={jest.fn()} />)
    expect(screen.getByTestId('redemption-detail-branch-link')).toHaveAttribute('href', '/merchants/m-42?tab=branches')
  })

  it('renders an explicit "View merchant" affordance pointing at the Redemptions tab', () => {
    render(<RedemptionDetailDrawer row={row({ merchant: { id: 'm-42', businessName: 'Acme Coffee' } })} onClose={jest.fn()} />)
    const viewMerchant = screen.getByTestId('redemption-detail-view-merchant')
    expect(viewMerchant).toHaveTextContent('View merchant')
    expect(viewMerchant).toHaveAttribute('href', '/merchants/m-42?tab=redemptions')
  })
})

describe('RedemptionDetailDrawer dismissal (reuses the shared Dialog primitive)', () => {
  it('renders as a right-side panel (role=dialog) with the accessible name "Redemption detail"', () => {
    render(<RedemptionDetailDrawer row={row()} onClose={jest.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Redemption detail' })).toBeInTheDocument()
  })

  it('calls onClose once on Escape', () => {
    const onClose = jest.fn()
    render(<RedemptionDetailDrawer row={row()} onClose={onClose} />)
    fireEvent.keyDown(screen.getByTestId('redemption-detail-drawer'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose once on scrim click', () => {
    const onClose = jest.fn()
    render(<RedemptionDetailDrawer row={row()} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('redemption-detail-scrim'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose once on the header Close button', () => {
    const onClose = jest.fn()
    render(<RedemptionDetailDrawer row={row()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('RedemptionDetailDrawer fires no network request (D67 list-only contract)', () => {
  it('never calls apiFetch: every field comes from the row prop already in memory', () => {
    render(<RedemptionDetailDrawer row={row()} onClose={jest.fn()} />)
    expect(mockedApiFetch).not.toHaveBeenCalled()
  })
})
