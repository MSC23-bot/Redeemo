/**
 * EditMerchantWebsiteDialog - reason gating, website prefill/clear, submit calls
 * editProfile with { websiteUrl, reason }, error banner, on-behalf copy.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EditMerchantWebsiteDialog } from '../EditMerchantWebsiteDialog'

const mockMutateAsync = jest.fn()
const mockMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
  error: null as Error | null,
}

jest.mock('@/lib/merchants/useMerchantActions', () => ({
  useEditMerchantProfile: jest.fn(() => mockMutation),
}))

function renderDialog(
  opts: {
    currentWebsiteUrl?: string | null
    onSuccess?: () => void
    onCancel?: () => void
  } = {}
) {
  const currentWebsiteUrl =
    'currentWebsiteUrl' in opts ? (opts.currentWebsiteUrl as string | null) : 'https://acme.test'
  return render(
    <EditMerchantWebsiteDialog
      merchantId="m-1"
      currentWebsiteUrl={currentWebsiteUrl}
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

describe('EditMerchantWebsiteDialog structure', () => {
  it('renders with role=dialog and the on-behalf audit copy', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /edit merchant website/i })).toBeInTheDocument()
    expect(screen.getByTestId('edit-merchant-website-dialog')).toHaveTextContent(
      /audit log/i
    )
    expect(screen.getByTestId('edit-merchant-website-dialog')).toHaveTextContent(
      /on the merchant's behalf/i
    )
  })

  it('prefills the website input from currentWebsiteUrl', () => {
    renderDialog({ currentWebsiteUrl: 'https://acme.test' })
    expect(screen.getByTestId('edit-merchant-website-input')).toHaveValue('https://acme.test')
  })

  it('prefills empty when currentWebsiteUrl is null', () => {
    renderDialog({ currentWebsiteUrl: null })
    expect(screen.getByTestId('edit-merchant-website-input')).toHaveValue('')
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('edit-merchant-website-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('EditMerchantWebsiteDialog submission gating', () => {
  it('Save disabled when reason is empty', () => {
    renderDialog()
    expect(screen.getByTestId('edit-merchant-website-submit')).toBeDisabled()
  })

  it('Save disabled when reason is whitespace-only', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('edit-merchant-website-reason'), {
      target: { value: '   ' },
    })
    expect(screen.getByTestId('edit-merchant-website-submit')).toBeDisabled()
  })

  it('Save enabled when reason is non-empty', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('edit-merchant-website-reason'), {
      target: { value: 'Owner asked over the phone.' },
    })
    expect(screen.getByTestId('edit-merchant-website-submit')).not.toBeDisabled()
  })

  it('stays disabled while pending', () => {
    mockMutation.isPending = true
    renderDialog()
    fireEvent.change(screen.getByTestId('edit-merchant-website-reason'), {
      target: { value: 'Owner asked.' },
    })
    expect(screen.getByTestId('edit-merchant-website-submit')).toBeDisabled()
  })
})

describe('EditMerchantWebsiteDialog submit', () => {
  it('calls editProfile with { websiteUrl, reason } and onSuccess', async () => {
    mockMutateAsync.mockResolvedValueOnce({ id: 'm-1' })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    fireEvent.change(screen.getByTestId('edit-merchant-website-input'), {
      target: { value: 'https://new.test' },
    })
    fireEvent.change(screen.getByTestId('edit-merchant-website-reason'), {
      target: { value: '  Owner asked over the phone.  ' },
    })
    fireEvent.click(screen.getByTestId('edit-merchant-website-submit'))
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        websiteUrl: 'https://new.test',
        reason: 'Owner asked over the phone.',
      })
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('sends websiteUrl: null when the field is cleared', async () => {
    mockMutateAsync.mockResolvedValueOnce({ id: 'm-1' })
    renderDialog({ currentWebsiteUrl: 'https://acme.test' })
    fireEvent.change(screen.getByTestId('edit-merchant-website-input'), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByTestId('edit-merchant-website-reason'), {
      target: { value: 'Removed dead link.' },
    })
    fireEvent.click(screen.getByTestId('edit-merchant-website-submit'))
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        websiteUrl: null,
        reason: 'Removed dead link.',
      })
    })
  })
})

describe('EditMerchantWebsiteDialog error banner', () => {
  it('renders NamedGateBanner when mutation.error is set', () => {
    const err = Object.assign(new Error('Not found'), { code: 'MERCHANT_NOT_FOUND' })
    const { useEditMerchantProfile } = jest.requireMock(
      '@/lib/merchants/useMerchantActions'
    ) as { useEditMerchantProfile: jest.MockedFunction<() => typeof mockMutation> }
    useEditMerchantProfile.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    expect(screen.getByTestId('named-gate-banner')).toBeInTheDocument()
  })
})
