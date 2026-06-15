/**
 * DeleteBranchConfirm (B2.4-web) - cascade disclosure, reason gating, submit body,
 * NamedGateBanner on guard errors.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DeleteBranchConfirm } from '../DeleteBranchConfirm'

const mockMutateAsync = jest.fn()
const mockMutation = { mutateAsync: mockMutateAsync, isPending: false, error: null as Error | null }

jest.mock('@/lib/merchants/useMerchantActions', () => ({
  useDeleteBranch: jest.fn(() => mockMutation),
}))

function renderDialog(opts: { onSuccess?: () => void; onCancel?: () => void } = {}) {
  return render(
    <DeleteBranchConfirm
      branchId="br-1"
      branchName="Camden Branch"
      merchantId="m-1"
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

describe('DeleteBranchConfirm', () => {
  it('discloses the staff-login deactivation cascade + the branch name', () => {
    renderDialog()
    const warning = screen.getByTestId('delete-branch-warning')
    expect(warning).toHaveTextContent(/deactivates its staff logins/i)
    expect(warning).toHaveTextContent(/cannot be undone/i)
    expect(warning).toHaveTextContent('Camden Branch')
  })

  it('Delete disabled until a reason is given', () => {
    renderDialog()
    expect(screen.getByTestId('delete-branch-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('delete-branch-reason'), { target: { value: 'permanently closed' } })
    expect(screen.getByTestId('delete-branch-submit')).not.toBeDisabled()
  })

  it('Delete disabled when reason is whitespace-only', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('delete-branch-reason'), { target: { value: '   ' } })
    expect(screen.getByTestId('delete-branch-submit')).toBeDisabled()
  })

  it('stays disabled while pending', () => {
    mockMutation.isPending = true
    renderDialog()
    fireEvent.change(screen.getByTestId('delete-branch-reason'), { target: { value: 'r' } })
    expect(screen.getByTestId('delete-branch-submit')).toBeDisabled()
  })

  it('submits { branchId, reason } and calls onSuccess', async () => {
    mockMutateAsync.mockResolvedValueOnce({ ok: true })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    fireEvent.change(screen.getByTestId('delete-branch-reason'), { target: { value: '  permanently closed  ' } })
    fireEvent.click(screen.getByTestId('delete-branch-submit'))
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({ branchId: 'br-1', reason: 'permanently closed' }))
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('delete-branch-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders NamedGateBanner when mutation.error is set (BRANCH_LAST_ACTIVE)', () => {
    const err = Object.assign(new Error('last active'), { code: 'BRANCH_LAST_ACTIVE' })
    const { useDeleteBranch } = jest.requireMock('@/lib/merchants/useMerchantActions') as {
      useDeleteBranch: jest.MockedFunction<() => typeof mockMutation>
    }
    useDeleteBranch.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    expect(screen.getByTestId('named-gate-banner')).toBeInTheDocument()
  })
})
