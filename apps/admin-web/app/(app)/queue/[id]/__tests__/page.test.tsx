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

  it('renders the activity list', () => {
    mockReview({ data: makeContext() })
    renderPage()
    expect(screen.getByTestId('activity-list')).toBeInTheDocument()
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

  it('still renders the activity list when the merchant is unavailable but activity exists', () => {
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
    expect(screen.getByTestId('activity-list')).toBeInTheDocument()
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
})
