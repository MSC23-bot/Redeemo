import { render, screen, fireEvent, within } from '@testing-library/react'
import { RedemptionDetail } from '../RedemptionDetail'
import type { RedemptionRow } from '@/lib/api/redemptions'

const AWAITING: RedemptionRow = {
  id: 'r1',
  redemptionCode: 'A7K2P9X4',
  voucher: { id: 'v1', title: 'Free coffee', type: 'FREEBIE' },
  branch: { id: 'b1', name: 'High Street' },
  customerName: 'Sarah K.',
  redeemedAt: '2026-06-21T10:00:00.000Z',
  status: 'AWAITING_VALIDATION',
  validatedAt: null,
  validationMethod: null,
  validatedByLabel: null,
  estimatedSaving: 3.5,
}
const VALIDATED: RedemptionRow = {
  ...AWAITING,
  status: 'VALIDATED',
  validatedAt: '2026-06-21T11:00:00.000Z',
  validationMethod: 'MANUAL',
  validatedByLabel: 'Validated in the portal',
}

const onClose = jest.fn()
beforeEach(() => onClose.mockReset())

describe('RedemptionDetail (F3 merchant-safe detail)', () => {
  it('renders the merchant-safe fields for an awaiting redemption', () => {
    render(<RedemptionDetail row={AWAITING} onClose={onClose} />)
    const panel = screen.getByRole('dialog')
    expect(within(panel).getByText('Free coffee')).toBeInTheDocument()
    expect(within(panel).getByText('A7K2 P9X4')).toBeInTheDocument()
    expect(within(panel).getByText('Sarah K.')).toBeInTheDocument()
    expect(within(panel).getByText('High Street')).toBeInTheDocument()
    expect(within(panel).getByText(/awaiting validation/i)).toBeInTheDocument()
    expect(within(panel).getByText('£3.50')).toBeInTheDocument()
  })

  it('shows the validation details for a validated redemption', () => {
    render(<RedemptionDetail row={VALIDATED} onClose={onClose} />)
    const panel = screen.getByRole('dialog')
    expect(within(panel).getByText('Validated in the portal')).toBeInTheDocument()
    expect(within(panel).getByText(/manual/i)).toBeInTheDocument()
  })

  it('NEVER renders a surname, email, phone, or PIN', () => {
    render(<RedemptionDetail row={VALIDATED} onClose={onClose} />)
    const text = screen.getByRole('dialog').textContent ?? ''
    expect(text).toContain('Sarah K.')
    expect(text).not.toMatch(/Khan|@|07\d{9}|\+44/i)
    expect(text).not.toMatch(/\bPIN\b/)
  })

  it('renders optional voucher description and terms only when present (forward-compat)', () => {
    const withCopy = {
      ...AWAITING,
      voucher: { ...AWAITING.voucher, description: 'One free coffee.', terms: 'One per visit.' },
    } as RedemptionRow
    render(<RedemptionDetail row={withCopy} onClose={onClose} />)
    const panel = screen.getByRole('dialog')
    expect(within(panel).getByText('One free coffee.')).toBeInTheDocument()
    expect(within(panel).getByText('One per visit.')).toBeInTheDocument()
  })

  it('closes via the Close action', () => {
    render(<RedemptionDetail row={AWAITING} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
