/**
 * RequestChangesDialog — chips, soft-min, submit gating, error banner.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RequestChangesDialog } from '../RequestChangesDialog'

// ── Mock useRequestChanges ────────────────────────────────────────────────────

const mockMutateAsync = jest.fn()
const mockMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
  error: null,
}

jest.mock('@/lib/review/useReviewActions', () => ({
  useRequestChanges: jest.fn(() => mockMutation),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderDialog(opts: { onSuccess?: () => void; onCancel?: () => void } = {}) {
  return render(
    <RequestChangesDialog
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

describe('RequestChangesDialog structure', () => {
  it('renders the dialog with role=dialog and aria-label', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog', { name: /request changes/i })
    expect(dialog).toBeInTheDocument()
  })

  it('renders helper text', () => {
    renderDialog()
    expect(screen.getByTestId('request-changes-helper')).toHaveTextContent(
      'Be specific and friendly. This message is emailed to the merchant.'
    )
  })

  it('renders the Cancel button', () => {
    renderDialog()
    expect(screen.getByTestId('request-changes-cancel')).toBeInTheDocument()
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('request-changes-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when scrim is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('request-changes-scrim'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

// ── Chips ─────────────────────────────────────────────────────────────────────

describe('RequestChangesDialog chips', () => {
  it('renders the quick-reason chips', () => {
    renderDialog()
    expect(screen.getByTestId('quick-reason-chip-document-expired')).toBeInTheDocument()
    expect(screen.getByTestId('quick-reason-chip-photo-unclear')).toBeInTheDocument()
    expect(screen.getByTestId('quick-reason-chip-wrong-category')).toBeInTheDocument()
    expect(screen.getByTestId('quick-reason-chip-branch-address')).toBeInTheDocument()
  })

  it('sets the textarea when a chip is clicked and textarea is empty', () => {
    renderDialog()
    fireEvent.click(screen.getByTestId('quick-reason-chip-document-expired'))
    const textarea = screen.getByTestId('request-changes-reason-textarea') as HTMLTextAreaElement
    expect(textarea.value).toBe('Document expired')
  })

  it('appends to the textarea when a chip is clicked and textarea has content', () => {
    renderDialog()
    const textarea = screen.getByTestId('request-changes-reason-textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    fireEvent.click(screen.getByTestId('quick-reason-chip-photo-unclear'))
    expect(textarea.value).toBe('Hello Photo unclear')
  })
})

// ── Soft-min gating ───────────────────────────────────────────────────────────

describe('RequestChangesDialog soft-min gating', () => {
  it('disables submit when reason is empty', () => {
    renderDialog()
    expect(screen.getByTestId('request-changes-submit')).toBeDisabled()
  })

  it('disables submit and shows nudge when reason is below 15 chars', () => {
    renderDialog()
    const textarea = screen.getByTestId('request-changes-reason-textarea')
    fireEvent.change(textarea, { target: { value: 'Too short' } }) // 9 chars
    expect(screen.getByTestId('request-changes-submit')).toBeDisabled()
    expect(screen.getByTestId('request-changes-min-nudge')).toBeInTheDocument()
    expect(screen.getByTestId('request-changes-min-nudge')).toHaveTextContent(
      'Add a little more detail'
    )
  })

  it('does NOT show the nudge when textarea is empty (no premature warning)', () => {
    renderDialog()
    expect(screen.queryByTestId('request-changes-min-nudge')).not.toBeInTheDocument()
  })

  it('enables submit and hides nudge when reason is at least 15 chars', () => {
    renderDialog()
    const textarea = screen.getByTestId('request-changes-reason-textarea')
    fireEvent.change(textarea, { target: { value: 'This is long enough to pass' } })
    expect(screen.getByTestId('request-changes-submit')).not.toBeDisabled()
    expect(screen.queryByTestId('request-changes-min-nudge')).not.toBeInTheDocument()
  })
})

// ── Submit ────────────────────────────────────────────────────────────────────

describe('RequestChangesDialog submit', () => {
  it('calls mutateAsync with the trimmed reason on submit', async () => {
    mockMutateAsync.mockResolvedValueOnce({ changesRequested: true })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    const textarea = screen.getByTestId('request-changes-reason-textarea')
    fireEvent.change(textarea, { target: { value: '  Document expired, please re-upload  ' } })
    fireEvent.click(screen.getByTestId('request-changes-submit'))
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith('Document expired, please re-upload')
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })
})

// ── Error banner ──────────────────────────────────────────────────────────────

describe('RequestChangesDialog error banner', () => {
  it('renders the NamedGateBanner when mutation.error is set', () => {
    const err = Object.assign(new Error('Not actionable'), { code: 'APPROVAL_NOT_ACTIONABLE' })
    // Set up mock with error.
    const { useRequestChanges } = jest.requireMock('@/lib/review/useReviewActions') as {
      useRequestChanges: jest.MockedFunction<() => typeof mockMutation>
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useRequestChanges.mockReturnValueOnce({ ...mockMutation, error: err as any })
    renderDialog()
    expect(screen.getByTestId('named-gate-banner')).toBeInTheDocument()
  })
})
