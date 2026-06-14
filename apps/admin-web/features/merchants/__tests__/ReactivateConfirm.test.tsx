/**
 * ReactivateConfirm — confirm calls reactivate, copy, MERCHANT_NOT_SUSPENDED banner.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReactivateConfirm } from '../ReactivateConfirm'
import { ApiError } from '@/lib/api/client'

const mockMutateAsync = jest.fn()
const mockMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
  error: null as Error | null,
}

jest.mock('@/lib/merchants/useMerchantActions', () => ({
  useReactivate: jest.fn(() => mockMutation),
}))

function renderDialog(opts: { onSuccess?: () => void; onCancel?: () => void } = {}) {
  return render(
    <ReactivateConfirm
      merchantId="m-1"
      approvalId="apr-1"
      onSuccess={opts.onSuccess ?? jest.fn()}
      onCancel={opts.onCancel ?? jest.fn()}
    />
  )
}

afterEach(() => {
  jest.clearAllMocks()
  mockMutation.isPending = false
  mockMutation.error = null
})

describe('ReactivateConfirm structure', () => {
  it('renders with role=dialog and the restore-access copy', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /reactivate merchant/i })).toBeInTheDocument()
    expect(screen.getByTestId('reactivate-consequence-copy')).toHaveTextContent(
      'Reactivate this merchant and restore their access and offers?'
    )
  })

  it('calls onCancel from Cancel and from the scrim', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('reactivate-cancel'))
    fireEvent.click(screen.getByTestId('reactivate-scrim'))
    expect(onCancel).toHaveBeenCalledTimes(2)
  })
})

describe('ReactivateConfirm submit', () => {
  it('calls reactivate and onSuccess on confirm', async () => {
    mockMutateAsync.mockResolvedValueOnce({ reactivated: true, alreadyActive: false })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    fireEvent.click(screen.getByTestId('reactivate-submit'))
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('does not call onSuccess when the mutation rejects', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('boom'))
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    fireEvent.click(screen.getByTestId('reactivate-submit'))
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    expect(onSuccess).not.toHaveBeenCalled()
  })
})

describe('ReactivateConfirm pending state', () => {
  it('disables the confirm button while the mutation is pending', () => {
    mockMutation.isPending = true
    renderDialog()
    expect(screen.getByTestId('reactivate-submit')).toBeDisabled()
  })
})

describe('ReactivateConfirm error banner', () => {
  it('renders the MERCHANT_NOT_SUSPENDED copy when the mutation errors', () => {
    const err = new ApiError(409, { error: { code: 'MERCHANT_NOT_SUSPENDED', message: 'Not suspended' } })
    const { useReactivate } = jest.requireMock('@/lib/merchants/useMerchantActions') as {
      useReactivate: jest.MockedFunction<() => typeof mockMutation>
    }
    useReactivate.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    expect(screen.getByTestId('reactivate-error-banner')).toBeInTheDocument()
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'This merchant is not suspended, so it cannot be reactivated.'
    )
  })
})
