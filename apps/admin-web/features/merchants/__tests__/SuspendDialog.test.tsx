/**
 * SuspendDialog — reason + confirmation gating, serious consequence copy,
 * submit calls suspend with the trimmed reason, error banner.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SuspendDialog } from '../SuspendDialog'

const mockMutateAsync = jest.fn()
const mockMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
  error: null as Error | null,
}

jest.mock('@/lib/merchants/useMerchantActions', () => ({
  useSuspend: jest.fn(() => mockMutation),
}))

function renderDialog(opts: { onSuccess?: () => void; onCancel?: () => void } = {}) {
  return render(
    <SuspendDialog
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

describe('SuspendDialog structure', () => {
  it('renders with role=dialog', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /suspend merchant/i })).toBeInTheDocument()
  })

  it('renders the serious consequence copy', () => {
    renderDialog()
    const copy = screen.getByTestId('suspend-consequence-copy')
    expect(copy).toHaveTextContent('non-operational within seconds')
    expect(copy).toHaveTextContent('their offers stop')
    expect(copy).toHaveTextContent('signed out')
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('suspend-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when the scrim is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('suspend-scrim'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('SuspendDialog submission gating', () => {
  it('submit disabled when reason empty and checkbox unchecked', () => {
    renderDialog()
    expect(screen.getByTestId('suspend-submit')).toBeDisabled()
  })

  it('submit disabled when reason filled but checkbox unchecked', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('suspend-reason-textarea'), {
      target: { value: 'Repeated fraud reports.' },
    })
    expect(screen.getByTestId('suspend-submit')).toBeDisabled()
  })

  it('submit disabled when checkbox checked but reason empty', () => {
    renderDialog()
    fireEvent.click(screen.getByTestId('suspend-confirm-checkbox'))
    expect(screen.getByTestId('suspend-submit')).toBeDisabled()
  })

  it('submit disabled when reason is whitespace-only even with checkbox checked', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('suspend-reason-textarea'), {
      target: { value: '    ' },
    })
    fireEvent.click(screen.getByTestId('suspend-confirm-checkbox'))
    expect(screen.getByTestId('suspend-submit')).toBeDisabled()
  })

  it('submit enabled when reason non-empty AND checkbox checked', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('suspend-reason-textarea'), {
      target: { value: 'Repeated fraud reports.' },
    })
    fireEvent.click(screen.getByTestId('suspend-confirm-checkbox'))
    expect(screen.getByTestId('suspend-submit')).not.toBeDisabled()
  })

  it('stays disabled while pending', () => {
    mockMutation.isPending = true
    renderDialog()
    fireEvent.change(screen.getByTestId('suspend-reason-textarea'), {
      target: { value: 'Repeated fraud reports.' },
    })
    fireEvent.click(screen.getByTestId('suspend-confirm-checkbox'))
    expect(screen.getByTestId('suspend-submit')).toBeDisabled()
  })
})

describe('SuspendDialog submit', () => {
  it('calls suspend with the trimmed reason and calls onSuccess', async () => {
    mockMutateAsync.mockResolvedValueOnce({ suspended: true, alreadySuspended: false })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    fireEvent.change(screen.getByTestId('suspend-reason-textarea'), {
      target: { value: '  Repeated fraud reports.  ' },
    })
    fireEvent.click(screen.getByTestId('suspend-confirm-checkbox'))
    fireEvent.click(screen.getByTestId('suspend-submit'))
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith('Repeated fraud reports.')
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })
})

describe('SuspendDialog error banner', () => {
  it('renders NamedGateBanner when mutation.error is set', () => {
    const err = Object.assign(new Error('Not found'), { code: 'MERCHANT_NOT_FOUND' })
    const { useSuspend } = jest.requireMock('@/lib/merchants/useMerchantActions') as {
      useSuspend: jest.MockedFunction<() => typeof mockMutation>
    }
    useSuspend.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    expect(screen.getByTestId('named-gate-banner')).toBeInTheDocument()
  })
})
