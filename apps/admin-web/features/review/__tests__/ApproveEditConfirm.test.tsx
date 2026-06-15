/**
 * ApproveEditConfirm (Option B B1) — applies the edit via useApproveEdit; shows
 * the error banner on failure; never optimistically marks applied.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApproveEditConfirm } from '../ApproveEditConfirm'

const mockMutateAsync = jest.fn()
const mockMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
  error: null as unknown,
}

jest.mock('@/lib/review/useEditReview', () => ({
  useApproveEdit: jest.fn(() => mockMutation),
}))

function renderDialog(opts: { onSuccess?: () => void; onCancel?: () => void } = {}) {
  return render(
    <ApproveEditConfirm
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

describe('ApproveEditConfirm', () => {
  it('renders the dialog with consequences copy', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /apply this change/i })).toBeInTheDocument()
    expect(screen.getByTestId('approve-edit-consequences-copy')).toHaveTextContent('applied to the live listing')
  })

  it('calls mutateAsync then onSuccess on Apply', async () => {
    mockMutateAsync.mockResolvedValueOnce({ approved: true })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    fireEvent.click(screen.getByTestId('approve-edit-submit'))
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onSuccess when the mutation throws (no optimistic mark)', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('boom'))
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    fireEvent.click(screen.getByTestId('approve-edit-submit'))
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('renders the NamedGateBanner when mutation.error is set', () => {
    const err = Object.assign(new Error('Not actionable'), { code: 'EDIT_PHOTO_APPLY_NOT_SUPPORTED' })
    const { useApproveEdit } = jest.requireMock('@/lib/review/useEditReview') as {
      useApproveEdit: jest.MockedFunction<() => typeof mockMutation>
    }
    useApproveEdit.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    expect(screen.getByTestId('approve-edit-error-banner')).toBeInTheDocument()
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('approve-edit-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
