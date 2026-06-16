/**
 * SubmitMerchantDialog (B3-web) - mandatory-reason gate, no confirmation checkbox,
 * legal-boundary copy, Submit / Resubmit CTA, submit body, error banner.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SubmitMerchantDialog } from '../SubmitMerchantDialog'

const mockMutateAsync = jest.fn()
const mockMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
  error: null as Error | null,
}

jest.mock('@/lib/merchants/useMerchantActions', () => ({
  useSubmitMerchant: jest.fn(() => mockMutation),
}))

function renderDialog(
  opts: { isResubmit?: boolean; onSuccess?: () => void; onCancel?: () => void } = {}
) {
  return render(
    <SubmitMerchantDialog
      merchantId="m-1"
      isResubmit={opts.isResubmit ?? false}
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

describe('SubmitMerchantDialog structure', () => {
  it('renders with role=dialog and the legal-boundary copy', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /submit for review/i })).toBeInTheDocument()
    const panel = screen.getByTestId('submit-merchant-dialog')
    expect(panel).toHaveTextContent(/on their behalf/i)
    expect(panel).toHaveTextContent(/does not approve the merchant/i)
    expect(panel).toHaveTextContent(/take them live/i)
    expect(panel).toHaveTextContent(/accept their contract/i)
    expect(panel).toHaveTextContent(/separate steps/i)
  })

  it('renders NO confirmation checkbox', () => {
    renderDialog()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('submit-merchant-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('SubmitMerchantDialog reason gate', () => {
  it('disables submit initially (empty reason)', () => {
    renderDialog()
    expect(screen.getByTestId('submit-merchant-submit')).toBeDisabled()
  })

  it('disables submit for a whitespace-only reason', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('submit-merchant-reason'), { target: { value: '   ' } })
    expect(screen.getByTestId('submit-merchant-submit')).toBeDisabled()
  })

  it('enables submit once a non-empty reason is entered', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('submit-merchant-reason'), { target: { value: 'Owner asked us.' } })
    expect(screen.getByTestId('submit-merchant-submit')).not.toBeDisabled()
  })

  it('stays disabled while pending', () => {
    mockMutation.isPending = true
    renderDialog()
    fireEvent.change(screen.getByTestId('submit-merchant-reason'), { target: { value: 'reason' } })
    expect(screen.getByTestId('submit-merchant-submit')).toBeDisabled()
  })
})

describe('SubmitMerchantDialog submit', () => {
  it('submits the trimmed reason and calls onSuccess', async () => {
    mockMutateAsync.mockResolvedValueOnce({ id: 'm-1', status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED', verificationStatus: 'PENDING' })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })

    fireEvent.change(screen.getByTestId('submit-merchant-reason'), { target: { value: '  Owner asked us.  ' } })
    fireEvent.click(screen.getByTestId('submit-merchant-submit'))

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    expect(mockMutateAsync).toHaveBeenCalledWith({ reason: 'Owner asked us.' })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onSuccess when the mutation rejects', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('boom'))
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })

    fireEvent.change(screen.getByTestId('submit-merchant-reason'), { target: { value: 'reason' } })
    fireEvent.click(screen.getByTestId('submit-merchant-submit'))

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    expect(onSuccess).not.toHaveBeenCalled()
  })
})

describe('SubmitMerchantDialog Submit / Resubmit CTA', () => {
  it('uses Submit for review copy by default', () => {
    renderDialog({ isResubmit: false })
    expect(screen.getByTestId('submit-merchant-submit')).toHaveTextContent('Submit for review')
  })

  it('uses Resubmit for review copy when isResubmit', () => {
    renderDialog({ isResubmit: true })
    expect(screen.getByRole('dialog', { name: /resubmit for review/i })).toBeInTheDocument()
    expect(screen.getByTestId('submit-merchant-submit')).toHaveTextContent('Resubmit for review')
  })
})

describe('SubmitMerchantDialog error banner', () => {
  it('renders NamedGateBanner when mutation.error is set (e.g. ALREADY_SUBMITTED)', () => {
    const err = Object.assign(new Error('Not submittable'), { code: 'ALREADY_SUBMITTED' })
    const { useSubmitMerchant } = jest.requireMock('@/lib/merchants/useMerchantActions') as {
      useSubmitMerchant: jest.MockedFunction<() => typeof mockMutation>
    }
    useSubmitMerchant.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    expect(screen.getByTestId('named-gate-banner')).toBeInTheDocument()
  })
})
