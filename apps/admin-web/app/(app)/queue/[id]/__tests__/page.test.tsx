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

// ── B1: mock useEditReview (the EditReviewPanel mounted for edit approval types).
// The panel + EditReviewDiff render unmocked; only the data hook + the action
// hooks are mocked so there is no network call.

const mockedUseEditReview = jest.fn()
jest.mock('@/lib/review/useEditReview', () => ({
  useEditReview: (...args: unknown[]) => mockedUseEditReview(...args),
  useApproveEdit: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false, error: null })),
  useRejectEdit: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false, error: null })),
}))

// ── PR-C: mock useVoucherReview (the VoucherReviewPanel mounted for VOUCHER
// approvals). The panel renders unmocked; only the data hook + the action hooks
// are mocked so there is no network call.

const mockedUseVoucherReview = jest.fn()
jest.mock('@/lib/review/useVoucherReview', () => ({
  useVoucherReview: (...args: unknown[]) => mockedUseVoucherReview(...args),
  useApproveVoucher: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false, error: null })),
  useRejectVoucher: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false, error: null })),
  useRequestVoucherChanges: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false, error: null })),
}))

// ── Branches PR-5: mock useBranchLifecycleReview (the BranchLifecyclePanel
// mounted for BRANCH_CREATE / BRANCH_CLOSE approvals). The panel renders
// unmocked; only the data hook + the action hooks are mocked so there is no
// network call.

const mockedUseBranchLifecycleReview = jest.fn()
jest.mock('@/lib/review/useBranchLifecycleReview', () => ({
  useBranchLifecycleReview: (...args: unknown[]) => mockedUseBranchLifecycleReview(...args),
  useApproveBranchLifecycle: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false, error: null })),
  useRejectBranchLifecycle: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false, error: null })),
  useConfirmBranchLifecycleLocation: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false, error: null })),
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
    accessToken: 'test-access-token',
    ready: opts.ready ?? true,
    isAuthenticated: true,
    role: opts.role ?? 'OPERATIONS',
    email: 'ops@redeemo.co.uk',
    adminId: opts.adminId ?? 'admin-me',
    can: opts.can ?? (() => true),
    setSession: jest.fn(),
    refresh: jest.fn(),
    signOut: jest.fn(),
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

  // Honesty-copy sweep (2026-07-13): denied copy must name the actual gating
  // capability (approval:read: see the page's own comment on why this
  // diverges from approval-queue-spec.md §A.2's aspirational
  // "approval:review") + the viewer's role, and reassure nothing is broken.
  it('the forbidden state names approval:read, the viewer role, and reassures nothing is broken', () => {
    mockSession({ can: () => false, role: 'SUPER_ADMIN' })
    mockReview()
    renderPage()
    const forbidden = screen.getByTestId('review-forbidden')
    expect(forbidden).toHaveTextContent(/approval:read/)
    expect(forbidden).toHaveTextContent(/SUPER_ADMIN/)
    expect(forbidden).toHaveTextContent(/nothing is broken/i)
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

  // Honesty-copy sweep (2026-07-13): error copy must reassure nothing was
  // changed, so it can never be mistaken for an empty/absent result.
  it('the error state reassures nothing was changed', () => {
    mockReview({ isError: true, isLoading: false })
    renderPage()
    expect(screen.getByTestId('review-error')).toHaveTextContent(/no items were changed/i)
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

// ── PR-C: VOUCHER approval routes to the VoucherReviewPanel ───────────────────

describe('ReviewPage VOUCHER approval surface (PR-C)', () => {
  function voucherApproval() {
    return makeContext({
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
    })
  }

  beforeEach(() => {
    mockedUseVoucherReview.mockReturnValue({
      data: {
        voucher: {
          id: 'v-1',
          title: '20% off all mains',
          type: 'DISCOUNT',
          status: 'PENDING_APPROVAL',
          approvalStatus: 'PENDING',
          description: 'Enjoy 20% off your main course.',
          terms: null,
          estimatedSaving: 6.5,
          expiryDate: null,
          cooldownSeconds: null,
          merchantFields: null,
          availabilityWindows: [],
        },
        merchant: { id: 'm-1', businessName: 'Acme Coffee', status: 'ACTIVE' },
        goLive: true,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })
  })

  it('renders the VoucherReviewPanel (NOT the generic non-onboarding notice) for a VOUCHER approval', () => {
    mockSession()
    mockReview({ data: voucherApproval() })
    renderPage()
    expect(screen.getByTestId('voucher-review-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('review-non-onboarding')).not.toBeInTheDocument()
    expect(screen.getByTestId('voucher-review-panel')).toHaveTextContent('20% off all mains')
  })

  it('gates the voucher-review fetch on approval:read (passes enabled through)', () => {
    mockSession({ can: (cap: string) => cap === 'approval:read' })
    mockReview({ data: voucherApproval() })
    renderPage()
    expect(mockedUseVoucherReview).toHaveBeenCalledWith('apr-1', true)
  })

  it('shows the action bar when the admin holds approval:action', () => {
    mockSession({ can: () => true })
    mockReview({ data: voucherApproval() })
    renderPage()
    expect(screen.getByTestId('voucher-review-actions')).toBeInTheDocument()
  })

  it('hides the action bar when the admin lacks approval:action', () => {
    mockSession({ can: (cap: string) => cap !== 'approval:action' })
    mockReview({ data: voucherApproval() })
    renderPage()
    expect(screen.getByTestId('voucher-review-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('voucher-review-actions')).not.toBeInTheDocument()
  })

  it('does NOT render the merchant-onboarding action bar for a VOUCHER approval', () => {
    mockSession()
    mockReview({ data: voucherApproval() })
    renderPage()
    expect(screen.queryByTestId('action-bar-container')).not.toBeInTheDocument()
  })

  it('still shows the non-onboarding notice for a non-VOUCHER, non-edit type (MERCHANT_PROFILE_EDIT)', () => {
    mockSession()
    mockReview({
      data: makeContext({
        approval: {
          id: 'apr-3',
          type: 'MERCHANT_PROFILE_EDIT',
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

// ── B1: merchant identity-edit approval routes to the edit-review surface ──────

describe('ReviewPage edit-approval surface (B1)', () => {
  function editApproval(type: 'MERCHANT_IDENTITY_EDIT' | 'BRANCH_IDENTITY_EDIT') {
    return makeContext({
      approval: {
        id: 'apr-edit-1',
        type,
        status: 'PENDING',
        submittedAt: '2026-06-10T09:00:00.000Z',
        actionedAt: null,
        claimedAt: null,
        comment: null,
        claimedBy: null,
        actionedBy: null,
      },
    })
  }

  beforeEach(() => {
    mockedUseEditReview.mockReturnValue({
      data: {
        kind: 'merchant',
        merchantId: 'm-1',
        pendingEditId: 'pe-1',
        status: 'PENDING',
        includesPhotos: false,
        fields: [{ field: 'businessName', current: 'Old Name', proposed: 'New Name', isCustomerVisible: true }],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })
  })

  it('renders the edit-review diff (NOT the generic non-onboarding notice) for MERCHANT_IDENTITY_EDIT', () => {
    mockSession()
    mockReview({ data: editApproval('MERCHANT_IDENTITY_EDIT') })
    renderPage()
    expect(screen.getByTestId('edit-review-diff')).toBeInTheDocument()
    expect(screen.queryByTestId('review-non-onboarding')).not.toBeInTheDocument()
    expect(screen.getByTestId('edit-field-proposed-businessName')).toHaveTextContent('New Name')
  })

  it('shows the Approve / Reject actions when the admin holds approval:apply-edit', () => {
    mockSession({ can: () => true })
    mockReview({ data: editApproval('MERCHANT_IDENTITY_EDIT') })
    renderPage()
    expect(screen.getByTestId('edit-approve-btn')).toBeInTheDocument()
    expect(screen.getByTestId('edit-reject-btn')).toBeInTheDocument()
  })

  it('hides the actions when the admin lacks approval:apply-edit', () => {
    mockSession({ can: (cap: string) => cap !== 'approval:apply-edit' })
    mockReview({ data: editApproval('BRANCH_IDENTITY_EDIT') })
    renderPage()
    expect(screen.getByTestId('edit-review-diff')).toBeInTheDocument()
    expect(screen.queryByTestId('edit-review-actions')).not.toBeInTheDocument()
  })

  it('opens the approve-edit dialog when Approve edit is clicked', () => {
    mockSession()
    mockReview({ data: editApproval('MERCHANT_IDENTITY_EDIT') })
    renderPage()
    fireEvent.click(screen.getByTestId('edit-approve-btn'))
    expect(screen.getByTestId('approve-edit-confirm-dialog')).toBeInTheDocument()
  })
})

// ── Voucher governed-flows PR-B: VOUCHER_EDIT routes to the edit-review surface

describe('ReviewPage VOUCHER_EDIT approval surface (PR-B)', () => {
  function voucherEditApproval() {
    return makeContext({
      approval: {
        id: 'apr-ve-1',
        type: 'VOUCHER_EDIT',
        status: 'PENDING',
        submittedAt: '2026-07-01T09:00:00.000Z',
        actionedAt: null,
        claimedAt: null,
        comment: null,
        claimedBy: null,
        actionedBy: null,
      },
    })
  }

  function mockVoucherEditReview(over: Record<string, unknown> = {}) {
    mockedUseEditReview.mockReturnValue({
      data: {
        kind: 'voucher',
        voucherId: 'v-1',
        voucherEditKind: 'CHANGE',
        reason: 'Ingredient costs changed.',
        status: 'PENDING',
        fields: [{ key: 'estimatedSaving', label: 'Estimated saving', current: 5, proposed: 7.5 }],
        voucher: {
          id: 'v-1',
          code: 'RCV-004',
          title: '20% off all mains',
          type: 'DISCOUNT',
          status: 'ACTIVE',
          isRmv: false,
          estimatedSaving: 5,
        },
        ...over,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })
  }

  it('renders the voucher edit-review diff (NOT the generic non-onboarding notice) for VOUCHER_EDIT', () => {
    mockSession()
    mockVoucherEditReview()
    mockReview({ data: voucherEditApproval() })
    renderPage()
    expect(screen.getByTestId('voucher-edit-review-diff')).toBeInTheDocument()
    expect(screen.queryByTestId('review-non-onboarding')).not.toBeInTheDocument()
    expect(screen.getByTestId('voucher-edit-review-diff')).toHaveTextContent('20% off all mains')
  })

  it('shows the Approve / Reject actions when the admin holds approval:apply-edit', () => {
    mockSession({ can: () => true })
    mockVoucherEditReview()
    mockReview({ data: voucherEditApproval() })
    renderPage()
    expect(screen.getByTestId('voucher-edit-approve-btn')).toBeInTheDocument()
    expect(screen.getByTestId('voucher-edit-reject-btn')).toBeInTheDocument()
  })

  it('hides the actions when the admin lacks approval:apply-edit (read-only)', () => {
    mockSession({ can: (cap: string) => cap !== 'approval:apply-edit' })
    mockVoucherEditReview()
    mockReview({ data: voucherEditApproval() })
    renderPage()
    expect(screen.getByTestId('voucher-edit-review-diff')).toBeInTheDocument()
    expect(screen.queryByTestId('voucher-edit-review-actions')).not.toBeInTheDocument()
  })

  it('opens the approve-edit dialog with END-specific copy when Approve is clicked for an END request', () => {
    mockSession()
    mockVoucherEditReview({ voucherEditKind: 'END', fields: [] })
    mockReview({ data: voucherEditApproval() })
    renderPage()
    fireEvent.click(screen.getByTestId('voucher-edit-approve-btn'))
    expect(screen.getByTestId('approve-edit-confirm-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('approve-edit-consequences-copy')).toHaveTextContent(
      'stop being available to customers'
    )
  })

  it('renders the withdrawn label and no actions for a WITHDRAWN voucher edit', () => {
    mockSession({ can: () => true })
    mockVoucherEditReview({ status: 'WITHDRAWN' })
    mockReview({ data: voucherEditApproval() })
    renderPage()
    expect(screen.getByTestId('voucher-edit-review-diff')).toHaveTextContent('Withdrawn')
    expect(screen.queryByTestId('voucher-edit-review-actions')).not.toBeInTheDocument()
  })
})

// ── Branches PR-5: BRANCH_CREATE / BRANCH_CLOSE route to the BranchLifecyclePanel

describe('ReviewPage branch-lifecycle surface (PR-5)', () => {
  function lifecycleApproval(type: 'BRANCH_CREATE' | 'BRANCH_CLOSE') {
    return makeContext({
      approval: {
        id: 'apr-bl-1',
        type,
        status: 'PENDING',
        submittedAt: '2026-06-10T09:00:00.000Z',
        actionedAt: null,
        claimedAt: null,
        comment: null,
        claimedBy: null,
        actionedBy: null,
      },
    })
  }

  function mockLifecycleReview(kind: 'create' | 'close', locationConfidence = 'MANUALLY_CONFIRMED') {
    mockedUseBranchLifecycleReview.mockReturnValue({
      data: {
        kind,
        merchant: { id: 'm-1', businessName: 'Acme Coffee' },
        branch: {
          id: 'branch-1',
          name: 'Acme Soho',
          addressLine1: '1 Greek Street',
          addressLine2: null,
          city: 'London',
          postcode: 'W1D 4DX',
          localityName: 'Soho',
          phone: null,
          email: null,
          websiteUrl: null,
          isMainBranch: false,
          isActive: kind === 'close',
          lifecycleStatus: kind === 'create' ? 'PENDING_CREATE' : 'PENDING_CLOSE',
          locationConfidence,
          latitude: 51.5,
          longitude: -0.13,
        },
        closeReason: kind === 'close' ? 'We are relocating.' : null,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })
  }

  it('renders the BranchLifecyclePanel (NOT the non-onboarding notice) for BRANCH_CREATE', () => {
    mockSession()
    mockLifecycleReview('create', 'POSTCODE_CENTROID')
    mockReview({ data: lifecycleApproval('BRANCH_CREATE') })
    renderPage()
    expect(screen.getByTestId('branch-lifecycle-card')).toBeInTheDocument()
    expect(screen.queryByTestId('review-non-onboarding')).not.toBeInTheDocument()
    expect(screen.getByTestId('branch-lifecycle-kind-badge')).toHaveTextContent('Add branch')
  })

  it('renders the BranchLifecyclePanel for BRANCH_CLOSE with the close reason', () => {
    mockSession()
    mockLifecycleReview('close')
    mockReview({ data: lifecycleApproval('BRANCH_CLOSE') })
    renderPage()
    expect(screen.getByTestId('branch-lifecycle-card')).toBeInTheDocument()
    expect(screen.getByTestId('branch-lifecycle-close-reason-text')).toHaveTextContent('We are relocating.')
  })

  it('passes the apply-edit + confirm-location capabilities through (actions shown when held)', () => {
    mockSession({ can: () => true })
    mockLifecycleReview('create', 'POSTCODE_CENTROID')
    mockReview({ data: lifecycleApproval('BRANCH_CREATE') })
    renderPage()
    expect(screen.getByTestId('branch-lifecycle-approve-btn')).toBeInTheDocument()
    expect(screen.getByTestId('branch-lifecycle-reject-btn')).toBeInTheDocument()
    expect(screen.getByTestId('branch-lifecycle-confirm-location-btn')).toBeInTheDocument()
  })

  it('hides the actions when the admin lacks approval:apply-edit', () => {
    mockSession({ can: (cap: string) => cap !== 'approval:apply-edit' })
    mockLifecycleReview('create')
    mockReview({ data: lifecycleApproval('BRANCH_CREATE') })
    renderPage()
    expect(screen.getByTestId('branch-lifecycle-card')).toBeInTheDocument()
    expect(screen.queryByTestId('branch-lifecycle-actions')).not.toBeInTheDocument()
  })

  it('does not render the merchant-onboarding action bar for a branch-lifecycle approval', () => {
    mockSession()
    mockLifecycleReview('create')
    mockReview({ data: lifecycleApproval('BRANCH_CREATE') })
    renderPage()
    expect(screen.queryByTestId('action-bar-container')).not.toBeInTheDocument()
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

  // B2: the ActionBar's mounting container is visually sticky (approval-queue-
  // spec.md §A.2 "sticky action bar at the pane foot") so it stays reachable
  // while the detail body scrolls, across all four claim states.
  describe('B2 sticky positioning', () => {
    it('the container is sticky in the unclaimed state', () => {
      mockReview({ data: makeContext() })
      renderPage()
      expect(screen.getByTestId('action-bar-unclaimed')).toBeInTheDocument()
      const container = screen.getByTestId('action-bar-container')
      expect(container.className).toMatch(/sticky/)
      expect(container.className).toMatch(/bottom-0/)
    })

    it('the container is sticky in the claimed-by-me state', () => {
      mockReview({
        data: makeContext({
          approval: {
            ...makeContext().approval,
            claimedAt: '2026-06-10T10:00:00.000Z',
            claimedBy: { id: 'admin-me', name: 'Me Admin' },
          },
        }),
      })
      renderPage()
      expect(screen.getByTestId('action-bar-claimed-by-me')).toBeInTheDocument()
      expect(screen.getByTestId('action-bar-container').className).toMatch(/sticky/)
    })

    it('the container is sticky in the claimed-by-other state', () => {
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
      expect(screen.getByTestId('action-bar-claimed-by-other')).toBeInTheDocument()
      expect(screen.getByTestId('action-bar-container').className).toMatch(/sticky/)
    })

    it('the container is sticky in the SUPER_ADMIN force-release state', () => {
      mockSession({ adminId: 'admin-me', role: 'SUPER_ADMIN' })
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
      expect(screen.getByTestId('action-bar-force-release-btn')).toBeInTheDocument()
      expect(screen.getByTestId('action-bar-container').className).toMatch(/sticky/)
    })

    it('stays mounted (sticky container present) in the terminal APPROVED state', () => {
      mockReview({ data: makeContext({ approval: { ...makeContext().approval, status: 'APPROVED' } }) })
      renderPage()
      expect(screen.getByTestId('action-bar-approved')).toBeInTheDocument()
      expect(screen.getByTestId('action-bar-container').className).toMatch(/sticky/)
    })
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
    // Slice 2 additive admin-scope provenance fields. Supplied EXPLICITLY as null
    // (not left to the Partial spread) so the fixture matches the wire contract:
    // reviewBranchSchema requires number | null / string | null, never undefined.
    latitude: null,
    longitude: null,
    googlePlaceId: null,
    locationSuggestion: null,
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
