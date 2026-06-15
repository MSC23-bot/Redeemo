/**
 * EditBranchDialog - reason gating, phone/email/website prefill+clear, isActive
 * checkbox toggle, submit body carries ONLY the four fields + reason, error
 * banner, on-behalf copy.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EditBranchDialog } from '../EditBranchDialog'

const mockMutateAsync = jest.fn()
const mockMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
  error: null as Error | null,
}

jest.mock('@/lib/merchants/useMerchantActions', () => ({
  useEditBranch: jest.fn(() => mockMutation),
}))

function renderDialog(
  opts: {
    current?: { phone: string | null; email: string | null; websiteUrl: string | null; isActive: boolean }
    onSuccess?: () => void
    onCancel?: () => void
  } = {}
) {
  return render(
    <EditBranchDialog
      branchId="br-1"
      merchantId="m-1"
      current={
        opts.current ?? {
          phone: '+447700900123',
          email: 'main@acme.test',
          websiteUrl: 'https://acme.test',
          isActive: true,
        }
      }
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

describe('EditBranchDialog structure', () => {
  it('renders with role=dialog and the on-behalf audit copy', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /edit branch/i })).toBeInTheDocument()
    expect(screen.getByTestId('edit-branch-dialog')).toHaveTextContent(/audit log/i)
    expect(screen.getByTestId('edit-branch-dialog')).toHaveTextContent(
      /on the merchant's behalf/i
    )
  })

  it('prefills phone / email / website / active from current', () => {
    renderDialog()
    expect(screen.getByTestId('edit-branch-phone')).toHaveValue('+447700900123')
    expect(screen.getByTestId('edit-branch-email')).toHaveValue('main@acme.test')
    expect(screen.getByTestId('edit-branch-website')).toHaveValue('https://acme.test')
    expect(screen.getByTestId('edit-branch-active-checkbox')).toBeChecked()
  })

  it('prefills empty fields and unchecked active when current values are null/false', () => {
    renderDialog({
      current: { phone: null, email: null, websiteUrl: null, isActive: false },
    })
    expect(screen.getByTestId('edit-branch-phone')).toHaveValue('')
    expect(screen.getByTestId('edit-branch-email')).toHaveValue('')
    expect(screen.getByTestId('edit-branch-website')).toHaveValue('')
    expect(screen.getByTestId('edit-branch-active-checkbox')).not.toBeChecked()
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('edit-branch-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('EditBranchDialog submission gating', () => {
  it('Save disabled when reason is empty', () => {
    renderDialog()
    expect(screen.getByTestId('edit-branch-submit')).toBeDisabled()
  })

  it('Save disabled when reason is whitespace-only', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('edit-branch-reason'), { target: { value: '   ' } })
    expect(screen.getByTestId('edit-branch-submit')).toBeDisabled()
  })

  it('Save enabled when reason is non-empty', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('edit-branch-reason'), {
      target: { value: 'Owner asked to update contacts.' },
    })
    expect(screen.getByTestId('edit-branch-submit')).not.toBeDisabled()
  })

  it('stays disabled while pending', () => {
    mockMutation.isPending = true
    renderDialog()
    fireEvent.change(screen.getByTestId('edit-branch-reason'), { target: { value: 'reason' } })
    expect(screen.getByTestId('edit-branch-submit')).toBeDisabled()
  })
})

describe('EditBranchDialog isActive toggle', () => {
  it('toggles the active checkbox', () => {
    renderDialog()
    const cb = screen.getByTestId('edit-branch-active-checkbox')
    expect(cb).toBeChecked()
    fireEvent.click(cb)
    expect(cb).not.toBeChecked()
  })
})

describe('EditBranchDialog submit', () => {
  it('submits ONLY { branchId, input } where input has exactly phone/email/websiteUrl/isActive/reason', async () => {
    mockMutateAsync.mockResolvedValueOnce({ id: 'br-1' })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })

    fireEvent.change(screen.getByTestId('edit-branch-phone'), {
      target: { value: '+447700900000' },
    })
    fireEvent.change(screen.getByTestId('edit-branch-email'), {
      target: { value: 'new@branch.test' },
    })
    fireEvent.change(screen.getByTestId('edit-branch-website'), {
      target: { value: 'https://branch.test' },
    })
    fireEvent.click(screen.getByTestId('edit-branch-active-checkbox')) // true -> false
    fireEvent.change(screen.getByTestId('edit-branch-reason'), {
      target: { value: '  Owner asked to close this branch.  ' },
    })
    fireEvent.click(screen.getByTestId('edit-branch-submit'))

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    const arg = mockMutateAsync.mock.calls[0][0]
    expect(arg.branchId).toBe('br-1')
    expect(Object.keys(arg.input).sort()).toEqual(
      ['email', 'isActive', 'phone', 'reason', 'websiteUrl'].sort()
    )
    expect(arg.input).toEqual({
      phone: '+447700900000',
      email: 'new@branch.test',
      websiteUrl: 'https://branch.test',
      isActive: false,
      reason: 'Owner asked to close this branch.',
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('sends null for cleared contact fields', async () => {
    mockMutateAsync.mockResolvedValueOnce({ id: 'br-1' })
    renderDialog()
    fireEvent.change(screen.getByTestId('edit-branch-phone'), { target: { value: '' } })
    fireEvent.change(screen.getByTestId('edit-branch-email'), { target: { value: '' } })
    fireEvent.change(screen.getByTestId('edit-branch-website'), { target: { value: '' } })
    fireEvent.change(screen.getByTestId('edit-branch-reason'), {
      target: { value: 'Cleared stale contacts.' },
    })
    fireEvent.click(screen.getByTestId('edit-branch-submit'))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        branchId: 'br-1',
        input: {
          phone: null,
          email: null,
          websiteUrl: null,
          isActive: true,
          reason: 'Cleared stale contacts.',
        },
      })
    })
  })
})

describe('EditBranchDialog error banner', () => {
  it('renders NamedGateBanner when mutation.error is set', () => {
    const err = Object.assign(new Error('Not found'), { code: 'BRANCH_NOT_FOUND' })
    const { useEditBranch } = jest.requireMock('@/lib/merchants/useMerchantActions') as {
      useEditBranch: jest.MockedFunction<() => typeof mockMutation>
    }
    useEditBranch.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    expect(screen.getByTestId('named-gate-banner')).toBeInTheDocument()
  })
})
