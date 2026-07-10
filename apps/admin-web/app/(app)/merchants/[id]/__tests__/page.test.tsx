/**
 * /merchants/[id] Merchant 360 workspace (slice A1).
 *
 * Covers: the page-level merchant:read capability gate, loading/error states,
 * the workspace header (identity + status pills + branches stat) and its
 * lifecycle action gating, URL-addressable tab routing (?tab= round-trip,
 * default Overview, unknown -> Overview), the Overview + Business identity tab
 * content with every existing edit-affordance capability gate + dialog mount,
 * and the honest not-built placeholder panels.
 *
 * The tab components (header, tab bar, Overview, Business identity, placeholder)
 * render for real; only the leaf dialogs + the SubmitForReviewCard are mocked so
 * we detect mounting without their React Query mutations.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import MerchantDetailPage from '../page'
import type { MerchantDetail } from '@/lib/api/merchants'

// ── Mock next/link ────────────────────────────────────────────────────────────

jest.mock('next/link', () => {
  return function MockLink({
    href,
    children,
    // `scroll` is a real next/link prop but not a valid DOM attribute; drop it so
    // the mocked <a> does not emit an unknown-prop warning.
    scroll,
    ...rest
  }: {
    href: string
    children: React.ReactNode
    scroll?: boolean
    [key: string]: unknown
  }) {
    void scroll
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  }
})

// ── Mock next/navigation (params + the ?tab= search param + pathname) ──────────

// `mockSearch` is read by the useSearchParams mock at call time; each test sets
// it (e.g. 'tab=identity') and afterEach resets it to '' (default -> Overview).
let mockSearch = ''
jest.mock('next/navigation', () => ({
  useParams: jest.fn(() => ({ id: 'm-1' })),
  useSearchParams: () => new URLSearchParams(mockSearch),
  usePathname: () => '/merchants/m-1',
}))

// ── Mock useSession ───────────────────────────────────────────────────────────

jest.mock('@/lib/auth/useSession', () => ({
  useSession: jest.fn(),
}))

// ── Mock useMerchantDetail ────────────────────────────────────────────────────

jest.mock('@/lib/merchants/useMerchantDetail', () => ({
  useMerchantDetail: jest.fn(),
  merchantDetailQueryKey: (id: string) => ['admin-merchant-detail', id],
}))

// ── Mock the leaf dialogs + submit card ────────────────────────────────────────

jest.mock('@/features/merchants/EditMerchantWebsiteDialog', () => ({
  EditMerchantWebsiteDialog: ({ merchantId, onCancel }: { merchantId: string; onCancel: () => void }) => (
    <div data-testid="edit-merchant-website-dialog-mock" data-merchant-id={merchantId}>
      <button onClick={onCancel} data-testid="edit-website-dialog-cancel">Cancel</button>
    </div>
  ),
}))

jest.mock('@/features/merchants/EditMerchantIdentityDialog', () => ({
  EditMerchantIdentityDialog: ({ merchantId, onCancel }: { merchantId: string; onCancel: () => void }) => (
    <div data-testid="edit-merchant-identity-dialog-mock" data-merchant-id={merchantId}>
      <button onClick={onCancel} data-testid="edit-identity-dialog-cancel">Cancel</button>
    </div>
  ),
}))

jest.mock('@/features/merchants/ProposeMerchantEditDialog', () => ({
  ProposeMerchantEditDialog: ({ merchantId, onCancel }: { merchantId: string; onCancel: () => void }) => (
    <div data-testid="propose-merchant-edit-dialog-mock" data-merchant-id={merchantId}>
      <button onClick={onCancel} data-testid="propose-edit-dialog-cancel">Cancel</button>
    </div>
  ),
}))

jest.mock('@/features/merchants/EditCategoryDialog', () => ({
  EditCategoryDialog: ({ merchantId, onCancel }: { merchantId: string; onCancel: () => void }) => (
    <div data-testid="edit-category-dialog-mock" data-merchant-id={merchantId}>
      <button onClick={onCancel} data-testid="edit-category-dialog-cancel">Cancel</button>
    </div>
  ),
}))

jest.mock('@/features/merchants/SubmitForReviewCard', () => ({
  SubmitForReviewCard: ({ onSubmit, onboardingStep }: { onSubmit: () => void; onboardingStep: string }) => (
    <div data-testid="submit-for-review-card-mock" data-onboarding-step={onboardingStep}>
      <button onClick={onSubmit} data-testid="submit-card-trigger">Submit</button>
    </div>
  ),
}))

jest.mock('@/features/merchants/SubmitMerchantDialog', () => ({
  SubmitMerchantDialog: ({
    merchantId,
    isResubmit,
    onCancel,
  }: {
    merchantId: string
    isResubmit: boolean
    onCancel: () => void
  }) => (
    <div
      data-testid="submit-merchant-dialog-mock"
      data-merchant-id={merchantId}
      data-is-resubmit={String(isResubmit)}
    >
      <button onClick={onCancel} data-testid="submit-merchant-dialog-cancel">Cancel</button>
    </div>
  ),
}))

jest.mock('@/features/merchants/SuspendDialog', () => ({
  SuspendDialog: ({ merchantId, onCancel }: { merchantId: string; onCancel: () => void }) => (
    <div data-testid="suspend-dialog-mock" data-merchant-id={merchantId}>
      <button onClick={onCancel} data-testid="suspend-dialog-cancel">Cancel</button>
    </div>
  ),
}))

jest.mock('@/features/merchants/ReactivateConfirm', () => ({
  ReactivateConfirm: ({ merchantId, onCancel }: { merchantId: string; onCancel: () => void }) => (
    <div data-testid="reactivate-confirm-mock" data-merchant-id={merchantId}>
      <button onClick={onCancel} data-testid="reactivate-confirm-cancel">Cancel</button>
    </div>
  ),
}))

// ── A2 branch dialogs (leaf mocks) ─────────────────────────────────────────────

jest.mock('@/features/merchants/EditBranchDialog', () => ({
  EditBranchDialog: ({ branchId, onCancel }: { branchId: string; onCancel: () => void }) => (
    <div data-testid="edit-branch-dialog-mock" data-branch-id={branchId}>
      <button onClick={onCancel} data-testid="edit-branch-dialog-cancel">Cancel</button>
    </div>
  ),
}))

jest.mock('@/features/merchants/AddBranchDialog', () => ({
  AddBranchDialog: ({ merchantId, onCancel }: { merchantId: string; onCancel: () => void }) => (
    <div data-testid="add-branch-dialog-mock" data-merchant-id={merchantId}>
      <button onClick={onCancel} data-testid="add-branch-dialog-cancel">Cancel</button>
    </div>
  ),
}))

jest.mock('@/features/merchants/DeleteBranchConfirm', () => ({
  DeleteBranchConfirm: ({ branchId, onCancel }: { branchId: string; onCancel: () => void }) => (
    <div data-testid="delete-branch-confirm-mock" data-branch-id={branchId}>
      <button onClick={onCancel} data-testid="delete-branch-confirm-cancel">Cancel</button>
    </div>
  ),
}))

// ── A2 Documents card + Activity timeline (leaf mocks; they do network I/O) ─────
// The tab WRAPPERS (DocumentsTab, ActivityTab) render for real, so the canManage
// passthrough and the approval:read gate are genuinely exercised here.

jest.mock('@/features/merchants/MerchantDocumentsCard', () => ({
  MerchantDocumentsCard: ({ merchantId, canManage }: { merchantId: string; canManage: boolean }) => (
    <div
      data-testid="merchant-documents-card-mock"
      data-merchant-id={merchantId}
      data-can-manage={String(canManage)}
    />
  ),
}))

jest.mock('@/features/timeline/ActivityTimeline', () => ({
  ActivityTimeline: ({
    merchantId,
    enabled,
    filter,
  }: {
    merchantId: string
    enabled?: boolean
    filter?: string
  }) => (
    <div
      data-testid="activity-timeline-mock"
      data-merchant-id={merchantId}
      data-enabled={String(enabled)}
      data-filter={filter}
    />
  ),
}))

// ── A3 Redemptions tab: mock the D67 list hook (network I/O). The RedemptionsTab
// wrapper + the shared table/filter/pager render for real, so the merchantId
// wire-pin + hideMerchantColumn + fail-closed gate are genuinely exercised.

jest.mock('@/lib/redemptions/useRedemptions', () => ({
  useRedemptions: jest.fn(),
}))

// ── A3 Vouchers tab: mock the admin RMV read hook + the two co-build dialogs
// (leaves that own mutations). The VouchersTab wrapper renders for real, so the
// DRAFT-only + capability gating of the edit/submit affordances is exercised.

jest.mock('@/lib/vouchers/useAdminRmvVouchers', () => ({
  useAdminRmvVouchers: jest.fn(),
  adminRmvQueryKey: (id: string) => ['admin-merchant-rmv', id],
}))

jest.mock('@/features/merchants/m360/RmvCoBuildDialog', () => ({
  RmvCoBuildDialog: ({
    merchantId,
    voucher,
    onCancel,
  }: {
    merchantId: string
    voucher: { id: string }
    onCancel: () => void
  }) => (
    <div
      data-testid="rmv-cobuild-dialog-mock"
      data-merchant-id={merchantId}
      data-voucher-id={voucher.id}
    >
      <button onClick={onCancel} data-testid="rmv-cobuild-dialog-cancel">Cancel</button>
    </div>
  ),
}))

jest.mock('@/features/merchants/m360/SubmitRmvDialog', () => ({
  SubmitRmvDialog: ({
    merchantId,
    voucher,
    onCancel,
  }: {
    merchantId: string
    voucher: { id: string }
    onCancel: () => void
  }) => (
    <div
      data-testid="submit-rmv-dialog-mock"
      data-merchant-id={merchantId}
      data-voucher-id={voucher.id}
    >
      <button onClick={onCancel} data-testid="submit-rmv-dialog-cancel">Cancel</button>
    </div>
  ),
}))

import { useSession } from '@/lib/auth/useSession'
import { useMerchantDetail } from '@/lib/merchants/useMerchantDetail'
import type { UseMerchantDetailResult } from '@/lib/merchants/useMerchantDetail'
import { useRedemptions } from '@/lib/redemptions/useRedemptions'
import { useAdminRmvVouchers } from '@/lib/vouchers/useAdminRmvVouchers'
import type { AdminRmvVoucher } from '@/lib/api/vouchers'

const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>
const mockedUseMerchantDetail = useMerchantDetail as jest.MockedFunction<typeof useMerchantDetail>
const mockedUseRedemptions = useRedemptions as jest.MockedFunction<typeof useRedemptions>
const mockedUseAdminRmvVouchers = useAdminRmvVouchers as jest.MockedFunction<typeof useAdminRmvVouchers>

function mockRedemptions(overrides: Partial<ReturnType<typeof useRedemptions>> = {}) {
  mockedUseRedemptions.mockReturnValue({
    data: { items: [], total: 0, limit: 25, offset: 0 },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: jest.fn(),
    ...overrides,
  })
}

function makeRmvVoucher(overrides: Partial<AdminRmvVoucher> = {}): AdminRmvVoucher {
  return {
    id: 'v-rmv-1',
    code: 'RMV-001',
    title: 'Buy one, get one free',
    type: 'BOGO',
    estimatedSaving: 12,
    status: 'DRAFT',
    approvalStatus: 'PENDING',
    merchantFields: {},
    allowedFields: ['title', 'description', 'estimatedSaving', 'terms', 'imageUrl', 'merchantFields'],
    ...overrides,
  }
}

function mockRmv(overrides: Partial<ReturnType<typeof useAdminRmvVouchers>> = {}) {
  mockedUseAdminRmvVouchers.mockReturnValue({
    data: { vouchers: [makeRmvVoucher()] },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: jest.fn(),
    ...overrides,
  })
}

function mockSession(opts: { ready?: boolean; can?: (cap: string) => boolean } = {}) {
  mockedUseSession.mockReturnValue({
    accessToken: 'test-access-token',
    ready: opts.ready ?? true,
    isAuthenticated: true,
    role: 'OPERATIONS',
    email: 'ops@redeemo.co.uk',
    adminId: 'admin-me',
    can: opts.can ?? (() => true),
    setSession: jest.fn(),
    refresh: jest.fn(),
    signOut: jest.fn(),
  })
}

function mockDetail(overrides: Partial<UseMerchantDetailResult> = {}) {
  mockedUseMerchantDetail.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  })
}

function makeDetail(overrides: Partial<MerchantDetail> = {}): MerchantDetail {
  return {
    merchant: {
      id: 'm-1',
      businessName: 'Acme Coffee',
      tradingName: 'Acme',
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      onboardingStep: 'LIVE',
      websiteUrl: 'https://acme.test',
      vatNumber: 'GB123456789',
      companyNumber: '12345678',
      logoUrl: null,
      category: 'Restaurants',
      primaryCategoryId: 'cat-1',
      categoryLocked: false,
      description: 'We sell coffee',
      hasPendingIdentityEdit: false,
      submitChecklist: { branch_created: true, contract_signed: true, rmv_configured: true, all_complete: true },
      canSubmitOnBehalf: false,
    },
    branches: [
      {
        id: 'br-1',
        name: 'Main Branch',
        isMainBranch: true,
        addressLine1: '1 High Street',
        addressLine2: null,
        city: 'Huddersfield',
        postcode: 'HD1 1AA',
        localityName: 'Huddersfield',
        locationConfidence: 'MANUALLY_CONFIRMED',
        phone: '+447700900123',
        email: 'main@acme.test',
        websiteUrl: null,
        isActive: true,
      },
      {
        id: 'br-2',
        name: 'Second Branch',
        isMainBranch: false,
        addressLine1: '2 Low Street',
        addressLine2: null,
        city: 'Huddersfield',
        postcode: 'HD1 2BB',
        localityName: 'Huddersfield',
        locationConfidence: 'POSTCODE_CENTROID',
        phone: null,
        email: null,
        websiteUrl: null,
        isActive: true,
      },
    ],
    ...overrides,
  }
}

afterEach(() => {
  jest.clearAllMocks()
  mockSearch = ''
})

// ── Capability gate ─────────────────────────────────────────────────────────

describe('Merchant 360 capability gate', () => {
  it('shows the loader while session is not ready', () => {
    mockSession({ ready: false, can: () => false })
    mockDetail()
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-detail-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('merchant-detail-forbidden')).not.toBeInTheDocument()
  })

  it('shows forbidden when the admin lacks merchant:read', () => {
    mockSession({ can: () => false })
    mockDetail()
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-detail-forbidden')).toBeInTheDocument()
  })

  it('calls useMerchantDetail with enabled:false when lacking merchant:read', () => {
    mockSession({ can: () => false })
    mockDetail()
    render(<MerchantDetailPage />)
    expect(mockedUseMerchantDetail).toHaveBeenCalledWith('m-1', false)
  })

  it('calls useMerchantDetail with enabled:true when the admin has merchant:read', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(mockedUseMerchantDetail).toHaveBeenCalledWith('m-1', true)
  })
})

// ── Loading / error ───────────────────────────────────────────────────────────

describe('Merchant 360 loading/error states', () => {
  beforeEach(() => mockSession())

  it('shows loading state while isLoading is true', () => {
    mockDetail({ isLoading: true })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-detail-loading')).toBeInTheDocument()
  })

  it('shows error state when isError is true', () => {
    mockDetail({ isError: true })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-detail-error')).toBeInTheDocument()
  })

  it('shows error state when data is undefined (and not loading)', () => {
    mockDetail({ data: undefined, isLoading: false, isError: false })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-detail-error')).toBeInTheDocument()
  })

  it('calls refetch when the retry button is clicked', () => {
    const refetch = jest.fn()
    mockDetail({ isError: true, refetch })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})

// ── Workspace header ───────────────────────────────────────────────────────────

describe('Merchant 360 workspace header', () => {
  beforeEach(() => mockSession())

  it('renders the name, sub-line, status + verification pills, and branches stat', () => {
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    const header = screen.getByTestId('merchant-workspace-header')
    expect(header).toHaveTextContent('Acme Coffee')
    expect(header).toHaveTextContent('Trading as Acme')
    expect(header).toHaveTextContent('Active')
    expect(header).toHaveTextContent('Verified')
    expect(screen.getByTestId('workspace-stat-branches')).toHaveTextContent('2')
  })

  it('renders initials in the logo tile when there is no logo', () => {
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-workspace-logo')).toHaveTextContent('AC')
  })

  it('renders the back link to /merchants', () => {
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    const back = screen.getByRole('link', { name: /back to merchants directory/i })
    expect(back).toHaveAttribute('href', '/merchants')
  })
})

// ── Lifecycle action (header) ──────────────────────────────────────────────────

describe('Merchant 360 lifecycle action', () => {
  it('shows Suspend for an ACTIVE merchant with merchant:suspend and opens the dialog', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('lifecycle-suspend-btn'))
    expect(screen.getByTestId('suspend-dialog-mock')).toHaveAttribute('data-merchant-id', 'm-1')
  })

  it('shows Reactivate for a SUSPENDED merchant with merchant:suspend and opens the dialog', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail({ merchant: { ...makeDetail().merchant, status: 'SUSPENDED' } }) })
    render(<MerchantDetailPage />)
    expect(screen.queryByTestId('lifecycle-suspend-btn')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('lifecycle-reactivate-btn'))
    expect(screen.getByTestId('reactivate-confirm-mock')).toHaveAttribute('data-merchant-id', 'm-1')
  })

  it('shows a gated lock chip (no action button) for ACTIVE without merchant:suspend', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.queryByTestId('lifecycle-suspend-btn')).not.toBeInTheDocument()
    expect(screen.getByTestId('lifecycle-gated')).toBeInTheDocument()
  })

  it('shows NO lifecycle action for a non-Active/non-Suspended lifecycle (PENDING_APPROVAL)', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail({ merchant: { ...makeDetail().merchant, status: 'PENDING_APPROVAL' } }) })
    render(<MerchantDetailPage />)
    expect(screen.queryByTestId('lifecycle-suspend-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('lifecycle-reactivate-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('lifecycle-gated')).not.toBeInTheDocument()
  })

  it('closes the suspend dialog on its Cancel', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('lifecycle-suspend-btn'))
    fireEvent.click(screen.getByTestId('suspend-dialog-cancel'))
    expect(screen.queryByTestId('suspend-dialog-mock')).not.toBeInTheDocument()
  })
})

// ── Tab routing ────────────────────────────────────────────────────────────────

describe('Merchant 360 tab routing', () => {
  beforeEach(() => mockSession())

  it('defaults to the Overview tab when no ?tab= is present', () => {
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('workspace-overview')).toBeInTheDocument()
    expect(screen.queryByTestId('workspace-identity')).not.toBeInTheDocument()
    expect(screen.getByTestId('workspace-tab-overview')).toHaveAttribute('data-active', 'true')
  })

  it('renders the Business identity tab when ?tab=identity', () => {
    mockSearch = 'tab=identity'
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('workspace-identity')).toBeInTheDocument()
    expect(screen.queryByTestId('workspace-overview')).not.toBeInTheDocument()
    expect(screen.getByTestId('workspace-tab-identity')).toHaveAttribute('data-active', 'true')
  })

  it('falls back to Overview for an unknown ?tab= value', () => {
    mockSearch = 'tab=not-a-real-tab'
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('workspace-overview')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-tab-overview')).toHaveAttribute('data-active', 'true')
  })

  it('renders every tab in the bar as a ?tab= addressable link (round-trip)', () => {
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('workspace-tab-identity')).toHaveAttribute(
      'href',
      '/merchants/m-1?tab=identity'
    )
    expect(screen.getByTestId('workspace-tab-branches')).toHaveAttribute(
      'href',
      '/merchants/m-1?tab=branches'
    )
  })
})

// ── Placeholder honesty ────────────────────────────────────────────────────────

describe('Merchant 360 not-built placeholders', () => {
  beforeEach(() => mockSession())

  it('shows the "later slice" copy for a queued tab (Staff and access)', () => {
    mockSearch = 'tab=staff'
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('workspace-placeholder-staff')).toHaveTextContent(/later slice/i)
  })

  it('shows the net-new-schema gated copy for Notes (MerchantNote)', () => {
    mockSearch = 'tab=notes'
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('workspace-placeholder-notes')).toHaveTextContent(/MerchantNote/)
  })

  it('shows the aggregation gated copy for Performance', () => {
    mockSearch = 'tab=performance'
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('workspace-placeholder-performance')).toHaveTextContent(/aggregat/i)
  })

  it('shows the DPIA gated copy for Insights', () => {
    mockSearch = 'tab=insights'
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('workspace-placeholder-insights')).toHaveTextContent(/DPIA/)
  })
})

// ── Overview tab content ───────────────────────────────────────────────────────

describe('Merchant 360 Overview tab', () => {
  beforeEach(() => mockSession())

  it('renders category, website, and the branches count from the payload', () => {
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('overview-category')).toHaveTextContent('Restaurants')
    expect(screen.getByTestId('overview-website')).toHaveTextContent('https://acme.test')
    expect(screen.getByTestId('overview-branch-count')).toHaveTextContent('2')
  })

  it('links to the Business identity tab', () => {
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('overview-open-identity')).toHaveAttribute(
      'href',
      '/merchants/m-1?tab=identity'
    )
  })
})

// ── Overview: submit-for-review card ───────────────────────────────────────────

describe('Merchant 360 submit-for-review card (Overview)', () => {
  function makeSubmittable(onboardingStep = 'REGISTERED'): MerchantDetail {
    const base = makeDetail()
    return makeDetail({
      merchant: { ...base.merchant, status: 'REGISTERED', onboardingStep, canSubmitOnBehalf: true },
    })
  }

  it('HIDES the card for a non-submittable merchant, even with every capability', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.queryByTestId('submit-for-review-card-mock')).not.toBeInTheDocument()
  })

  it('SHOWS the card when can(merchant:submit) AND canSubmitOnBehalf', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeSubmittable() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('submit-for-review-card-mock')).toBeInTheDocument()
  })

  it('HIDES the card when submittable but the admin lacks merchant:submit', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' })
    mockDetail({ data: makeSubmittable() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-workspace-header')).toBeInTheDocument()
    expect(screen.queryByTestId('submit-for-review-card-mock')).not.toBeInTheDocument()
  })

  it('opens the SubmitMerchantDialog with the merchant id when the card triggers submit', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeSubmittable() })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('submit-card-trigger'))
    expect(screen.getByTestId('submit-merchant-dialog-mock')).toHaveAttribute('data-merchant-id', 'm-1')
  })

  it('passes isResubmit=true to the dialog when onboardingStep is NEEDS_CHANGES', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeSubmittable('NEEDS_CHANGES') })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('submit-card-trigger'))
    expect(screen.getByTestId('submit-merchant-dialog-mock')).toHaveAttribute('data-is-resubmit', 'true')
  })

  it('passes isResubmit=false to the dialog for a first submit (REGISTERED)', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeSubmittable('REGISTERED') })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('submit-card-trigger'))
    expect(screen.getByTestId('submit-merchant-dialog-mock')).toHaveAttribute('data-is-resubmit', 'false')
  })

  it('closes the submit dialog on its Cancel', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeSubmittable() })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('submit-card-trigger'))
    fireEvent.click(screen.getByTestId('submit-merchant-dialog-cancel'))
    expect(screen.queryByTestId('submit-merchant-dialog-mock')).not.toBeInTheDocument()
  })
})

// ── Business identity tab: read cards ──────────────────────────────────────────

describe('Merchant 360 Business identity tab (read)', () => {
  beforeEach(() => {
    mockSearch = 'tab=identity'
  })

  it('renders the identity, website, registration, and category cards', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-identity-fields-card')).toBeInTheDocument()
    expect(screen.getByTestId('merchant-business-name-value')).toHaveTextContent('Acme Coffee')
    expect(screen.getByTestId('merchant-trading-name-value')).toHaveTextContent('Acme')
    expect(screen.getByTestId('merchant-description-value')).toHaveTextContent('We sell coffee')
    expect(screen.getByTestId('merchant-website-value')).toHaveTextContent('https://acme.test')
    expect(screen.getByTestId('merchant-vat-value')).toHaveTextContent('GB123456789')
    expect(screen.getByTestId('merchant-company-value')).toHaveTextContent('12345678')
    expect(screen.getByTestId('merchant-category-value')).toHaveTextContent('Restaurants')
  })

  it('shows "Not set" for null website / vat / company / trading / description', () => {
    mockSession({ can: () => true })
    mockDetail({
      data: makeDetail({
        merchant: {
          ...makeDetail().merchant,
          websiteUrl: null,
          vatNumber: null,
          companyNumber: null,
          tradingName: null,
          description: null,
        },
      }),
    })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-website-value')).toHaveTextContent('Not set')
    expect(screen.getByTestId('merchant-vat-value')).toHaveTextContent('Not set')
    expect(screen.getByTestId('merchant-company-value')).toHaveTextContent('Not set')
    expect(screen.getByTestId('merchant-trading-name-value')).toHaveTextContent('Not set')
    expect(screen.getByTestId('merchant-description-value')).toHaveTextContent('Not set')
  })
})

// ── Business identity tab: website edit ────────────────────────────────────────

describe('Merchant 360 Business identity tab (website edit)', () => {
  beforeEach(() => {
    mockSearch = 'tab=identity'
  })

  it('shows the website Edit WITH merchant:edit and opens/closes the dialog', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('merchant-website-edit'))
    expect(screen.getByTestId('edit-merchant-website-dialog-mock')).toHaveAttribute('data-merchant-id', 'm-1')
    fireEvent.click(screen.getByTestId('edit-website-dialog-cancel'))
    expect(screen.queryByTestId('edit-merchant-website-dialog-mock')).not.toBeInTheDocument()
  })

  it('HIDES the website Edit for a read-only admin (no merchant:edit)', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-website-card')).toBeInTheDocument()
    expect(screen.queryByTestId('merchant-website-edit')).not.toBeInTheDocument()
  })
})

// ── Business identity tab: registration edit (B2.2) ────────────────────────────

describe('Merchant 360 Business identity tab (registration edit)', () => {
  beforeEach(() => {
    mockSearch = 'tab=identity'
  })

  it('shows the identity Edit WITH merchant:edit-identity and opens/closes the dialog', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('merchant-identity-edit'))
    expect(screen.getByTestId('edit-merchant-identity-dialog-mock')).toHaveAttribute('data-merchant-id', 'm-1')
    fireEvent.click(screen.getByTestId('edit-identity-dialog-cancel'))
    expect(screen.queryByTestId('edit-merchant-identity-dialog-mock')).not.toBeInTheDocument()
  })

  it('HIDES the identity Edit for merchant:read + merchant:edit but NOT merchant:edit-identity', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' || cap === 'merchant:edit' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-identity-card')).toBeInTheDocument()
    expect(screen.getByTestId('merchant-website-edit')).toBeInTheDocument()
    expect(screen.queryByTestId('merchant-identity-edit')).not.toBeInTheDocument()
  })
})

// ── Business identity tab: category edit (B2.3) ────────────────────────────────

describe('Merchant 360 Business identity tab (category edit)', () => {
  beforeEach(() => {
    mockSearch = 'tab=identity'
  })

  it('shows the category Edit WITH merchant:edit-category and not locked; opens/closes', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('merchant-category-edit'))
    expect(screen.getByTestId('edit-category-dialog-mock')).toHaveAttribute('data-merchant-id', 'm-1')
    fireEvent.click(screen.getByTestId('edit-category-dialog-cancel'))
    expect(screen.queryByTestId('edit-category-dialog-mock')).not.toBeInTheDocument()
  })

  it('HIDES the category Edit for an admin without merchant:edit-category', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' || cap === 'merchant:edit' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-category-card')).toBeInTheDocument()
    expect(screen.queryByTestId('merchant-category-edit')).not.toBeInTheDocument()
  })

  it('HIDES the category Edit and shows the locked note when categoryLocked is true', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail({ merchant: { ...makeDetail().merchant, categoryLocked: true } }) })
    render(<MerchantDetailPage />)
    expect(screen.queryByTestId('merchant-category-edit')).not.toBeInTheDocument()
    expect(screen.getByTestId('merchant-category-locked-note')).toBeInTheDocument()
  })
})

// ── Business identity tab: propose-sensitive edit (B2.5) ────────────────────────

describe('Merchant 360 Business identity tab (propose edit)', () => {
  beforeEach(() => {
    mockSearch = 'tab=identity'
  })

  it('shows the Propose changes button WITH merchant:propose-edit and opens/closes', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    const btn = screen.getByTestId('merchant-identity-propose')
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    expect(screen.getByTestId('propose-merchant-edit-dialog-mock')).toHaveAttribute('data-merchant-id', 'm-1')
    fireEvent.click(screen.getByTestId('propose-edit-dialog-cancel'))
    expect(screen.queryByTestId('propose-merchant-edit-dialog-mock')).not.toBeInTheDocument()
  })

  it('HIDES the Propose changes button for an admin without merchant:propose-edit', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' || cap === 'merchant:edit' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-identity-fields-card')).toBeInTheDocument()
    expect(screen.queryByTestId('merchant-identity-propose')).not.toBeInTheDocument()
  })

  it('keeps the Propose button visible but DISABLED with a note when an edit is already pending', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail({ merchant: { ...makeDetail().merchant, hasPendingIdentityEdit: true } }) })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-identity-propose')).toBeDisabled()
    expect(screen.getByTestId('merchant-identity-pending-note')).toBeInTheDocument()
  })

  it('does NOT show the pending note when no edit is pending', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.queryByTestId('merchant-identity-pending-note')).not.toBeInTheDocument()
  })
})

// ── A2: Branches tab ────────────────────────────────────────────────────────────

describe('Merchant 360 Branches tab (A2)', () => {
  beforeEach(() => {
    mockSearch = 'tab=branches'
  })

  it('deep-links to the Branches module (not a placeholder) and renders a card per branch', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('workspace-branches')).toBeInTheDocument()
    expect(screen.queryByTestId('workspace-placeholder-branches')).not.toBeInTheDocument()
    expect(screen.getByTestId('branch-card-br-1')).toBeInTheDocument()
    expect(screen.getByTestId('branch-card-br-2')).toBeInTheDocument()
    // Provenance badge renders for real from the shared component.
    expect(screen.getByTestId('workspace-tab-branches')).toHaveAttribute('data-active', 'true')
  })

  it('renders the empty state when the merchant has no branches', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail({ branches: [] }) })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-branches-empty')).toBeInTheDocument()
  })

  it('shows Add branch WITH merchant:manage-branches and opens the AddBranchDialog', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('merchant-add-branch'))
    expect(screen.getByTestId('add-branch-dialog-mock')).toHaveAttribute('data-merchant-id', 'm-1')
    fireEvent.click(screen.getByTestId('add-branch-dialog-cancel'))
    expect(screen.queryByTestId('add-branch-dialog-mock')).not.toBeInTheDocument()
  })

  it('HIDES Add branch without merchant:manage-branches', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' || cap === 'merchant:edit' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('workspace-branches')).toBeInTheDocument()
    expect(screen.queryByTestId('merchant-add-branch')).not.toBeInTheDocument()
  })

  it('shows per-branch Edit WITH merchant:edit and opens the EditBranchDialog', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('branch-edit-br-2'))
    expect(screen.getByTestId('edit-branch-dialog-mock')).toHaveAttribute('data-branch-id', 'br-2')
    fireEvent.click(screen.getByTestId('edit-branch-dialog-cancel'))
    expect(screen.queryByTestId('edit-branch-dialog-mock')).not.toBeInTheDocument()
  })

  it('HIDES per-branch Edit for a read-only admin (no merchant:edit)', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.queryByTestId('branch-edit-br-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('branch-edit-br-2')).not.toBeInTheDocument()
  })

  it('shows Delete on a non-main branch WITH merchant:manage-branches and opens the confirm', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    // br-1 is the main branch: Delete is hidden even with the capability.
    expect(screen.queryByTestId('branch-delete-br-1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('branch-delete-br-2'))
    expect(screen.getByTestId('delete-branch-confirm-mock')).toHaveAttribute('data-branch-id', 'br-2')
    fireEvent.click(screen.getByTestId('delete-branch-confirm-cancel'))
    expect(screen.queryByTestId('delete-branch-confirm-mock')).not.toBeInTheDocument()
  })

  it('HIDES per-branch Delete without merchant:manage-branches', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' || cap === 'merchant:edit' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.queryByTestId('branch-delete-br-2')).not.toBeInTheDocument()
  })
})

// ── A2: Documents tab ───────────────────────────────────────────────────────────

describe('Merchant 360 Documents tab (A2)', () => {
  beforeEach(() => {
    mockSearch = 'tab=documents'
  })

  it('deep-links to the Documents module and passes canManage=true WITH merchant:manage-documents', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('workspace-documents')).toBeInTheDocument()
    expect(screen.queryByTestId('workspace-placeholder-documents')).not.toBeInTheDocument()
    const card = screen.getByTestId('merchant-documents-card-mock')
    expect(card).toHaveAttribute('data-merchant-id', 'm-1')
    expect(card).toHaveAttribute('data-can-manage', 'true')
  })

  it('passes canManage=false without merchant:manage-documents (view-only)', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-documents-card-mock')).toHaveAttribute(
      'data-can-manage',
      'false'
    )
  })
})

// ── A2: Activity tab ────────────────────────────────────────────────────────────

describe('Merchant 360 Activity tab (A2)', () => {
  beforeEach(() => {
    mockSearch = 'tab=activity'
  })

  it('deep-links to the Activity module and renders the timeline (enabled) WITH approval:read', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' || cap === 'approval:read' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('workspace-activity')).toBeInTheDocument()
    const timeline = screen.getByTestId('activity-timeline-mock')
    expect(timeline).toHaveAttribute('data-merchant-id', 'm-1')
    expect(timeline).toHaveAttribute('data-enabled', 'true')
    expect(timeline).toHaveAttribute('data-filter', 'all')
  })

  it('changes the filter passed to the timeline when a filter chip is clicked', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' || cap === 'approval:read' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('activity-filter-comms'))
    expect(screen.getByTestId('activity-timeline-mock')).toHaveAttribute('data-filter', 'comms')
    fireEvent.click(screen.getByTestId('activity-filter-actions'))
    expect(screen.getByTestId('activity-timeline-mock')).toHaveAttribute('data-filter', 'actions')
  })

  it('FAIL-CLOSED: shows the denied panel (naming approval:read) and does NOT render the timeline without approval:read', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    const denied = screen.getByTestId('workspace-activity-denied')
    expect(denied).toBeInTheDocument()
    expect(denied).toHaveTextContent(/approval:read/)
    expect(screen.queryByTestId('activity-timeline-mock')).not.toBeInTheDocument()
    expect(screen.queryByTestId('activity-filter')).not.toBeInTheDocument()
  })
})

// ── A3: Redemptions tab ─────────────────────────────────────────────────────────

describe('Merchant 360 Redemptions tab (A3)', () => {
  beforeEach(() => {
    mockSearch = 'tab=redemptions'
    mockRedemptions()
  })

  it('deep-links to the Redemptions module (not a placeholder) WITH redemption:read', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' || cap === 'redemption:read' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('workspace-redemptions')).toBeInTheDocument()
    expect(screen.queryByTestId('workspace-placeholder-redemptions')).not.toBeInTheDocument()
    expect(screen.getByTestId('workspace-tab-redemptions')).toHaveAttribute('data-active', 'true')
  })

  it('WIRE-PIN: always passes this merchant id to useRedemptions with enabled:true', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' || cap === 'redemption:read' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    const lastCall = mockedUseRedemptions.mock.calls[mockedUseRedemptions.mock.calls.length - 1]
    expect(lastCall[0].merchantId).toBe('m-1')
    expect(lastCall[1]).toEqual({ enabled: true })
  })

  it('hides the Merchant column (scoped view) but keeps the Voucher column', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' || cap === 'redemption:read' })
    mockDetail({ data: makeDetail() })
    mockRedemptions({
      data: {
        items: [
          {
            id: 'r1',
            redemptionCode: 'A7K2P9X4',
            voucher: { id: 'v1', title: 'Half-price pizza', type: 'BOGO' },
            branch: { id: 'b1', name: 'Main Branch' },
            merchant: { id: 'm-1', businessName: 'Acme Coffee' },
            customerName: 'Sarah K.',
            redeemedAt: '2026-07-01T10:00:00.000Z',
            status: 'AWAITING_VALIDATION',
            validatedAt: null,
            validationMethod: null,
            validatedByLabel: null,
            estimatedSaving: 5,
            isTestData: false,
          },
        ],
        total: 1,
        limit: 25,
        offset: 0,
      },
    })
    render(<MerchantDetailPage />)
    expect(screen.queryByRole('columnheader', { name: 'Merchant' })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Voucher' })).toBeInTheDocument()
  })

  it('links out to the global redemptions page', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' || cap === 'redemption:read' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('redemptions-view-all-link')).toHaveAttribute('href', '/redemptions')
  })

  it('FAIL-CLOSED: shows the denied panel (naming redemption:read) and never fires the request', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    const denied = screen.getByTestId('workspace-redemptions-denied')
    expect(denied).toBeInTheDocument()
    expect(denied).toHaveTextContent(/redemption:read/)
    expect(screen.queryByTestId('redemptions-view-all-link')).not.toBeInTheDocument()
    const lastCall = mockedUseRedemptions.mock.calls[mockedUseRedemptions.mock.calls.length - 1]
    expect(lastCall[0].merchantId).toBe('m-1')
    expect(lastCall[1]).toEqual({ enabled: false })
  })
})

// ── A3: Vouchers tab ─────────────────────────────────────────────────────────────

describe('Merchant 360 Vouchers tab (A3)', () => {
  beforeEach(() => {
    mockSearch = 'tab=vouchers'
    mockRmv()
  })

  it('deep-links to the Vouchers module (not a placeholder) and renders a card per RMV', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' })
    mockDetail({ data: makeDetail() })
    mockRmv({
      data: {
        vouchers: [
          makeRmvVoucher({ id: 'v-rmv-1' }),
          makeRmvVoucher({ id: 'v-rmv-2', code: 'RMV-002', type: 'FREEBIE' }),
        ],
      },
    })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('workspace-vouchers')).toBeInTheDocument()
    expect(screen.queryByTestId('workspace-placeholder-vouchers')).not.toBeInTheDocument()
    expect(screen.getByTestId('rmv-card-v-rmv-1')).toBeInTheDocument()
    expect(screen.getByTestId('rmv-card-v-rmv-2')).toBeInTheDocument()
    expect(screen.getByTestId('vouchers-mandatory-count')).toHaveTextContent('Mandatory 2 / 2')
  })

  it('shows the honest CUSTOM (RCV) not-built note, never fabricated data', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('vouchers-custom-note')).toHaveTextContent(/next slice/i)
  })

  it('shows Edit + Submit on a DRAFT flagship WITH merchant:manage-vouchers and opens/closes the dialogs', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' || cap === 'merchant:manage-vouchers' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('rmv-edit-v-rmv-1'))
    const editDialog = screen.getByTestId('rmv-cobuild-dialog-mock')
    expect(editDialog).toHaveAttribute('data-merchant-id', 'm-1')
    expect(editDialog).toHaveAttribute('data-voucher-id', 'v-rmv-1')
    fireEvent.click(screen.getByTestId('rmv-cobuild-dialog-cancel'))
    expect(screen.queryByTestId('rmv-cobuild-dialog-mock')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('rmv-submit-v-rmv-1'))
    const submitDialog = screen.getByTestId('submit-rmv-dialog-mock')
    expect(submitDialog).toHaveAttribute('data-voucher-id', 'v-rmv-1')
    fireEvent.click(screen.getByTestId('submit-rmv-dialog-cancel'))
    expect(screen.queryByTestId('submit-rmv-dialog-mock')).not.toBeInTheDocument()
  })

  it('HIDES Edit/Submit on a DRAFT flagship without merchant:manage-vouchers (shows a gated note)', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.queryByTestId('rmv-edit-v-rmv-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('rmv-submit-v-rmv-1')).not.toBeInTheDocument()
    expect(screen.getByTestId('rmv-gated-v-rmv-1')).toHaveTextContent(/merchant:manage-vouchers/)
  })

  it('a non-DRAFT flagship is read-only even WITH merchant:manage-vouchers', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' || cap === 'merchant:manage-vouchers' })
    mockDetail({ data: makeDetail() })
    mockRmv({
      data: { vouchers: [makeRmvVoucher({ id: 'v-rmv-1', status: 'PENDING_APPROVAL' })] },
    })
    render(<MerchantDetailPage />)
    expect(screen.queryByTestId('rmv-edit-v-rmv-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('rmv-submit-v-rmv-1')).not.toBeInTheDocument()
    expect(screen.getByTestId('rmv-readonly-v-rmv-1')).toBeInTheDocument()
    expect(screen.getByTestId('rmv-status-v-rmv-1')).toHaveTextContent('Pending approval')
  })
})
