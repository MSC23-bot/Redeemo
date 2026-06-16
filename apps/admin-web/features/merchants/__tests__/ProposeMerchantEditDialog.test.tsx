/**
 * ProposeMerchantEditDialog (B2.5-web) - prefill, changed-only-field submit body,
 * mandatory-reason gate, no-clear semantics, no confirmation checkbox,
 * sent-for-review copy, error banner.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProposeMerchantEditDialog } from '../ProposeMerchantEditDialog'

const mockMutateAsync = jest.fn()
const mockMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
  error: null as Error | null,
}

jest.mock('@/lib/merchants/useMerchantActions', () => ({
  useProposeMerchantEdit: jest.fn(() => mockMutation),
}))

function renderDialog(
  opts: {
    current?: { businessName: string; tradingName: string | null; description: string | null }
    onSuccess?: () => void
    onCancel?: () => void
  } = {}
) {
  return render(
    <ProposeMerchantEditDialog
      merchantId="m-1"
      current={
        opts.current ?? {
          businessName: 'Acme Coffee',
          tradingName: 'Acme',
          description: 'We sell coffee',
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

describe('ProposeMerchantEditDialog structure', () => {
  it('renders with role=dialog and the sent-for-review / on-behalf copy', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /propose identity changes/i })).toBeInTheDocument()
    const panel = screen.getByTestId('propose-merchant-edit-dialog')
    expect(panel).toHaveTextContent(/sent for review/i)
    expect(panel).toHaveTextContent(/not applied until an admin approves/i)
    expect(panel).toHaveTextContent(/on the merchant's behalf/i)
  })

  it('prefills businessName / tradingName / description from current', () => {
    renderDialog()
    expect(screen.getByTestId('propose-merchant-edit-business-name')).toHaveValue('Acme Coffee')
    expect(screen.getByTestId('propose-merchant-edit-trading-name')).toHaveValue('Acme')
    expect(screen.getByTestId('propose-merchant-edit-description')).toHaveValue('We sell coffee')
  })

  it('prefills empty for null tradingName / description', () => {
    renderDialog({ current: { businessName: 'Acme', tradingName: null, description: null } })
    expect(screen.getByTestId('propose-merchant-edit-trading-name')).toHaveValue('')
    expect(screen.getByTestId('propose-merchant-edit-description')).toHaveValue('')
  })

  it('renders NO confirmation checkbox and NO logoUrl/bannerUrl inputs', () => {
    renderDialog()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByTestId('propose-merchant-edit-logo')).not.toBeInTheDocument()
    expect(screen.queryByTestId('propose-merchant-edit-banner')).not.toBeInTheDocument()
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('propose-merchant-edit-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('ProposeMerchantEditDialog submission gating', () => {
  it('Send disabled initially (nothing changed, no reason)', () => {
    renderDialog()
    expect(screen.getByTestId('propose-merchant-edit-submit')).toBeDisabled()
  })

  it('Send disabled when a field changed but reason is empty', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('propose-merchant-edit-description'), {
      target: { value: 'A new description' },
    })
    expect(screen.getByTestId('propose-merchant-edit-submit')).toBeDisabled()
  })

  it('Send disabled when a reason is present but nothing changed', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('propose-merchant-edit-reason'), {
      target: { value: 'Some reason.' },
    })
    expect(screen.getByTestId('propose-merchant-edit-submit')).toBeDisabled()
  })

  it('Send disabled when reason is whitespace-only even with a changed field', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('propose-merchant-edit-description'), {
      target: { value: 'A new description' },
    })
    fireEvent.change(screen.getByTestId('propose-merchant-edit-reason'), { target: { value: '   ' } })
    expect(screen.getByTestId('propose-merchant-edit-submit')).toBeDisabled()
  })

  it('Send enabled when at least one field changed AND reason non-empty', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('propose-merchant-edit-description'), {
      target: { value: 'A new description' },
    })
    fireEvent.change(screen.getByTestId('propose-merchant-edit-reason'), {
      target: { value: 'Owner requested.' },
    })
    expect(screen.getByTestId('propose-merchant-edit-submit')).not.toBeDisabled()
  })

  it('Send disabled when a field is only emptied (clearing not supported)', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('propose-merchant-edit-trading-name'), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByTestId('propose-merchant-edit-reason'), {
      target: { value: 'Trying to clear.' },
    })
    // Emptying a field is not a proposable change, so there is nothing to send.
    expect(screen.getByTestId('propose-merchant-edit-submit')).toBeDisabled()
  })

  it('stays disabled while pending', () => {
    mockMutation.isPending = true
    renderDialog()
    fireEvent.change(screen.getByTestId('propose-merchant-edit-description'), {
      target: { value: 'changed' },
    })
    fireEvent.change(screen.getByTestId('propose-merchant-edit-reason'), {
      target: { value: 'reason' },
    })
    expect(screen.getByTestId('propose-merchant-edit-submit')).toBeDisabled()
  })
})

describe('ProposeMerchantEditDialog submit body (changed-only)', () => {
  it('sends ONLY the changed field + reason (description only)', async () => {
    mockMutateAsync.mockResolvedValueOnce({ pendingEditId: 'pe-1' })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })

    fireEvent.change(screen.getByTestId('propose-merchant-edit-description'), {
      target: { value: 'New bio' },
    })
    fireEvent.change(screen.getByTestId('propose-merchant-edit-reason'), {
      target: { value: '  Owner requested.  ' },
    })
    fireEvent.click(screen.getByTestId('propose-merchant-edit-submit'))

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    expect(mockMutateAsync).toHaveBeenCalledWith({ description: 'New bio', reason: 'Owner requested.' })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('omits an emptied field but sends another changed field', async () => {
    mockMutateAsync.mockResolvedValueOnce({ pendingEditId: 'pe-1' })
    renderDialog()

    // Clear tradingName (was 'Acme') + change businessName.
    fireEvent.change(screen.getByTestId('propose-merchant-edit-trading-name'), { target: { value: '' } })
    fireEvent.change(screen.getByTestId('propose-merchant-edit-business-name'), {
      target: { value: 'Acme Rebrand' },
    })
    fireEvent.change(screen.getByTestId('propose-merchant-edit-reason'), {
      target: { value: 'Companies House rename.' },
    })
    fireEvent.click(screen.getByTestId('propose-merchant-edit-submit'))

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    const arg = mockMutateAsync.mock.calls[0][0]
    expect(arg).toEqual({ businessName: 'Acme Rebrand', reason: 'Companies House rename.' })
    expect(arg).not.toHaveProperty('tradingName')
  })

  it('sends multiple changed fields together', async () => {
    mockMutateAsync.mockResolvedValueOnce({ pendingEditId: 'pe-1' })
    renderDialog()

    fireEvent.change(screen.getByTestId('propose-merchant-edit-business-name'), {
      target: { value: 'New Name' },
    })
    fireEvent.change(screen.getByTestId('propose-merchant-edit-description'), {
      target: { value: 'New bio' },
    })
    fireEvent.change(screen.getByTestId('propose-merchant-edit-reason'), {
      target: { value: 'Refresh.' },
    })
    fireEvent.click(screen.getByTestId('propose-merchant-edit-submit'))

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    expect(mockMutateAsync).toHaveBeenCalledWith({
      businessName: 'New Name',
      description: 'New bio',
      reason: 'Refresh.',
    })
  })
})

describe('ProposeMerchantEditDialog error banner', () => {
  it('renders NamedGateBanner when mutation.error is set', () => {
    const err = Object.assign(new Error('Exists'), { code: 'PENDING_EDIT_EXISTS' })
    const { useProposeMerchantEdit } = jest.requireMock('@/lib/merchants/useMerchantActions') as {
      useProposeMerchantEdit: jest.MockedFunction<() => typeof mockMutation>
    }
    useProposeMerchantEdit.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    expect(screen.getByTestId('named-gate-banner')).toBeInTheDocument()
  })
})
