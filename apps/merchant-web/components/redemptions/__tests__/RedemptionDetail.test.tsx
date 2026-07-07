import { render, screen, fireEvent, within } from '@testing-library/react'
import { RedemptionDetail } from '../RedemptionDetail'
import type { RedemptionRow } from '@/lib/api/redemptions'

// The drawer's "Validate this code" action opens the shared validate flow via the
// context; mock it so we can assert the code hand-off.
const mockOpenValidate = jest.fn()
jest.mock('@/components/redemptions/validateDialogContext', () => ({
  useValidateDialog: () => ({ openValidate: mockOpenValidate }),
}))

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
beforeEach(() => {
  onClose.mockReset()
  mockOpenValidate.mockReset()
})

describe('RedemptionDetail (F3 merchant-safe detail drawer)', () => {
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

  it('renders the voucher hero (title + type + saving); View voucher link for a full-nav viewer', () => {
    render(<RedemptionDetail row={AWAITING} onClose={onClose} canViewVoucher />)
    const panel = screen.getByRole('dialog')
    expect(within(panel).getByText('Freebie')).toBeInTheDocument() // type chip
    const link = within(panel).getByRole('link', { name: /view voucher/i })
    expect(link).toHaveAttribute('href', '/vouchers/v1')
  })

  it('does NOT offer a View voucher link to a STAFF / unknown viewer (canViewVoucher false)', () => {
    render(<RedemptionDetail row={AWAITING} onClose={onClose} canViewVoucher={false} />)
    const panel = screen.getByRole('dialog')
    expect(within(panel).queryByRole('link', { name: /view voucher/i })).toBeNull()
    // The rest of the drawer still renders (hero + validate CTA).
    expect(within(panel).getByText('Free coffee')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: /validate this code/i })).toBeInTheDocument()
  })

  it('fails closed when canViewVoucher is omitted (no link)', () => {
    render(<RedemptionDetail row={AWAITING} onClose={onClose} />)
    expect(
      within(screen.getByRole('dialog')).queryByRole('link', { name: /view voucher/i }),
    ).toBeNull()
  })

  it('renders Voucher.terms as a tick checklist (newline-split, blob = one item)', () => {
    const withTerms = {
      ...AWAITING,
      voucher: {
        ...AWAITING.voucher,
        terms: 'One per visit.\nDine in only.\n\nCannot be combined.',
      },
    } as RedemptionRow
    render(<RedemptionDetail row={withTerms} onClose={onClose} />)
    const panel = screen.getByRole('dialog')
    const items = within(panel).getAllByRole('listitem')
    expect(items).toHaveLength(3) // blank line dropped
    expect(within(panel).getByText('One per visit.')).toBeInTheDocument()
    expect(within(panel).getByText('Dine in only.')).toBeInTheDocument()
    expect(within(panel).getByText('Cannot be combined.')).toBeInTheDocument()
  })

  it('a single blob term renders as one checklist item', () => {
    const withTerms = {
      ...AWAITING,
      voucher: { ...AWAITING.voucher, terms: 'One voucher per table, per visit.' },
    } as RedemptionRow
    render(<RedemptionDetail row={withTerms} onClose={onClose} />)
    expect(within(screen.getByRole('dialog')).getAllByRole('listitem')).toHaveLength(1)
  })

  it('shows an embedded "Validate this code" CTA for an awaiting row that opens the flow with the code', () => {
    render(<RedemptionDetail row={AWAITING} onClose={onClose} />)
    const cta = screen.getByRole('button', { name: /validate this code/i })
    fireEvent.click(cta)
    expect(mockOpenValidate).toHaveBeenCalledWith('A7K2P9X4')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows the method / when / by details for a validated redemption (NO validate CTA)', () => {
    render(<RedemptionDetail row={VALIDATED} onClose={onClose} />)
    const panel = screen.getByRole('dialog')
    expect(within(panel).getByText('Validated in the portal')).toBeInTheDocument()
    expect(within(panel).getByText('Manual entry')).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /validate this code/i })).toBeNull()
  })

  it('NEVER offers or implies a reverse / reversal action', () => {
    const text = (() => {
      render(<RedemptionDetail row={VALIDATED} onClose={onClose} />)
      return screen.getByRole('dialog').textContent ?? ''
    })()
    expect(text).not.toMatch(/revers/i)
  })

  it('NEVER renders a surname, email, phone, or PIN', () => {
    render(<RedemptionDetail row={VALIDATED} onClose={onClose} />)
    const text = screen.getByRole('dialog').textContent ?? ''
    expect(text).toContain('Sarah K.')
    expect(text).not.toMatch(/Khan|@|07\d{9}|\+44/i)
    expect(text).not.toMatch(/\bPIN\b/)
  })

  it('renders the optional voucher description when present', () => {
    const withCopy = {
      ...AWAITING,
      voucher: { ...AWAITING.voucher, description: 'One free coffee.' },
    } as RedemptionRow
    render(<RedemptionDetail row={withCopy} onClose={onClose} />)
    expect(within(screen.getByRole('dialog')).getByText('One free coffee.')).toBeInTheDocument()
  })

  it('closes via the Close action', () => {
    render(<RedemptionDetail row={AWAITING} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
