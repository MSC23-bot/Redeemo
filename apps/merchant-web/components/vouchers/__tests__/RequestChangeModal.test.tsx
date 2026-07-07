import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RequestChangeModal } from '@/components/vouchers/RequestChangeModal'
import { ApiError } from '@/lib/api/client'

// Voucher governed flows (2026-07-07): the flagship "Request a change" modal
// (vouchers-6). Pins: mandatory reason, only-CHANGED fields are sent,
// PENDING_EDIT_EXISTS surfaces as a dedicated notice, and the modal is not
// dismissible (X / Cancel) while the request is in flight (P3 hardening).

const mutateAsync = jest.fn()
let isPending = false
jest.mock('@/lib/voucher/useVoucherGovernedActions', () => ({
  useRequestFlagshipChange: () => ({ mutateAsync: (...args: unknown[]) => mutateAsync(...args), isPending }),
}))

const VOUCHER = {
  id: 'rmv1',
  title: 'Free coffee with breakfast',
  description: 'Enjoy a free coffee on us.',
  terms: 'One per visit',
  estimatedSaving: 4,
}

function renderModal(onClose = jest.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    onClose,
    ...render(
      <QueryClientProvider client={qc}>
        <RequestChangeModal voucher={VOUCHER} onClose={onClose} />
      </QueryClientProvider>,
    ),
  }
}

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue({ id: 'pe1', kind: 'CHANGE', status: 'PENDING' })
  isPending = false
})

describe('RequestChangeModal', () => {
  it('requires a reason before sending', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))
    expect(await screen.findByText(/tell redeemo why you want to change this voucher/i)).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('requires at least one changed field even with a reason filled in', async () => {
    renderModal()
    fireEvent.change(screen.getByLabelText(/why do you want this change/i), { target: { value: 'Just because' } })
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))
    expect(await screen.findByTestId('request-change-modal-error')).toHaveTextContent(
      /change at least one field/i,
    )
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('sends ONLY the changed fields + the reason (title/description/terms unchanged omitted)', async () => {
    renderModal()
    fireEvent.change(screen.getByLabelText(/estimated saving/i), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText(/why do you want this change/i), { target: { value: 'Raise the saving' } })
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync).toHaveBeenCalledWith({
      id: 'rmv1',
      reason: 'Raise the saving',
      estimatedSaving: 6,
    })
  })

  it('sends only the title when only the title changes', async () => {
    renderModal()
    fireEvent.change(screen.getByLabelText(/^title$/i), { target: { value: 'An even better title' } })
    fireEvent.change(screen.getByLabelText(/why do you want this change/i), { target: { value: 'Sharper title' } })
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync).toHaveBeenCalledWith({
      id: 'rmv1',
      reason: 'Sharper title',
      title: 'An even better title',
    })
  })

  it('closes on success', async () => {
    const { onClose } = renderModal()
    fireEvent.change(screen.getByLabelText(/^title$/i), { target: { value: 'A new title' } })
    fireEvent.change(screen.getByLabelText(/why do you want this change/i), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('surfaces PENDING_EDIT_EXISTS as a dedicated notice, not a generic error', async () => {
    mutateAsync.mockRejectedValue(new ApiError(409, { error: { code: 'PENDING_EDIT_EXISTS', message: 'x' } }))
    renderModal()
    fireEvent.change(screen.getByLabelText(/^title$/i), { target: { value: 'A new title' } })
    fireEvent.change(screen.getByLabelText(/why do you want this change/i), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))
    expect(await screen.findByTestId('request-change-pending-exists')).toBeInTheDocument()
    expect(screen.queryByTestId('request-change-modal-error')).toBeNull()
  })

  it('surfaces a mapped field-level error (RMV_FIELD_NOT_ALLOWED)', async () => {
    mutateAsync.mockRejectedValue(new ApiError(400, { error: { code: 'RMV_FIELD_NOT_ALLOWED', message: 'x' } }))
    renderModal()
    fireEvent.change(screen.getByLabelText(/^title$/i), { target: { value: 'A new title' } })
    fireEvent.change(screen.getByLabelText(/why do you want this change/i), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))
    expect(await screen.findByTestId('request-change-modal-error')).toHaveTextContent(/cannot be requested/i)
  })

  it('is not dismissible (X, Cancel) while the request is in flight', async () => {
    isPending = true
    const onClose = jest.fn()
    renderModal(onClose)
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }))
    expect(onClose).not.toHaveBeenCalled()
    // Cancel/X/Send are all disabled while busy.
    expect(screen.getByRole('button', { name: /^close$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDisabled()
  })
})
