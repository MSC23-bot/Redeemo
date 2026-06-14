/**
 * ApproveConfirm — consequences copy, failed-approve gate banner, no optimistic mark.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApproveConfirm } from '../ApproveConfirm'
import { ApiError } from '@/lib/api/client'

// ── Mock useApprove ───────────────────────────────────────────────────────────

const mockMutateAsync = jest.fn()
const mockMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
  error: null,
}

jest.mock('@/lib/review/useReviewActions', () => ({
  useApprove: jest.fn(() => mockMutation),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

interface RenderOpts {
  onSuccess?: () => void
  onCancel?: () => void
  onGateFail?: (gates: {
    branch_created?: boolean
    contract_signed?: boolean
    rmv_configured?: boolean
  }) => void
}

function renderDialog(opts: RenderOpts = {}) {
  return render(
    <ApproveConfirm
      approvalId="apr-1"
      onSuccess={opts.onSuccess ?? jest.fn()}
      onCancel={opts.onCancel ?? jest.fn()}
      onGateFail={opts.onGateFail}
    />
  )
}

afterEach(() => {
  jest.clearAllMocks()
  mockMutation.isPending = false
  mockMutation.error = null
})

// ── Structure ─────────────────────────────────────────────────────────────────

describe('ApproveConfirm structure', () => {
  it('renders the dialog with role=dialog', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /approve and go live/i })).toBeInTheDocument()
  })

  it('renders the consequences copy', () => {
    renderDialog()
    const copy = screen.getByTestId('approve-consequences-copy')
    expect(copy).toHaveTextContent('re-checks every go-live gate')
    expect(copy).toHaveTextContent('activates the 2 mandatory RMV vouchers')
    expect(copy).toHaveTextContent('emails the owner')
    expect(copy).toHaveTextContent('visible to customers')
  })

  it('renders Approve and go live + Cancel buttons', () => {
    renderDialog()
    expect(screen.getByTestId('approve-submit')).toBeInTheDocument()
    expect(screen.getByTestId('approve-cancel')).toBeInTheDocument()
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('approve-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when scrim is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('approve-scrim'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

// ── Success ───────────────────────────────────────────────────────────────────

describe('ApproveConfirm success', () => {
  it('calls onSuccess on a successful approve', async () => {
    mockMutateAsync.mockResolvedValueOnce({ approved: true, alreadyLive: false })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    fireEvent.click(screen.getByTestId('approve-submit'))
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1)
    })
  })

  it('does NOT render the error banner on success', async () => {
    mockMutateAsync.mockResolvedValueOnce({ approved: true })
    renderDialog()
    fireEvent.click(screen.getByTestId('approve-submit'))
    await waitFor(() => {
      expect(screen.queryByTestId('approve-error-banner')).not.toBeInTheDocument()
    })
  })
})

// ── Gate failure ──────────────────────────────────────────────────────────────

describe('ApproveConfirm gate failure', () => {
  it('renders NamedGateBanner on ONBOARDING_GATES_INCOMPLETE error', async () => {
    const err = new ApiError(422, {
      error: {
        code: 'ONBOARDING_GATES_INCOMPLETE',
        message: 'Gates incomplete',
        checklist: { branch_created: true, contract_signed: false, rmv_configured: false },
      },
    })
    mockMutateAsync.mockRejectedValueOnce(err)
    const { useApprove } = jest.requireMock('@/lib/review/useReviewActions') as {
      useApprove: jest.MockedFunction<() => typeof mockMutation>
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useApprove.mockReturnValueOnce({ ...mockMutation, error: err as any })

    renderDialog()
    expect(screen.getByTestId('approve-error-banner')).toBeInTheDocument()
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'not all onboarding requirements are complete'
    )
  })

  it('calls onGateFail with the checklist from ONBOARDING_GATES_INCOMPLETE', async () => {
    const checklist = { branch_created: true, contract_signed: false, rmv_configured: false }
    const err = new ApiError(422, {
      error: { code: 'ONBOARDING_GATES_INCOMPLETE', message: 'Gates', checklist },
    })
    mockMutateAsync.mockRejectedValueOnce(err)
    const onGateFail = jest.fn()
    renderDialog({ onGateFail })
    fireEvent.click(screen.getByTestId('approve-submit'))
    await waitFor(() => {
      expect(onGateFail).toHaveBeenCalledWith(checklist)
    })
  })

  it('does NOT mark approved on failure (no optimistic update)', async () => {
    const err = new ApiError(422, {
      error: { code: 'ONBOARDING_GATES_INCOMPLETE', message: 'Gates', checklist: {} },
    })
    mockMutateAsync.mockRejectedValueOnce(err)
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    fireEvent.click(screen.getByTestId('approve-submit'))
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1)
    })
    expect(onSuccess).not.toHaveBeenCalled()
  })
})

// ── Pending state ─────────────────────────────────────────────────────────────

describe('ApproveConfirm pending state', () => {
  it('disables the Approve submit button while the mutation is pending (no double-submit)', () => {
    mockMutation.isPending = true
    renderDialog()
    expect(screen.getByTestId('approve-submit')).toBeDisabled()
  })
})
