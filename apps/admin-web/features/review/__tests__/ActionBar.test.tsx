/**
 * ActionBar — claim-to-act state machine rendering tests.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActionBar } from '../ActionBar'
import type { ReviewApproval } from '@/lib/api/review'
import type { UseMutationResult } from '@tanstack/react-query'
import type { ClaimResponse, ReleaseResponse } from '@/lib/api/approvals'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMutation<TData, TError = Error>(
  overrides: Partial<UseMutationResult<TData, TError, void>> = {}
): UseMutationResult<TData, TError, void> {
  return {
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    isPending: false,
    isIdle: true,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null,
    variables: undefined,
    reset: jest.fn(),
    context: undefined,
    failureCount: 0,
    failureReason: null,
    isPaused: false,
    status: 'idle',
    submittedAt: 0,
    ...overrides,
  } as unknown as UseMutationResult<TData, TError, void>
}

function makeApproval(overrides: Partial<ReviewApproval> = {}): ReviewApproval {
  return {
    id: 'apr-1',
    type: 'MERCHANT_ONBOARDING',
    status: 'PENDING',
    submittedAt: '2026-06-10T09:00:00.000Z',
    actionedAt: null,
    claimedAt: null,
    comment: null,
    claimedBy: null,
    actionedBy: null,
    ...overrides,
  }
}

interface RenderBarOpts {
  approval?: ReviewApproval
  adminId?: string
  role?: 'OPERATIONS' | 'SUPER_ADMIN'
  can?: (cap: string) => boolean
  onRequestChanges?: () => void
  onReject?: () => void
  onApprove?: () => void
  claim?: UseMutationResult<ClaimResponse, Error, void>
  release?: UseMutationResult<ReleaseResponse, Error, void>
}

function renderBar(opts: RenderBarOpts = {}) {
  const {
    approval = makeApproval(),
    adminId = 'admin-me',
    role = 'OPERATIONS',
    can = () => true,
    onRequestChanges = jest.fn(),
    onReject = jest.fn(),
    onApprove = jest.fn(),
    claim = makeMutation<ClaimResponse>(),
    release = makeMutation<ReleaseResponse>(),
  } = opts
  return render(
    <ActionBar
      approval={approval}
      adminId={adminId}
      role={role}
      can={can}
      onRequestChanges={onRequestChanges}
      onReject={onReject}
      onApprove={onApprove}
      claim={claim}
      release={release}
    />
  )
}

// ── Capability gate ───────────────────────────────────────────────────────────

describe('ActionBar capability gate', () => {
  it('renders nothing when can(approval:action) returns false', () => {
    const { container } = renderBar({ can: () => false })
    expect(container.firstChild).toBeNull()
  })

  it('renders content when can(approval:action) returns true', () => {
    renderBar({ can: () => true })
    // Should not be empty — at least one testid rendered
    expect(document.body).not.toBeEmptyDOMElement()
  })
})

// ── Terminal states ───────────────────────────────────────────────────────────

describe('ActionBar terminal states', () => {
  it('APPROVED: renders terminal note with no action buttons', () => {
    renderBar({ approval: makeApproval({ status: 'APPROVED' }) })
    expect(screen.getByTestId('action-bar-approved')).toBeInTheDocument()
    expect(screen.getByTestId('action-bar-approved')).toHaveTextContent('This onboarding application was approved')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('REJECTED: renders terminal note with no action buttons', () => {
    renderBar({ approval: makeApproval({ status: 'REJECTED' }) })
    expect(screen.getByTestId('action-bar-rejected')).toBeInTheDocument()
    expect(screen.getByTestId('action-bar-rejected')).toHaveTextContent('rejected')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('CHANGES_REQUESTED: renders waiting note with no action buttons', () => {
    renderBar({ approval: makeApproval({ status: 'CHANGES_REQUESTED' }) })
    expect(screen.getByTestId('action-bar-changes-requested')).toBeInTheDocument()
    expect(screen.getByTestId('action-bar-changes-requested')).toHaveTextContent('Waiting on the merchant')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

// ── Unclaimed PENDING ─────────────────────────────────────────────────────────

describe('ActionBar unclaimed PENDING', () => {
  it('renders "Claim to act" button only, with the spec-aligned exclusivity hint', () => {
    renderBar({ approval: makeApproval({ claimedBy: null }) })
    expect(screen.getByTestId('action-bar-unclaimed')).toBeInTheDocument()
    expect(screen.getByTestId('action-bar-unclaimed')).toHaveTextContent(
      'Claim this item to take action. Claims are exclusive to one operator.'
    )
    expect(screen.getByTestId('action-bar-claim-btn')).toHaveTextContent('Claim to act')
    expect(screen.queryByTestId('action-bar-approve-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('action-bar-reject-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('action-bar-request-changes-btn')).not.toBeInTheDocument()
  })

  it('calls claim.mutate when Claim button is clicked', () => {
    const claim = makeMutation<ClaimResponse>()
    renderBar({ approval: makeApproval({ claimedBy: null }), claim })
    fireEvent.click(screen.getByTestId('action-bar-claim-btn'))
    expect(claim.mutate).toHaveBeenCalledTimes(1)
  })
})

// ── Claimed by me ─────────────────────────────────────────────────────────────

describe('ActionBar claimed-by-me PENDING', () => {
  const approval = makeApproval({ claimedBy: { id: 'admin-me', name: 'Me Admin' } })

  it('renders the full action bar with 3 ENABLED buttons + the honesty-lock hint', () => {
    renderBar({ approval })
    expect(screen.getByTestId('action-bar-claimed-by-me')).toBeInTheDocument()
    expect(screen.getByTestId('action-bar-claimed-by-me')).toHaveTextContent(
      'You claimed this. A single operator can claim and approve today; a separate countersigner is not yet enforced.'
    )
    expect(screen.getByTestId('action-bar-request-changes-btn')).toBeEnabled()
    expect(screen.getByTestId('action-bar-reject-btn')).toBeEnabled()
    expect(screen.getByTestId('action-bar-approve-btn')).toBeEnabled()
  })

  it('does NOT render the Claim button', () => {
    renderBar({ approval })
    expect(screen.queryByTestId('action-bar-claim-btn')).not.toBeInTheDocument()
  })

  it('calls onRequestChanges when Request changes is clicked', () => {
    const onRequestChanges = jest.fn()
    renderBar({ approval, onRequestChanges })
    fireEvent.click(screen.getByTestId('action-bar-request-changes-btn'))
    expect(onRequestChanges).toHaveBeenCalledTimes(1)
  })

  it('calls onReject when Reject is clicked', () => {
    const onReject = jest.fn()
    renderBar({ approval, onReject })
    fireEvent.click(screen.getByTestId('action-bar-reject-btn'))
    expect(onReject).toHaveBeenCalledTimes(1)
  })

  it('calls onApprove when Approve and go live is clicked', () => {
    const onApprove = jest.fn()
    renderBar({ approval, onApprove })
    fireEvent.click(screen.getByTestId('action-bar-approve-btn'))
    expect(onApprove).toHaveBeenCalledTimes(1)
  })

  it('SUPER_ADMIN who is also the claimer sees the claimer bar, not force-release', () => {
    // Branch ordering pin: claimed-by-me is checked before claimed-by-other,
    // so a SUPER_ADMIN whose adminId equals the claimer gets the full action bar.
    renderBar({ approval, role: 'SUPER_ADMIN', adminId: 'admin-me' })
    expect(screen.getByTestId('action-bar-claimed-by-me')).toBeInTheDocument()
    expect(screen.getByTestId('action-bar-request-changes-btn')).toBeInTheDocument()
    expect(screen.getByTestId('action-bar-reject-btn')).toBeInTheDocument()
    expect(screen.getByTestId('action-bar-approve-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('action-bar-force-release-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('action-bar-claimed-by-other')).not.toBeInTheDocument()
  })
})

// ── Claimed by other — OPERATIONS ────────────────────────────────────────────

describe('ActionBar claimed-by-other OPERATIONS', () => {
  // A fixed past claimedAt: however many hours/days have since elapsed, the
  // rendered copy should read "... {age} ago." — the exact figure isn't
  // asserted (formatWaiting is covered by its own unit tests), just the shape.
  const approval = makeApproval({
    claimedBy: { id: 'admin-other', name: 'Dana Reviewer' },
    claimedAt: '2026-06-10T07:00:00.000Z',
  })

  it('renders the read-only note with the claimer name', () => {
    renderBar({ approval, role: 'OPERATIONS' })
    expect(screen.getByTestId('action-bar-claimed-by-other')).toBeInTheDocument()
    expect(screen.getByTestId('action-bar-claimer-name')).toHaveTextContent('Dana Reviewer')
    expect(screen.getByTestId('action-bar-claimed-by-other')).toHaveTextContent(
      'Only the claimer or a Super Admin can release it; you cannot act or steal the claim.'
    )
  })

  it('does NOT render the Claim or Force-release buttons (not the claimer, not a Super Admin)', () => {
    renderBar({ approval, role: 'OPERATIONS' })
    expect(screen.queryByTestId('action-bar-claim-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('action-bar-force-release-btn')).not.toBeInTheDocument()
  })

  it('renders Approve/Reject/Request-changes DISABLED (spec §C.1: visible, not actionable)', () => {
    renderBar({ approval, role: 'OPERATIONS' })
    expect(screen.getByTestId('action-bar-approve-btn')).toBeDisabled()
    expect(screen.getByTestId('action-bar-reject-btn')).toBeDisabled()
    expect(screen.getByTestId('action-bar-request-changes-btn')).toBeDisabled()
  })

  it('clicking a disabled action button does not fire its handler', () => {
    const onApprove = jest.fn()
    const onReject = jest.fn()
    const onRequestChanges = jest.fn()
    renderBar({ approval, role: 'OPERATIONS', onApprove, onReject, onRequestChanges })
    fireEvent.click(screen.getByTestId('action-bar-approve-btn'))
    fireEvent.click(screen.getByTestId('action-bar-reject-btn'))
    fireEvent.click(screen.getByTestId('action-bar-request-changes-btn'))
    expect(onApprove).not.toHaveBeenCalled()
    expect(onReject).not.toHaveBeenCalled()
    expect(onRequestChanges).not.toHaveBeenCalled()
  })

  it('shows "another admin" when the claimer name is null', () => {
    const approvalNullName = makeApproval({ claimedBy: { id: 'admin-other', name: null } })
    renderBar({ approval: approvalNullName, role: 'OPERATIONS' })
    expect(screen.getByTestId('action-bar-claimer-name')).toHaveTextContent('another admin')
  })

  it('shows "{age} ago" when claimedAt is present, and omits it gracefully when null', () => {
    const { unmount } = renderBar({ approval, role: 'OPERATIONS' })
    expect(screen.getByTestId('action-bar-claimed-by-other')).toHaveTextContent(/ago\./)
    unmount()

    const approvalNoClaimedAt = makeApproval({
      claimedBy: { id: 'admin-other', name: 'Dana Reviewer' },
      claimedAt: null,
    })
    renderBar({ approval: approvalNoClaimedAt, role: 'OPERATIONS' })
    // No "ago" clause, but the rest of the sentence still reads cleanly.
    expect(screen.getByTestId('action-bar-claimed-by-other')).toHaveTextContent(
      'Claimed by Dana Reviewer. Only the claimer or a Super Admin can release it'
    )
  })
})

// ── Claimed by other — SUPER_ADMIN ───────────────────────────────────────────

describe('ActionBar claimed-by-other SUPER_ADMIN', () => {
  const approval = makeApproval({ claimedBy: { id: 'admin-other', name: 'Dana Reviewer' } })

  it('renders the read-only note AND a Force-release button (functional, not disabled)', () => {
    renderBar({ approval, role: 'SUPER_ADMIN' })
    expect(screen.getByTestId('action-bar-claimed-by-other')).toBeInTheDocument()
    expect(screen.getByTestId('action-bar-force-release-btn')).toBeEnabled()
  })

  it('calls release.mutate when Force-release is clicked', () => {
    const release = makeMutation<ReleaseResponse>()
    renderBar({ approval, role: 'SUPER_ADMIN', release })
    fireEvent.click(screen.getByTestId('action-bar-force-release-btn'))
    expect(release.mutate).toHaveBeenCalledTimes(1)
  })

  it('renders Approve/Reject/Request-changes DISABLED (same visible-not-actionable treatment as OPERATIONS)', () => {
    renderBar({ approval, role: 'SUPER_ADMIN' })
    expect(screen.getByTestId('action-bar-approve-btn')).toBeDisabled()
    expect(screen.getByTestId('action-bar-reject-btn')).toBeDisabled()
    expect(screen.getByTestId('action-bar-request-changes-btn')).toBeDisabled()
  })
})
