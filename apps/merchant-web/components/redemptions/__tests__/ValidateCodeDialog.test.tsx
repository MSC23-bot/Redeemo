import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ValidateCodeDialog } from '../ValidateCodeDialog'
import { ApiError } from '@/lib/api/client'

const lookupRedemptionByCode = jest.fn()
const validateRedemptionCode = jest.fn()
jest.mock('@/lib/api/redemptions', () => ({
  lookupRedemptionByCode: (code: string) => lookupRedemptionByCode(code),
  validateRedemptionCode: (code: string) => validateRedemptionCode(code),
}))

const AWAITING = {
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
const VALIDATED = {
  ...AWAITING,
  status: 'VALIDATED',
  validatedAt: '2026-06-21T11:00:00.000Z',
  validationMethod: 'MANUAL',
  validatedByLabel: 'Validated in the portal',
}

let qc: QueryClient
const onClose = jest.fn()

function renderDialog() {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ValidateCodeDialog onClose={onClose} />
    </QueryClientProvider>,
  )
}

function enterCode(code: string) {
  fireEvent.change(screen.getByLabelText(/redemption code/i), { target: { value: code } })
}

beforeEach(() => {
  lookupRedemptionByCode.mockReset()
  validateRedemptionCode.mockReset()
  onClose.mockReset()
})

describe('ValidateCodeDialog (F2 two-step validate)', () => {
  it('renders the entry step with a code input and a note about QR in the staff app', () => {
    renderDialog()
    expect(screen.getByLabelText(/redemption code/i)).toBeInTheDocument()
    expect(screen.getByText(/staff app/i)).toBeInTheDocument()
  })

  it('displays the code grouped 4+4 as the user types (normalised)', () => {
    renderDialog()
    enterCode('a7k2p9x4')
    expect((screen.getByLabelText(/redemption code/i) as HTMLInputElement).value).toBe('A7K2 P9X4')
  })

  it('blocks a too-short code with a client format error and makes NO request', async () => {
    renderDialog()
    enterCode('A7K2')
    fireEvent.click(screen.getByRole('button', { name: /look up/i }))
    expect(await screen.findByText(/8-character code/i)).toBeInTheDocument()
    expect(lookupRedemptionByCode).not.toHaveBeenCalled()
  })

  it('looks up an awaiting code and shows the merchant-safe preview (no contact field)', async () => {
    lookupRedemptionByCode.mockResolvedValue(AWAITING)
    renderDialog()
    enterCode('A7K2P9X4')
    fireEvent.click(screen.getByRole('button', { name: /look up/i }))
    expect(await screen.findByText('Free coffee')).toBeInTheDocument()
    const panel = screen.getByRole('dialog')
    expect(within(panel).getByText('Sarah K.')).toBeInTheDocument()
    expect(within(panel).getByText('High Street')).toBeInTheDocument()
    expect(panel.textContent ?? '').not.toMatch(/@|07\d{9}|\+44|Khan/)
    expect(lookupRedemptionByCode).toHaveBeenCalledWith('A7K2P9X4')
  })

  it('confirms an awaiting code: validates, shows success, invalidates the log', async () => {
    lookupRedemptionByCode.mockResolvedValue(AWAITING)
    validateRedemptionCode.mockResolvedValue({ id: 'r1', isValidated: true })
    renderDialog()
    const invalidate = jest.spyOn(qc, 'invalidateQueries')
    enterCode('A7K2P9X4')
    fireEvent.click(screen.getByRole('button', { name: /look up/i }))
    fireEvent.click(await screen.findByRole('button', { name: /confirm validation/i }))
    expect(await screen.findByText(/is now validated/i)).toBeInTheDocument()
    expect(validateRedemptionCode).toHaveBeenCalledWith('A7K2P9X4')
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['redemptions'] })),
    )
  })

  it('an already-validated code shows the details and NO confirm action', async () => {
    lookupRedemptionByCode.mockResolvedValue(VALIDATED)
    renderDialog()
    enterCode('A7K2P9X4')
    fireEvent.click(screen.getByRole('button', { name: /look up/i }))
    expect(await screen.findByText(/already validated/i)).toBeInTheDocument()
    expect(screen.getByText('Validated in the portal')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm validation/i })).not.toBeInTheDocument()
  })

  it('maps REDEMPTION_NOT_FOUND to a clear message', async () => {
    lookupRedemptionByCode.mockRejectedValue(new ApiError(404, { error: { code: 'REDEMPTION_NOT_FOUND' } }))
    renderDialog()
    enterCode('A7K2P9X4')
    fireEvent.click(screen.getByRole('button', { name: /look up/i }))
    expect(await screen.findByText(/no redemption found for that code/i)).toBeInTheDocument()
  })

  it('maps MERCHANT_SUSPENDED to the suspended message', async () => {
    lookupRedemptionByCode.mockRejectedValue(new ApiError(403, { error: { code: 'MERCHANT_SUSPENDED' } }))
    renderDialog()
    enterCode('A7K2P9X4')
    fireEvent.click(screen.getByRole('button', { name: /look up/i }))
    expect(await screen.findByText(/your account is suspended/i)).toBeInTheDocument()
  })

  it('maps BRANCH_UNAVAILABLE at confirm time', async () => {
    lookupRedemptionByCode.mockResolvedValue(AWAITING)
    validateRedemptionCode.mockRejectedValue(new ApiError(409, { error: { code: 'BRANCH_UNAVAILABLE' } }))
    renderDialog()
    enterCode('A7K2P9X4')
    fireEvent.click(screen.getByRole('button', { name: /look up/i }))
    fireEvent.click(await screen.findByRole('button', { name: /confirm validation/i }))
    expect(await screen.findByText(/this branch is currently unavailable/i)).toBeInTheDocument()
  })

  it('defensively re-shows already-validated when confirm returns ALREADY_VALIDATED', async () => {
    lookupRedemptionByCode.mockResolvedValue(AWAITING)
    validateRedemptionCode.mockRejectedValue(new ApiError(409, { error: { code: 'ALREADY_VALIDATED' } }))
    renderDialog()
    enterCode('A7K2P9X4')
    fireEvent.click(screen.getByRole('button', { name: /look up/i }))
    fireEvent.click(await screen.findByRole('button', { name: /confirm validation/i }))
    expect(await screen.findByText(/already validated/i)).toBeInTheDocument()
  })

  it('maps an unknown error to a generic retry message', async () => {
    lookupRedemptionByCode.mockRejectedValue(new Error('network down'))
    renderDialog()
    enterCode('A7K2P9X4')
    fireEvent.click(screen.getByRole('button', { name: /look up/i }))
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
  })
})
