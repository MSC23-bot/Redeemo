/**
 * RejectEditDialog (Option B B1) — reason mandatory (soft-min), rejects via
 * useRejectEdit; the live listing is not touched.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RejectEditDialog } from '../RejectEditDialog'

const mockMutateAsync = jest.fn()
const mockMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
  error: null as unknown,
}

jest.mock('@/lib/review/useEditReview', () => ({
  useRejectEdit: jest.fn(() => mockMutation),
}))

function renderDialog(opts: { onSuccess?: () => void; onCancel?: () => void } = {}) {
  return render(
    <RejectEditDialog
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

describe('RejectEditDialog', () => {
  it('renders the dialog with the live-unchanged helper', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /reject edit/i })).toBeInTheDocument()
    expect(screen.getByTestId('reject-edit-helper')).toHaveTextContent('The live listing is not changed')
  })

  it('disables submit when the reason is empty', () => {
    renderDialog()
    expect(screen.getByTestId('reject-edit-submit')).toBeDisabled()
  })

  it('disables submit and shows the nudge below 15 chars', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('reject-edit-reason-textarea'), { target: { value: 'Too short' } })
    expect(screen.getByTestId('reject-edit-submit')).toBeDisabled()
    expect(screen.getByTestId('reject-edit-min-nudge')).toBeInTheDocument()
  })

  it('calls mutateAsync with the trimmed reason then onSuccess', async () => {
    mockMutateAsync.mockResolvedValueOnce({ rejected: true })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    fireEvent.change(screen.getByTestId('reject-edit-reason-textarea'), {
      target: { value: '  This does not match the documents  ' },
    })
    fireEvent.click(screen.getByTestId('reject-edit-submit'))
    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith('This does not match the documents')
    )
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('renders the NamedGateBanner when mutation.error is set', () => {
    const err = Object.assign(new Error('stale'), { code: 'PENDING_EDIT_NOT_ACTIONABLE' })
    const { useRejectEdit } = jest.requireMock('@/lib/review/useEditReview') as {
      useRejectEdit: jest.MockedFunction<() => typeof mockMutation>
    }
    useRejectEdit.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    expect(screen.getByTestId('named-gate-banner')).toBeInTheDocument()
  })
})
