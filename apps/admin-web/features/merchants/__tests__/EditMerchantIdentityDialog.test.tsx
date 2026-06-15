/**
 * EditMerchantIdentityDialog (B2.2) - reason + confirm gating, vat/company
 * prefill+clear, submit body carries ONLY vat/company + reason + confirm:true,
 * error banner, on-behalf copy.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EditMerchantIdentityDialog } from '../EditMerchantIdentityDialog'

const mockMutateAsync = jest.fn()
const mockMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
  error: null as Error | null,
}

jest.mock('@/lib/merchants/useMerchantActions', () => ({
  useEditMerchantIdentity: jest.fn(() => mockMutation),
}))

function renderDialog(
  opts: {
    currentVatNumber?: string | null
    currentCompanyNumber?: string | null
    onSuccess?: () => void
    onCancel?: () => void
  } = {}
) {
  return render(
    <EditMerchantIdentityDialog
      merchantId="m-1"
      currentVatNumber={opts.currentVatNumber ?? 'GB123456789'}
      currentCompanyNumber={opts.currentCompanyNumber ?? '12345678'}
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

describe('EditMerchantIdentityDialog structure', () => {
  it('renders with role=dialog and the on-behalf audit copy', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /business registration/i })).toBeInTheDocument()
    expect(screen.getByTestId('edit-merchant-identity-dialog')).toHaveTextContent(/audit log/i)
    expect(screen.getByTestId('edit-merchant-identity-dialog')).toHaveTextContent(
      /on the merchant's behalf/i
    )
  })

  it('prefills vat / company from current', () => {
    renderDialog()
    expect(screen.getByTestId('edit-merchant-identity-vat')).toHaveValue('GB123456789')
    expect(screen.getByTestId('edit-merchant-identity-company')).toHaveValue('12345678')
  })

  it('prefills empty fields when current values are null', () => {
    renderDialog({ currentVatNumber: null, currentCompanyNumber: null })
    expect(screen.getByTestId('edit-merchant-identity-vat')).toHaveValue('')
    expect(screen.getByTestId('edit-merchant-identity-company')).toHaveValue('')
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('edit-merchant-identity-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('EditMerchantIdentityDialog submission gating (reason AND confirm)', () => {
  it('Save disabled initially (no reason, unconfirmed)', () => {
    renderDialog()
    expect(screen.getByTestId('edit-merchant-identity-submit')).toBeDisabled()
  })

  it('Save disabled when confirmed but reason empty', () => {
    renderDialog()
    fireEvent.click(screen.getByTestId('edit-merchant-identity-confirm'))
    expect(screen.getByTestId('edit-merchant-identity-submit')).toBeDisabled()
  })

  it('Save disabled when reason present but NOT confirmed', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('edit-merchant-identity-reason'), {
      target: { value: 'Companies House correction.' },
    })
    expect(screen.getByTestId('edit-merchant-identity-submit')).toBeDisabled()
  })

  it('Save disabled when reason is whitespace-only even if confirmed', () => {
    renderDialog()
    fireEvent.click(screen.getByTestId('edit-merchant-identity-confirm'))
    fireEvent.change(screen.getByTestId('edit-merchant-identity-reason'), { target: { value: '   ' } })
    expect(screen.getByTestId('edit-merchant-identity-submit')).toBeDisabled()
  })

  it('Save enabled when reason non-empty AND confirmed', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('edit-merchant-identity-reason'), {
      target: { value: 'Companies House correction.' },
    })
    fireEvent.click(screen.getByTestId('edit-merchant-identity-confirm'))
    expect(screen.getByTestId('edit-merchant-identity-submit')).not.toBeDisabled()
  })

  it('stays disabled while pending', () => {
    mockMutation.isPending = true
    renderDialog()
    fireEvent.change(screen.getByTestId('edit-merchant-identity-reason'), { target: { value: 'reason' } })
    fireEvent.click(screen.getByTestId('edit-merchant-identity-confirm'))
    expect(screen.getByTestId('edit-merchant-identity-submit')).toBeDisabled()
  })
})

describe('EditMerchantIdentityDialog submit', () => {
  it('submits ONLY { vatNumber, companyNumber, reason, confirm } with confirm:true', async () => {
    mockMutateAsync.mockResolvedValueOnce({ id: 'm-1' })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })

    fireEvent.change(screen.getByTestId('edit-merchant-identity-vat'), { target: { value: 'GB999' } })
    fireEvent.change(screen.getByTestId('edit-merchant-identity-company'), { target: { value: '87654321' } })
    fireEvent.change(screen.getByTestId('edit-merchant-identity-reason'), {
      target: { value: '  Companies House correction.  ' },
    })
    fireEvent.click(screen.getByTestId('edit-merchant-identity-confirm'))
    fireEvent.click(screen.getByTestId('edit-merchant-identity-submit'))

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    const arg = mockMutateAsync.mock.calls[0][0]
    expect(Object.keys(arg).sort()).toEqual(['companyNumber', 'confirm', 'reason', 'vatNumber'].sort())
    expect(arg).toEqual({
      vatNumber: 'GB999',
      companyNumber: '87654321',
      reason: 'Companies House correction.',
      confirm: true,
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('sends null for cleared vat/company fields', async () => {
    mockMutateAsync.mockResolvedValueOnce({ id: 'm-1' })
    renderDialog()
    fireEvent.change(screen.getByTestId('edit-merchant-identity-vat'), { target: { value: '' } })
    fireEvent.change(screen.getByTestId('edit-merchant-identity-company'), { target: { value: '' } })
    fireEvent.change(screen.getByTestId('edit-merchant-identity-reason'), {
      target: { value: 'Cleared stale registration.' },
    })
    fireEvent.click(screen.getByTestId('edit-merchant-identity-confirm'))
    fireEvent.click(screen.getByTestId('edit-merchant-identity-submit'))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        vatNumber: null,
        companyNumber: null,
        reason: 'Cleared stale registration.',
        confirm: true,
      })
    })
  })
})

describe('EditMerchantIdentityDialog error banner', () => {
  it('renders NamedGateBanner when mutation.error is set', () => {
    const err = Object.assign(new Error('Not found'), { code: 'MERCHANT_NOT_FOUND' })
    const { useEditMerchantIdentity } = jest.requireMock('@/lib/merchants/useMerchantActions') as {
      useEditMerchantIdentity: jest.MockedFunction<() => typeof mockMutation>
    }
    useEditMerchantIdentity.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    expect(screen.getByTestId('named-gate-banner')).toBeInTheDocument()
  })
})
