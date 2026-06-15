/**
 * AddBranchDialog (B2.4-web) - required-field + reason gating, submit body (blank
 * optionals omitted), NamedGateBanner on postcode errors.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AddBranchDialog } from '../AddBranchDialog'

const mockMutateAsync = jest.fn()
const mockMutation = { mutateAsync: mockMutateAsync, isPending: false, error: null as Error | null }

jest.mock('@/lib/merchants/useMerchantActions', () => ({
  useCreateBranch: jest.fn(() => mockMutation),
}))

function renderDialog(opts: { onSuccess?: () => void; onCancel?: () => void } = {}) {
  return render(<AddBranchDialog merchantId="m-1" onSuccess={opts.onSuccess ?? jest.fn()} onCancel={opts.onCancel ?? jest.fn()} />)
}

function fillRequired() {
  fireEvent.change(screen.getByTestId('add-branch-name'), { target: { value: 'New Branch' } })
  fireEvent.change(screen.getByTestId('add-branch-address1'), { target: { value: '1 High St' } })
  fireEvent.change(screen.getByTestId('add-branch-city'), { target: { value: 'London' } })
  fireEvent.change(screen.getByTestId('add-branch-postcode'), { target: { value: 'EC1A 1BB' } })
}

afterEach(() => {
  jest.clearAllMocks()
  mockMutation.isPending = false
  mockMutation.error = null
})

describe('AddBranchDialog structure + gating', () => {
  it('renders role=dialog with the on-behalf audit copy', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /add branch/i })).toBeInTheDocument()
    expect(screen.getByTestId('add-branch-dialog')).toHaveTextContent(/audit log/i)
    expect(screen.getByTestId('add-branch-dialog')).toHaveTextContent(/on the merchant's behalf/i)
  })

  it('Add disabled until all required fields + reason are filled', () => {
    renderDialog()
    expect(screen.getByTestId('add-branch-submit')).toBeDisabled()
    fillRequired()
    expect(screen.getByTestId('add-branch-submit')).toBeDisabled() // still no reason
    fireEvent.change(screen.getByTestId('add-branch-reason'), { target: { value: 'merchant asked' } })
    expect(screen.getByTestId('add-branch-submit')).not.toBeDisabled()
  })

  it('Add disabled when a required field (postcode) is missing', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('add-branch-name'), { target: { value: 'X' } })
    fireEvent.change(screen.getByTestId('add-branch-address1'), { target: { value: '1 St' } })
    fireEvent.change(screen.getByTestId('add-branch-city'), { target: { value: 'London' } })
    fireEvent.change(screen.getByTestId('add-branch-reason'), { target: { value: 'r' } })
    expect(screen.getByTestId('add-branch-submit')).toBeDisabled()
  })

  it('stays disabled while pending', () => {
    mockMutation.isPending = true
    renderDialog()
    fillRequired()
    fireEvent.change(screen.getByTestId('add-branch-reason'), { target: { value: 'r' } })
    expect(screen.getByTestId('add-branch-submit')).toBeDisabled()
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('add-branch-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('AddBranchDialog submit', () => {
  it('submits required fields + reason, omitting blank optionals', async () => {
    mockMutateAsync.mockResolvedValueOnce({ id: 'br-new' })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    fillRequired()
    fireEvent.change(screen.getByTestId('add-branch-reason'), { target: { value: '  merchant asked  ' } })
    fireEvent.click(screen.getByTestId('add-branch-submit'))

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    const arg = mockMutateAsync.mock.calls[0][0]
    expect(arg).toEqual({
      name: 'New Branch', addressLine1: '1 High St', addressLine2: undefined,
      city: 'London', postcode: 'EC1A 1BB', phone: undefined, email: undefined, websiteUrl: undefined,
      reason: 'merchant asked',
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('includes a filled optional (phone) in the body', async () => {
    mockMutateAsync.mockResolvedValueOnce({ id: 'br-new' })
    renderDialog()
    fillRequired()
    fireEvent.change(screen.getByTestId('add-branch-phone'), { target: { value: '+44 20 7946 0000' } })
    fireEvent.change(screen.getByTestId('add-branch-reason'), { target: { value: 'r' } })
    fireEvent.click(screen.getByTestId('add-branch-submit'))
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled())
    expect(mockMutateAsync.mock.calls[0][0].phone).toBe('+44 20 7946 0000')
  })
})

describe('AddBranchDialog error banner', () => {
  it('renders NamedGateBanner when mutation.error is set (POSTCODE_NOT_FOUND)', () => {
    const err = Object.assign(new Error('Bad postcode'), { code: 'POSTCODE_NOT_FOUND' })
    const { useCreateBranch } = jest.requireMock('@/lib/merchants/useMerchantActions') as {
      useCreateBranch: jest.MockedFunction<() => typeof mockMutation>
    }
    useCreateBranch.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    expect(screen.getByTestId('named-gate-banner')).toBeInTheDocument()
  })
})
