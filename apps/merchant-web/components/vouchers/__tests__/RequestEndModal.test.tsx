import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RequestEndModal } from '@/components/vouchers/RequestEndModal'
import { ApiError } from '@/lib/api/client'

// Voucher governed flows (2026-07-07): the custom-voucher "Request to end"
// modal (vouchers-4). Pins: mandatory reason, PENDING_EDIT_EXISTS surfaces as a
// dedicated notice, not dismissible while in flight.

const mutateAsync = jest.fn()
let isPending = false
jest.mock('@/lib/voucher/useVoucherGovernedActions', () => ({
  useRequestVoucherEnd: () => ({ mutateAsync: (...args: unknown[]) => mutateAsync(...args), isPending }),
}))

function renderModal(onClose = jest.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    onClose,
    ...render(
      <QueryClientProvider client={qc}>
        <RequestEndModal voucherId="v1" voucherTitle="Buy one get one free" onClose={onClose} />
      </QueryClientProvider>,
    ),
  }
}

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue({ id: 'pe2', kind: 'END', status: 'PENDING' })
  isPending = false
})

describe('RequestEndModal', () => {
  it('requires a reason before sending', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))
    expect(await screen.findByTestId('request-end-field-error')).toHaveTextContent(
      /tell redeemo why you want to end this voucher/i,
    )
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('sends the reason and closes on success', async () => {
    const { onClose } = renderModal()
    fireEvent.change(screen.getByLabelText(/why do you want to end this voucher/i), {
      target: { value: 'Retiring this offer' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: 'v1', reason: 'Retiring this offer' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('surfaces PENDING_EDIT_EXISTS as a dedicated notice', async () => {
    mutateAsync.mockRejectedValue(new ApiError(409, { error: { code: 'PENDING_EDIT_EXISTS', message: 'x' } }))
    renderModal()
    fireEvent.change(screen.getByLabelText(/why do you want to end this voucher/i), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))
    expect(await screen.findByTestId('request-end-pending-exists')).toBeInTheDocument()
  })

  it('is not dismissible while in flight', () => {
    isPending = true
    const onClose = jest.fn()
    renderModal(onClose)
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDisabled()
  })
})
