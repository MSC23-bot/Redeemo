/**
 * RejectDialog — reason + confirmation gating, consequence copy, submit, error banner.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RejectDialog } from '../RejectDialog'

// ── Mock useReject ────────────────────────────────────────────────────────────

const mockMutateAsync = jest.fn()
const mockMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
  error: null,
}

jest.mock('@/lib/review/useReviewActions', () => ({
  useReject: jest.fn(() => mockMutation),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderDialog(opts: { onSuccess?: () => void; onCancel?: () => void } = {}) {
  return render(
    <RejectDialog
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

// ── Structure ─────────────────────────────────────────────────────────────────

describe('RejectDialog structure', () => {
  it('renders the dialog with role=dialog', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /reject application/i })).toBeInTheDocument()
  })

  it('renders the consequence copy about inactive + email', () => {
    renderDialog()
    const copy = screen.getByTestId('reject-consequence-copy')
    expect(copy).toHaveTextContent('inactive')
    expect(copy).toHaveTextContent('emails them')
    expect(copy).toHaveTextContent('cannot be self-undone')
  })

  it('renders the confirmation checkbox', () => {
    renderDialog()
    expect(screen.getByTestId('reject-confirm-checkbox')).toBeInTheDocument()
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('reject-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when scrim is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('reject-scrim'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

// ── Submission gating ─────────────────────────────────────────────────────────

describe('RejectDialog submission gating', () => {
  it('submit is disabled when reason is empty and checkbox is unchecked', () => {
    renderDialog()
    expect(screen.getByTestId('reject-submit')).toBeDisabled()
  })

  it('submit is disabled when reason is filled but checkbox is unchecked', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('reject-reason-textarea'), {
      target: { value: 'Duplicate account detected.' },
    })
    expect(screen.getByTestId('reject-submit')).toBeDisabled()
  })

  it('submit is disabled when checkbox is checked but reason is empty', () => {
    renderDialog()
    fireEvent.click(screen.getByTestId('reject-confirm-checkbox'))
    expect(screen.getByTestId('reject-submit')).toBeDisabled()
  })

  it('submit is enabled when reason is non-empty AND checkbox is checked', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('reject-reason-textarea'), {
      target: { value: 'Duplicate account.' },
    })
    fireEvent.click(screen.getByTestId('reject-confirm-checkbox'))
    expect(screen.getByTestId('reject-submit')).not.toBeDisabled()
  })
})

// ── Submit ────────────────────────────────────────────────────────────────────

describe('RejectDialog submit', () => {
  it('calls mutateAsync with the trimmed reason and calls onSuccess', async () => {
    mockMutateAsync.mockResolvedValueOnce({ rejected: true })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    fireEvent.change(screen.getByTestId('reject-reason-textarea'), {
      target: { value: '  Duplicate account.  ' },
    })
    fireEvent.click(screen.getByTestId('reject-confirm-checkbox'))
    fireEvent.click(screen.getByTestId('reject-submit'))
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith('Duplicate account.')
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })
})

// ── Error banner ──────────────────────────────────────────────────────────────

describe('RejectDialog error banner', () => {
  it('renders the NamedGateBanner when mutation.error is set', () => {
    const err = Object.assign(new Error('Not found'), { code: 'APPROVAL_NOT_FOUND' })
    const { useReject } = jest.requireMock('@/lib/review/useReviewActions') as {
      useReject: jest.MockedFunction<() => typeof mockMutation>
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useReject.mockReturnValueOnce({ ...mockMutation, error: err as any })
    renderDialog()
    expect(screen.getByTestId('named-gate-banner')).toBeInTheDocument()
  })
})
