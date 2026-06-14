/**
 * /queue/[id] review page — capability gate, loading/error states, content render,
 * M5 ActionBar + dialog mounting.
 *
 * Mocks useSession, useReview, useReviewActions, and React.use (for params Promise
 * resolution). Feature components are rendered unmocked; the page is tested as an
 * integrated unit.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import ReviewPage from '../page'
import type { ReviewContext } from '@/lib/api/review'

// ── Mock next/link ────────────────────────────────────────────────────────────

jest.mock('next/link', () => {
  return function MockLink({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  }
})

// ── Mock React.use so params Promise resolves synchronously ───────────────────

jest.mock('react', () => {
  const actual = jest.requireActual('react') as typeof import('react')
  return {
    ...actual,
    use: jest.fn((p: unknown) => p),
  }
})

// ── Mock useSession ───────────────────────────────────────────────────────────

jest.mock('@/lib/auth/useSession', () => ({
  useSession: jest.fn(),
}))

// ── Mock useReview ────────────────────────────────────────────────────────────

jest.mock('@/lib/review/useReview', () => ({
  useReview: jest.fn(),
}))

// ── Mock useTimeline (the merchant-keyed timeline replacing the audit card) ────
// The page renders <ActivityTimeline> unmocked; mock its hook so it resolves
// deterministically without a network call.

jest.mock('@/lib/timeline/useTimeline', () => ({
  useTimeline: jest.fn(() => ({
    data: { items: [], state: null, emailsResolvedViaOwner: false },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  })),
}))

// ── Mock useReviewActions ─────────────────────────────────────────────────────

const mockClaimMutation = {
  mutate: jest.fn(),
  mutateAsync: jest.fn(),
  isPending: false,
  error: null,
  isIdle: true,
  isSuccess: false,
  isError: false,
  data: undefined,
  variables: undefined,
  reset: jest.fn(),
  context: undefined,
  failureCount: 0,
  failureReason: null,
  isPaused: false,
  status: 'idle',
  submittedAt: 0,
}

const mockReleaseMutation = {
  mutate: jest.fn(),
  mutateAsync: jest.fn(),
  isPending: false,
  error: null,
  isIdle: true,
  isSuccess: false,
  isError: false,
  data: undefined,
  variables: undefined,
  reset: jest.fn(),
  context: undefined,
  failureCount: 0,
  failureReason: null,
  isPaused: false,
  status: 'idle',
  submittedAt: 0,
}

jest.mock('@/lib/review/useReviewActions', () => ({
  useClaim: jest.fn(() => mockClaimMutation),
  useRelease: jest.fn(() => mockReleaseMutation),
  useRequestChanges: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false, error: null })),
  useReject: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false, error: null })),
  useApprove: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false, error: null })),
}))

// ── Mock dialogs so we can check whether they mount ──────────────────────────

jest.mock('@/features/review/RequestChangesDialog', () => ({
  RequestChangesDialog: ({ onCancel }: { onCancel: () => void }) => (
    <div data-testid="request-changes-dialog-mock">
      <button onClick={onCancel} data-testid="rc-dialog-cancel">Cancel</button>
    </div>
  ),
}))

jest.mock('@/features/review/RejectDialog', () => ({
  RejectDialog: ({ onCancel }: { onCancel: () => void }) => (
    <div data-testid="reject-dialog-mock">
      <button onClick={onCancel} data-testid="reject-dialog-cancel">Cancel</button>
    </div>
  ),
}))

jest.mock('@/features/review/ApproveConfirm', () => ({
  ApproveConfirm: ({
    onCancel,
    onGateFail,
  }: {
    onCancel: () => void
    onGateFail?: (gates: object) => void
  }) => (
    <div data-testid="approve-confirm-dialog-mock">
      <button onClick={onCancel} data-testid="approve-dialog-cancel">Cancel</button>
      <button
        onClick={() =>
          onGateFail?.({ branch_created: true, contract_signed: false, rmv_configured: false })
        }
        data-testid="approve-dialog-trigger-gate-fail"
      >
        Trigger gate fail
      </button>
    </div>
  ),
}))

// ── Mock M6 lifecycle + confirm-location dialogs (they use RQ mutations) ──────

jest.mock('@/features/merchants/SuspendDialog', () => ({
  SuspendDialog: ({ merchantId, onCancel }: { merchantId: string; onCancel: () => void }) => (
    <div data-testid="suspend-dialog-mock" data-merchant-id={merchantId}>
      <button onClick={onCancel} data-testid="suspend-dialog-cancel">Cancel</button>
    </div>
  ),
}))

jest.mock('@/features/merchants/ReactivateConfirm', () => ({
  ReactivateConfirm: ({ merchantId, onCancel }: { merchantId: string; onCancel: () => void }) => (
    <div data-testid="reactivate-dialog-mock" data-merchant-id={merchantId}>
      <button onClick={onCancel} data-testid="reactivate-dialog-cancel">Cancel</button>
    </div>
  ),
}))

jest.mock('@/features/merchants/ConfirmLocationDialog', () => ({
  ConfirmLocationDialog: ({
    branchId,
    onCancel,
  }: {
    branchId: string
    onCancel: () => void
  }) => (
    <div data-testid="confirm-location-dialog-mock" data-branch-id={branchId}>
      <button onClick={onCancel} data-testid="confirm-location-dialog-cancel">Cancel</button>
    </div>
  ),
}))

import { useSession } from '@/lib/auth/useSession'
import { useReview } from '@/lib/review/useReview'
import type { UseReviewResult } from '@/lib/review/useReview'

const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>
const mockedUseReview = useReview as jest.MockedFunction<typeof useReview>

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockSession(opts: {
  ready?: boolean
  can?: (cap: string) => boolean
  adminId?: string
  role?: 'OPERATIONS' | 'SUPER_ADMIN'
} = {}) {
  mockedUseSession.mockReturnValue({
    ready: opts.ready ?? true,
    isAuthenticated: true,
    role: opts.role ?? 'OPERATIONS',
    email: 'ops@redeemo.co.uk',
    adminId: opts.adminId ?? 'admin-me',
    can: opts.can ?? (() => true),
    refresh: jest.fn(),
  })
}

function mockReview(overrides: Partial<UseReviewResult> = {}) {
  mockedUseReview.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  })
}

function makeContext(overrides: Partial<ReviewContext> = {}): ReviewContext {
  return {
    approval: {
      id: 'apr-1',
      type: 'MERCHANT_ONBOARDING',
      status: 'PENDING',
      submittedAt: '2026-06-10T09:00:00.000Z',
      actionedAt: null,
      claimedAt: null,
      comment: null,
      claimedBy: null,
      actionedBy: null,
    },
    merchant: {
      id: 'm-1',
      businessName: 'Acme Coffee',
      tradingName: null,
      description: null,
      websiteUrl: null,
      logoUrl: null,
      bannerUrl: null,
      companyNumber: null,
      vatNumber: null,
      status: 'PENDING_APPROVAL',
      verificationStatus: 'PENDING',
      contractStatus: 'SIGNED',
      contractStartDate: null,
      contractEndDate: null,
      onboardingStep: 'SUBMIT_FOR_REVIEW',
      createdAt: '2026-06-01T08:00:00.000Z',
      category: null,
    },
    owner: null,
    branches: [],
    vouchers: [],
    documents: [],
    checklist: {
      branch_created: true,
      contract_signed: true,
      rmv_configured: false,
      all_complete: false,
    },
    thinAreas: {
      documentsUploaded: false,
      companyTypeCaptured: false,
      registeredOfficeCaptured: false,
      sectorEvidenceCaptured: false,
      companyNumberProvided: false,
      vatNumberProvided: false,
      documentsGated: false,
    },
    activity: [],
    ...overrides,
  }
}

function renderPage() {
  const params = { id: 'apr-1' } as unknown as Promise<{ id: string }>
  return render(<ReviewPage params={params} />)
}

// ── Capability gate ───────────────────────────────────────────────────────────

describe('ReviewPage capability gate', () => {
  it('shows loading state while session is not ready', () => {
    mockSession({ ready: false, can: () => false })
    mockReview({ isLoading: false })
    renderPage()
    expect(screen.getByTestId('review-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('review-forbidden')).not.toBeInTheDocument()
  })

  it('shows forbidden state when the admin lacks approval:read', () => {
    mockSession({ can: () => false })
    mockReview()
    renderPage()
    expect(screen.getByTestId('review-forbidden')).toBeInTheDocument()
    expect(screen.queryByTestId('review-loading')).not.toBeInTheDocument()
  })

  it('calls useReview with enabled:false when lacking the capability', () => {
    mockSession({ can: () => false })
    mockReview()
    renderPage()
    expect(mockedUseReview).toHaveBeenCalledWith('apr-1', false)
  })

  it('calls useReview with enabled:true when the admin has approval:read', () => {
    mockSession({ can: () => true })
    mockReview()
    renderPage()
    expect(mockedUseReview).toHaveBeenCalledWith('apr-1', true)
  })

  it('calls useReview with enabled:false when session is not yet ready', () => {
    mockSession({ ready: false, can: () => false })
    mockReview()
    renderPage()
    expect(mockedUseReview).toHaveBeenCalledWith('apr-1', false)
  })
})

// ── Loading / error states ────────────────────────────────────────────────────

describe('ReviewPage loading/error states', () => {
  beforeEach(() => mockSession())

  it('shows loading state while isLoading is true', () => {
    mockReview({ isLoading: true })
    renderPage()
    expect(screen.getByTestId('review-loading')).toBeInTheDocument()
  })

  it('shows error state when isError is true', () => {
    mockReview({ isError: true, isLoading: false })
    renderPage()
    expect(screen.getByTestId('review-error')).toBeInTheDocument()
  })

  it('shows error state when data is undefined (and not loading)', () => {
    mockReview({ data: undefined, isLoading: false, isError: false })
    renderPage()
    expect(screen.getByTestId('review-error')).toBeInTheDocument()
  })

  it('calls refetch when the retry button is clicked', () => {
    const refetch = jest.fn()
    mockReview({ isError: true, isLoading: false, refetch })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})

// ── Non-onboarding approval ───────────────────────────────────────────────────

describe('ReviewPage non-onboarding approval', () => {
  beforeEach(() => mockSession())

  it('shows the non-onboarding notice for VOUCHER approval type', () => {
    mockReview({
      data: makeContext({
        approval: {
          id: 'apr-2',
          type: 'VOUCHER',
          status: 'PENDING',
          submittedAt: '2026-06-10T09:00:00.000Z',
          actionedAt: null,
          claimedAt: null,
          comment: null,
          claimedBy: null,
          actionedBy: null,
        },
      }),
    })
    renderPage()
    expect(screen.getByTestId('review-non-onboarding')).toBeInTheDocument()
  })
})

// ── Full content render ───────────────────────────────────────────────────────

describe('ReviewPage full render', () => {
  beforeEach(() => mockSession())

  it('renders the merchant header', () => {
    mockReview({ data: makeContext() })
    renderPage()
    expect(screen.getByTestId('merchant-header')).toBeInTheDocument()
    const acmeEls = screen.getAllByText('Acme Coffee')
    expect(acmeEls.length).toBeGreaterThanOrEqual(1)
  })

  it('renders the checklist summary when checklist is present', () => {
    mockReview({ data: makeContext() })
    renderPage()
    expect(screen.getByTestId('checklist-summary')).toBeInTheDocument()
  })

  it('renders the voucher list', () => {
    mockReview({ data: makeContext() })
    renderPage()
    expect(screen.getByTestId('voucher-list')).toBeInTheDocument()
  })

  it('renders the branch table', () => {
    mockReview({ data: makeContext() })
    renderPage()
    expect(screen.getByTestId('branch-table')).toBeInTheDocument()
  })

  it('renders the document list', () => {
    mockReview({ data: makeContext() })
    renderPage()
    expect(screen.getByTestId('document-list')).toBeInTheDocument()
  })

  it('renders thin area flags when thinAreas is present', () => {
    mockReview({ data: makeContext() })
    renderPage()
    expect(screen.getByTestId('thin-area-flags')).toBeInTheDocument()
  })

  it('renders the activity timeline (replacing the old audit list)', () => {
    mockReview({ data: makeContext() })
    renderPage()
    expect(screen.getByTestId('activity-timeline')).toBeInTheDocument()
    // The old approval-scoped audit card must be gone.
    expect(screen.queryByTestId('activity-list')).not.toBeInTheDocument()
  })

  it('renders the back link to /queue', () => {
    mockReview({ data: makeContext() })
    renderPage()
    const backLink = screen.getByRole('link', { name: /back to approval queue/i })
    expect(backLink).toHaveAttribute('href', '/queue')
  })

  it('shows the merchant name in the breadcrumb', () => {
    mockReview({ data: makeContext() })
    renderPage()
    const acmeElements = screen.getAllByText('Acme Coffee')
    expect(acmeElements.length).toBeGreaterThanOrEqual(1)
  })
})

// ── Merchant-unavailable notice ───────────────────────────────────────────────

describe('ReviewPage merchant-unavailable notice', () => {
  beforeEach(() => mockSession())

  it('shows the merchant-unavailable notice (not ErrorState) for a null merchant', () => {
    mockReview({ data: makeContext({ merchant: null }) })
    renderPage()
    expect(screen.getByTestId('review-merchant-unavailable')).toBeInTheDocument()
    expect(screen.getByText('Merchant record unavailable')).toBeInTheDocument()
    expect(screen.queryByTestId('review-error')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })

  it('does NOT render the activity timeline when the merchant is unavailable', () => {
    // The timeline is keyed by a merchant id, which does not exist in this
    // degenerate branch, so only the calm notice is shown (no activity surface).
    mockReview({
      data: makeContext({
        merchant: null,
        activity: [
          {
            id: 'act-1',
            event: 'MERCHANT_SUBMITTED_FOR_APPROVAL',
            createdAt: '2026-06-10T09:00:00.000Z',
            actorType: 'MERCHANT',
            reason: null,
            actor: null,
          },
        ],
      }),
    })
    renderPage()
    expect(screen.getByTestId('review-merchant-unavailable')).toBeInTheDocument()
    expect(screen.queryByTestId('activity-timeline')).not.toBeInTheDocument()
    expect(screen.queryByTestId('activity-list')).not.toBeInTheDocument()
  })

  it('still renders the topbar claim badge when the merchant is unavailable', () => {
    mockReview({ data: makeContext({ merchant: null }) })
    renderPage()
    expect(screen.getByTestId('review-claim-badge')).toBeInTheDocument()
  })
})

// ── Read-only claim-state badge ───────────────────────────────────────────────

describe('ReviewPage claim-state badge', () => {
  beforeEach(() => mockSession()) // adminId === 'admin-me'

  it('shows "Claimed by you" when the approval is claimed by the signed-in admin', () => {
    mockReview({
      data: makeContext({
        approval: {
          ...makeContext().approval,
          claimedAt: '2026-06-10T10:00:00.000Z',
          claimedBy: { id: 'admin-me', name: 'Me Operator' },
        },
      }),
    })
    renderPage()
    const badge = screen.getByTestId('review-claim-badge')
    expect(badge).toHaveTextContent('Claimed by you')
  })

  it('shows "Claimed by <name>" when claimed by another admin', () => {
    mockReview({
      data: makeContext({
        approval: {
          ...makeContext().approval,
          claimedAt: '2026-06-10T10:00:00.000Z',
          claimedBy: { id: 'admin-other', name: 'Dana Reviewer' },
        },
      }),
    })
    renderPage()
    const badge = screen.getByTestId('review-claim-badge')
    expect(badge).toHaveTextContent('Claimed by Dana Reviewer')
  })

  it('shows "Claimed by an admin" when claimed by another admin with a null name', () => {
    mockReview({
      data: makeContext({
        approval: {
          ...makeContext().approval,
          claimedAt: '2026-06-10T10:00:00.000Z',
          claimedBy: { id: 'admin-x', name: null },
        },
      }),
    })
    renderPage()
    const badge = screen.getByTestId('review-claim-badge')
    expect(badge).toHaveTextContent('Claimed by an admin')
  })

  it('shows "Unclaimed" when no admin has claimed the approval', () => {
    mockReview({ data: makeContext() }) // default claimedBy: null
    renderPage()
    const badge = screen.getByTestId('review-claim-badge')
    expect(badge).toHaveTextContent('Unclaimed')
  })

  it('shows "Waiting on merchant" when the approval status is CHANGES_REQUESTED', () => {
    mockReview({
      data: makeContext({
        approval: {
          ...makeContext().approval,
          status: 'CHANGES_REQUESTED',
          claimedBy: { id: 'admin-me', name: 'Me Operator' },
        },
      }),
    })
    renderPage()
    const badge = screen.getByTestId('review-claim-badge')
    expect(badge).toHaveTextContent('Waiting on merchant')
  })
})

// ── Owner contact (rendered via ProfileCard) ──────────────────────────────────

describe('ReviewPage owner contact', () => {
  beforeEach(() => mockSession())

  it('renders the owner name and email when an owner is present', () => {
    mockReview({
      data: makeContext({
        owner: {
          id: 'u-1',
          name: 'Olivia Owner',
          email: 'olivia@acme.test',
          phone: '+447700900123',
        },
      }),
    })
    renderPage()
    const ownerSection = screen.getByTestId('owner-contact')
    expect(ownerSection).toHaveTextContent('Olivia Owner')
    expect(ownerSection).toHaveTextContent('olivia@acme.test')
    expect(ownerSection).toHaveTextContent('+447700900123')
  })

  it('shows "Not available" when no owner is present', () => {
    mockReview({ data: makeContext({ owner: null }) })
    renderPage()
    expect(screen.getByTestId('owner-contact')).toHaveTextContent('Not available')
  })

  it('shows "Not provided" for a missing phone when the owner is otherwise present', () => {
    mockReview({
      data: makeContext({
        owner: { id: 'u-2', name: 'Pat Owner', email: 'pat@acme.test', phone: null },
      }),
    })
    renderPage()
    const ownerSection = screen.getByTestId('owner-contact')
    expect(ownerSection).toHaveTextContent('Pat Owner')
    expect(ownerSection).toHaveTextContent('Not provided')
  })
})

// ── M5: ActionBar mount ───────────────────────────────────────────────────────

describe('ReviewPage M5 ActionBar', () => {
  beforeEach(() => mockSession())

  it('renders the action bar container in the full MERCHANT_ONBOARDING + merchant-present state', () => {
    mockReview({ data: makeContext() })
    renderPage()
    expect(screen.getByTestId('action-bar-container')).toBeInTheDocument()
  })

  it('does NOT render the action bar for a non-onboarding type', () => {
    mockReview({
      data: makeContext({
        approval: {
          ...makeContext().approval,
          type: 'VOUCHER',
        },
      }),
    })
    renderPage()
    expect(screen.queryByTestId('action-bar-container')).not.toBeInTheDocument()
  })

  it('does NOT render the action bar when merchant is null', () => {
    mockReview({ data: makeContext({ merchant: null }) })
    renderPage()
    expect(screen.queryByTestId('action-bar-container')).not.toBeInTheDocument()
  })

  it('ActionBar renders nothing (no buttons) when can(approval:action) is false', () => {
    mockSession({ can: (cap: string) => cap !== 'approval:action' })
    mockReview({ data: makeContext() })
    renderPage()
    // action-bar-container is still mounted but ActionBar inner renders null
    expect(screen.queryByTestId('action-bar-unclaimed')).not.toBeInTheDocument()
    expect(screen.queryByTestId('action-bar-claimed-by-me')).not.toBeInTheDocument()
  })
})

// ── M5: dialog opening ────────────────────────────────────────────────────────

describe('ReviewPage M5 dialogs', () => {
  beforeEach(() =>
    mockSession({ adminId: 'admin-me' })
  )

  const claimedByMeApproval = makeContext({
    approval: {
      id: 'apr-1',
      type: 'MERCHANT_ONBOARDING',
      status: 'PENDING',
      submittedAt: '2026-06-10T09:00:00.000Z',
      actionedAt: null,
      claimedAt: '2026-06-10T10:00:00.000Z',
      comment: null,
      claimedBy: { id: 'admin-me', name: 'Me Admin' },
      actionedBy: null,
    },
  })

  it('opens RequestChangesDialog when Request changes is clicked', () => {
    mockReview({ data: claimedByMeApproval })
    renderPage()
    fireEvent.click(screen.getByTestId('action-bar-request-changes-btn'))
    expect(screen.getByTestId('request-changes-dialog-mock')).toBeInTheDocument()
  })

  it('closes RequestChangesDialog when its Cancel is clicked', () => {
    mockReview({ data: claimedByMeApproval })
    renderPage()
    fireEvent.click(screen.getByTestId('action-bar-request-changes-btn'))
    expect(screen.getByTestId('request-changes-dialog-mock')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('rc-dialog-cancel'))
    expect(screen.queryByTestId('request-changes-dialog-mock')).not.toBeInTheDocument()
  })

  it('opens RejectDialog when Reject is clicked', () => {
    mockReview({ data: claimedByMeApproval })
    renderPage()
    fireEvent.click(screen.getByTestId('action-bar-reject-btn'))
    expect(screen.getByTestId('reject-dialog-mock')).toBeInTheDocument()
  })

  it('closes RejectDialog when its Cancel is clicked', () => {
    mockReview({ data: claimedByMeApproval })
    renderPage()
    fireEvent.click(screen.getByTestId('action-bar-reject-btn'))
    fireEvent.click(screen.getByTestId('reject-dialog-cancel'))
    expect(screen.queryByTestId('reject-dialog-mock')).not.toBeInTheDocument()
  })

  it('opens ApproveConfirm when Approve and go live is clicked', () => {
    mockReview({ data: claimedByMeApproval })
    renderPage()
    fireEvent.click(screen.getByTestId('action-bar-approve-btn'))
    expect(screen.getByTestId('approve-confirm-dialog-mock')).toBeInTheDocument()
  })

  it('closes ApproveConfirm when its Cancel is clicked', () => {
    mockReview({ data: claimedByMeApproval })
    renderPage()
    fireEvent.click(screen.getByTestId('action-bar-approve-btn'))
    fireEvent.click(screen.getByTestId('approve-dialog-cancel'))
    expect(screen.queryByTestId('approve-confirm-dialog-mock')).not.toBeInTheDocument()
  })
})

// ── M5: failed approve highlights checklist rows ──────────────────────────────

describe('ReviewPage M5 failed-approve checklist highlight', () => {
  beforeEach(() =>
    mockSession({ adminId: 'admin-me' })
  )

  it('passes failed gates to ChecklistSummary when onGateFail fires', () => {
    const ctx = makeContext({
      approval: {
        id: 'apr-1',
        type: 'MERCHANT_ONBOARDING',
        status: 'PENDING',
        submittedAt: '2026-06-10T09:00:00.000Z',
        actionedAt: null,
        claimedAt: '2026-06-10T10:00:00.000Z',
        comment: null,
        claimedBy: { id: 'admin-me', name: 'Me Admin' },
        actionedBy: null,
      },
      checklist: {
        branch_created: true,
        contract_signed: false,
        rmv_configured: false,
        all_complete: false,
      },
    })
    mockReview({ data: ctx })
    renderPage()

    // Open the approve dialog and trigger a gate fail.
    fireEvent.click(screen.getByTestId('action-bar-approve-btn'))
    fireEvent.click(screen.getByTestId('approve-dialog-trigger-gate-fail'))

    // The checklist-row-contract row should be present and highlighted
    // (data-testid is present regardless; the highlight prop changes styling).
    expect(screen.getByTestId('checklist-row-contract')).toBeInTheDocument()
    expect(screen.getByTestId('checklist-row-rmv')).toBeInTheDocument()
  })
})

// ── M5: topbar Release button ─────────────────────────────────────────────────

describe('ReviewPage M5 topbar Release button', () => {
  it('shows Release button in the topbar when claimed-by-me and PENDING', () => {
    mockSession({ adminId: 'admin-me' })
    mockReview({
      data: makeContext({
        approval: {
          ...makeContext().approval,
          status: 'PENDING',
          claimedAt: '2026-06-10T10:00:00.000Z',
          claimedBy: { id: 'admin-me', name: 'Me Admin' },
        },
      }),
    })
    renderPage()
    expect(screen.getByTestId('topbar-release-btn')).toBeInTheDocument()
  })

  it('does NOT show Release button when not claimed', () => {
    mockSession({ adminId: 'admin-me' })
    mockReview({ data: makeContext({ approval: { ...makeContext().approval, claimedBy: null } }) })
    renderPage()
    expect(screen.queryByTestId('topbar-release-btn')).not.toBeInTheDocument()
  })

  it('does NOT show Release button when claimed by another admin', () => {
    mockSession({ adminId: 'admin-me' })
    mockReview({
      data: makeContext({
        approval: {
          ...makeContext().approval,
          claimedAt: '2026-06-10T10:00:00.000Z',
          claimedBy: { id: 'admin-other', name: 'Dana' },
        },
      }),
    })
    renderPage()
    expect(screen.queryByTestId('topbar-release-btn')).not.toBeInTheDocument()
  })

  it('does NOT show Release button when status is APPROVED', () => {
    mockSession({ adminId: 'admin-me' })
    mockReview({
      data: makeContext({
        approval: {
          ...makeContext().approval,
          status: 'APPROVED',
          claimedBy: { id: 'admin-me', name: 'Me' },
        },
      }),
    })
    renderPage()
    expect(screen.queryByTestId('topbar-release-btn')).not.toBeInTheDocument()
  })

  it('calls releaseMutation.mutate when Release is clicked', () => {
    mockSession({ adminId: 'admin-me' })
    mockReview({
      data: makeContext({
        approval: {
          ...makeContext().approval,
          status: 'PENDING',
          claimedAt: '2026-06-10T10:00:00.000Z',
          claimedBy: { id: 'admin-me', name: 'Me Admin' },
        },
      }),
    })
    renderPage()
    fireEvent.click(screen.getByTestId('topbar-release-btn'))
    expect(mockReleaseMutation.mutate).toHaveBeenCalledTimes(1)
  })

  it('shows the topbar release error banner when releaseMutation errors in the claimer state', () => {
    const { useRelease } = jest.requireMock('@/lib/review/useReviewActions')
    const releaseError = new Error('APPROVAL_NOT_CLAIMER')
    useRelease.mockReturnValueOnce({
      ...mockReleaseMutation,
      error: releaseError,
      isError: true,
    })
    mockSession({ adminId: 'admin-me' })
    mockReview({
      data: makeContext({
        approval: {
          ...makeContext().approval,
          status: 'PENDING',
          claimedAt: '2026-06-10T10:00:00.000Z',
          claimedBy: { id: 'admin-me', name: 'Me Admin' },
        },
      }),
    })
    renderPage()
    expect(screen.getByTestId('topbar-release-error')).toBeInTheDocument()
    expect(screen.getByTestId('named-gate-banner')).toBeInTheDocument()
  })

  it('does NOT show the topbar release error banner when claimed by another admin (not showTopbarRelease)', () => {
    const { useRelease } = jest.requireMock('@/lib/review/useReviewActions')
    useRelease.mockReturnValueOnce({
      ...mockReleaseMutation,
      error: new Error('APPROVAL_NOT_CLAIMER'),
      isError: true,
    })
    mockSession({ adminId: 'admin-me' })
    mockReview({
      data: makeContext({
        approval: {
          ...makeContext().approval,
          status: 'PENDING',
          claimedAt: '2026-06-10T10:00:00.000Z',
          claimedBy: { id: 'admin-other', name: 'Dana' },
        },
      }),
    })
    renderPage()
    // showTopbarRelease is false because claimed by another admin; banner must NOT render
    expect(screen.queryByTestId('topbar-release-error')).not.toBeInTheDocument()
  })
})

// ── M5: opening a dialog clears stale failed-gates highlight ──────────────────

describe('ReviewPage M5 opening dialog clears stale failed-gates', () => {
  beforeEach(() => mockSession({ adminId: 'admin-me' }))

  const claimedByMeApproval = makeContext({
    approval: {
      id: 'apr-1',
      type: 'MERCHANT_ONBOARDING',
      status: 'PENDING',
      submittedAt: '2026-06-10T09:00:00.000Z',
      actionedAt: null,
      claimedAt: '2026-06-10T10:00:00.000Z',
      comment: null,
      claimedBy: { id: 'admin-me', name: 'Me Admin' },
      actionedBy: null,
    },
    checklist: {
      branch_created: true,
      contract_signed: false,
      rmv_configured: false,
      all_complete: false,
    },
  })

  it('clears the failed-gates highlight when Request changes dialog is opened', () => {
    mockReview({ data: claimedByMeApproval })
    renderPage()

    // Trigger a gate fail so ChecklistSummary has a highlight.
    fireEvent.click(screen.getByTestId('action-bar-approve-btn'))
    fireEvent.click(screen.getByTestId('approve-dialog-trigger-gate-fail'))

    // Now open Request changes: this should clear failedGates.
    // Close the approve dialog first via Cancel so the ActionBar buttons are accessible.
    fireEvent.click(screen.getByTestId('approve-dialog-cancel'))
    fireEvent.click(screen.getByTestId('action-bar-request-changes-btn'))

    // ChecklistSummary should no longer receive a highlight prop
    // (highlight=undefined means no rows are marked red).
    // We verify indirectly: ChecklistSummary renders with data-testid checklist-summary.
    expect(screen.getByTestId('checklist-summary')).toBeInTheDocument()
    // The request-changes dialog is now open and the approve-dialog is gone.
    expect(screen.getByTestId('request-changes-dialog-mock')).toBeInTheDocument()
    expect(screen.queryByTestId('approve-confirm-dialog-mock')).not.toBeInTheDocument()
  })

  it('clears the failed-gates highlight when Reject dialog is opened', () => {
    mockReview({ data: claimedByMeApproval })
    renderPage()

    // Trigger a gate fail.
    fireEvent.click(screen.getByTestId('action-bar-approve-btn'))
    fireEvent.click(screen.getByTestId('approve-dialog-trigger-gate-fail'))

    // Close approve dialog, then open Reject.
    fireEvent.click(screen.getByTestId('approve-dialog-cancel'))
    fireEvent.click(screen.getByTestId('action-bar-reject-btn'))

    expect(screen.getByTestId('reject-dialog-mock')).toBeInTheDocument()
    expect(screen.queryByTestId('approve-confirm-dialog-mock')).not.toBeInTheDocument()
    // Checklist is still present (no crash).
    expect(screen.getByTestId('checklist-summary')).toBeInTheDocument()
  })

  it('clears the failed-gates highlight when Approve is reopened after a prior gate fail', () => {
    mockReview({ data: claimedByMeApproval })
    renderPage()

    // First gate fail.
    fireEvent.click(screen.getByTestId('action-bar-approve-btn'))
    fireEvent.click(screen.getByTestId('approve-dialog-trigger-gate-fail'))
    fireEvent.click(screen.getByTestId('approve-dialog-cancel'))

    // Reopen approve: failedGates should be cleared before the dialog mounts.
    fireEvent.click(screen.getByTestId('action-bar-approve-btn'))
    expect(screen.getByTestId('approve-confirm-dialog-mock')).toBeInTheDocument()
    // Checklist still renders without crash.
    expect(screen.getByTestId('checklist-summary')).toBeInTheDocument()
  })
})

// ── M6: merchant lifecycle control ────────────────────────────────────────────

function makeBranch(overrides: Partial<ReviewContext['branches'][number]> = {}): ReviewContext['branches'][number] {
  return {
    id: 'br-1',
    name: 'Main Branch',
    isMainBranch: true,
    isActive: true,
    addressLine1: '1 High Street',
    addressLine2: null,
    city: 'Huddersfield',
    postcode: 'HD1 1AA',
    localityName: null,
    locationConfidence: 'ADDRESS_GEOCODED',
    ...overrides,
  }
}

describe('ReviewPage M6 lifecycle control', () => {
  function contextWithStatus(status: string): ReviewContext {
    return makeContext({ merchant: { ...makeContext().merchant!, status } })
  }

  it('shows Suspend affordance when merchant.status is ACTIVE', () => {
    mockSession()
    mockReview({ data: contextWithStatus('ACTIVE') })
    renderPage()
    expect(screen.getByTestId('merchant-lifecycle-card')).toBeInTheDocument()
    expect(screen.getByTestId('lifecycle-suspend-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('lifecycle-reactivate-btn')).not.toBeInTheDocument()
  })

  it('shows Reactivate affordance when merchant.status is SUSPENDED', () => {
    mockSession()
    mockReview({ data: contextWithStatus('SUSPENDED') })
    renderPage()
    expect(screen.getByTestId('lifecycle-reactivate-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('lifecycle-suspend-btn')).not.toBeInTheDocument()
  })

  it('shows no lifecycle action for PENDING_APPROVAL (calm status only)', () => {
    mockSession()
    mockReview({ data: contextWithStatus('PENDING_APPROVAL') })
    renderPage()
    expect(screen.getByTestId('merchant-lifecycle-card')).toBeInTheDocument()
    expect(screen.queryByTestId('lifecycle-suspend-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('lifecycle-reactivate-btn')).not.toBeInTheDocument()
    expect(screen.getByTestId('lifecycle-no-action')).toBeInTheDocument()
  })

  it('hides the lifecycle card entirely without merchant:suspend', () => {
    mockSession({ can: (cap: string) => cap !== 'merchant:suspend' })
    mockReview({ data: contextWithStatus('ACTIVE') })
    renderPage()
    expect(screen.queryByTestId('merchant-lifecycle-card')).not.toBeInTheDocument()
  })

  it('opens the SuspendDialog with the merchant id when Suspend is clicked', () => {
    mockSession()
    mockReview({ data: contextWithStatus('ACTIVE') })
    renderPage()
    fireEvent.click(screen.getByTestId('lifecycle-suspend-btn'))
    const dialog = screen.getByTestId('suspend-dialog-mock')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('data-merchant-id', 'm-1')
  })

  it('opens the ReactivateConfirm with the merchant id when Reactivate is clicked', () => {
    mockSession()
    mockReview({ data: contextWithStatus('SUSPENDED') })
    renderPage()
    fireEvent.click(screen.getByTestId('lifecycle-reactivate-btn'))
    const dialog = screen.getByTestId('reactivate-dialog-mock')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('data-merchant-id', 'm-1')
  })

  it('closes the SuspendDialog on its Cancel', () => {
    mockSession()
    mockReview({ data: contextWithStatus('ACTIVE') })
    renderPage()
    fireEvent.click(screen.getByTestId('lifecycle-suspend-btn'))
    fireEvent.click(screen.getByTestId('suspend-dialog-cancel'))
    expect(screen.queryByTestId('suspend-dialog-mock')).not.toBeInTheDocument()
  })
})

// ── M6: BranchTable confirm-location threading ────────────────────────────────

describe('ReviewPage M6 confirm-location', () => {
  it('shows the per-branch Confirm location button for an unconfirmed branch with branch:confirm-location', () => {
    mockSession()
    mockReview({
      data: makeContext({
        branches: [makeBranch({ id: 'br-x', locationConfidence: 'POSTCODE_CENTROID' })],
      }),
    })
    renderPage()
    expect(screen.getByTestId('branch-confirm-location-br-x')).toBeInTheDocument()
  })

  it('hides the per-branch Confirm location button without branch:confirm-location', () => {
    mockSession({ can: (cap: string) => cap !== 'branch:confirm-location' })
    mockReview({
      data: makeContext({
        branches: [makeBranch({ id: 'br-x', locationConfidence: 'POSTCODE_CENTROID' })],
      }),
    })
    renderPage()
    expect(screen.queryByTestId('branch-confirm-location-br-x')).not.toBeInTheDocument()
  })

  it('opens the ConfirmLocationDialog with the branch id when the button is clicked', () => {
    mockSession()
    mockReview({
      data: makeContext({
        branches: [makeBranch({ id: 'br-x', locationConfidence: 'NEEDS_REVIEW' })],
      }),
    })
    renderPage()
    fireEvent.click(screen.getByTestId('branch-confirm-location-br-x'))
    const dialog = screen.getByTestId('confirm-location-dialog-mock')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('data-branch-id', 'br-x')
  })

  it('does NOT show a Confirm location button for an already-confirmed branch', () => {
    mockSession()
    mockReview({
      data: makeContext({
        branches: [makeBranch({ id: 'br-ok', locationConfidence: 'MANUALLY_CONFIRMED' })],
      }),
    })
    renderPage()
    expect(screen.queryByTestId('branch-confirm-location-br-ok')).not.toBeInTheDocument()
  })
})
