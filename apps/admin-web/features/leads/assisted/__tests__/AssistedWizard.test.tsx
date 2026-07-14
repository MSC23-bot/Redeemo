/**
 * AssistedWizard: full-screen wizard shell tests (C2).
 *
 * Covers: the page-level merchant:read fail-closed gate; loading / error
 * states; the resume-derivation landing (URL `?step=` overrides, else the
 * derived resume step); free step navigation (rail + footer write `?step=`);
 * the honestly-gated steps (staff / contract) rendering their gate copy; the
 * go-live review submit path (submit card shown, submit gated, submitted /
 * live states); per-affordance capability gating; and the handover honesty.
 *
 * The self-contained fetching tabs (VouchersTab, DocumentsTab) and the leaf
 * dialogs are mocked so the shell renders without their React Query hooks.
 */
import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import AssistedOnboardingPage from '../../../../app/(app)/leads/assisted/[merchantId]/page'
import type { MerchantDetail, BranchDetail, SubmitChecklist } from '@/lib/api/merchants'

// ── Mock next/link ────────────────────────────────────────────────────────────

jest.mock('next/link', () => {
  return function MockLink({
    href,
    children,
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

// ── Mock next/navigation ───────────────────────────────────────────────────────

let mockSearch = ''
const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({
  useParams: () => ({ merchantId: 'm-1' }),
  useSearchParams: () => new URLSearchParams(mockSearch),
  usePathname: () => '/leads/assisted/m-1',
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}))

// ── Mock useSession + useMerchantDetail ────────────────────────────────────────

jest.mock('@/lib/auth/useSession', () => ({ useSession: jest.fn() }))
jest.mock('@/lib/merchants/useMerchantDetail', () => ({
  useMerchantDetail: jest.fn(),
  merchantDetailQueryKey: (id: string) => ['admin-merchant-detail', id],
}))

// ── Mock the self-contained fetching tabs + leaf dialogs ────────────────────────

jest.mock('@/features/merchants/m360/VouchersTab', () => ({
  VouchersTab: ({ canManageVouchers }: { canManageVouchers: boolean }) => (
    <div data-testid="mock-vouchers-tab" data-can={String(canManageVouchers)} />
  ),
}))
jest.mock('@/features/merchants/m360/DocumentsTab', () => ({
  DocumentsTab: ({ canManageDocuments }: { canManageDocuments: boolean }) => (
    <div data-testid="mock-documents-tab" data-can={String(canManageDocuments)} />
  ),
}))
jest.mock('@/features/merchants/EditCategoryDialog', () => ({
  EditCategoryDialog: () => <div data-testid="mock-category-dialog" />,
}))
jest.mock('@/features/merchants/EditMerchantIdentityDialog', () => ({
  EditMerchantIdentityDialog: () => <div data-testid="mock-identity-dialog" />,
}))
jest.mock('@/features/merchants/ProposeMerchantEditDialog', () => ({
  ProposeMerchantEditDialog: () => <div data-testid="mock-propose-dialog" />,
}))
jest.mock('@/features/merchants/EditMerchantWebsiteDialog', () => ({
  EditMerchantWebsiteDialog: () => <div data-testid="mock-website-dialog" />,
}))
jest.mock('@/features/merchants/AddBranchDialog', () => ({
  AddBranchDialog: () => <div data-testid="mock-add-branch-dialog" />,
}))
jest.mock('@/features/merchants/EditBranchDialog', () => ({
  EditBranchDialog: () => <div data-testid="mock-edit-branch-dialog" />,
}))
jest.mock('@/features/merchants/DeleteBranchConfirm', () => ({
  DeleteBranchConfirm: () => <div data-testid="mock-delete-branch-dialog" />,
}))
jest.mock('@/features/merchants/SubmitMerchantDialog', () => ({
  SubmitMerchantDialog: ({ isResubmit }: { isResubmit: boolean }) => (
    <div data-testid="mock-submit-dialog" data-is-resubmit={String(isResubmit)} />
  ),
}))

import { useSession } from '@/lib/auth/useSession'
import { useMerchantDetail } from '@/lib/merchants/useMerchantDetail'

const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>
const mockedUseMerchantDetail = useMerchantDetail as jest.MockedFunction<typeof useMerchantDetail>

// ── Helpers ────────────────────────────────────────────────────────────────

function mockSession(can: (cap: string) => boolean = () => true, ready = true, role = 'SUPER_ADMIN') {
  mockedUseSession.mockReturnValue({
    accessToken: 'tok',
    ready,
    isAuthenticated: true,
    role: role as never,
    email: 'ops@redeemo.co.uk',
    adminId: 'admin-me',
    can: can as never,
    setSession: jest.fn(),
    refresh: jest.fn(),
    signOut: jest.fn(),
  })
}

function makeBranch(overrides: Partial<BranchDetail> = {}): BranchDetail {
  return {
    id: 'b-1',
    name: 'Main Branch',
    isMainBranch: true,
    addressLine1: '1 High Street',
    addressLine2: null,
    city: 'Bristol',
    postcode: 'BS1 1AA',
    localityName: 'Bristol',
    locationConfidence: 'MERCHANT_CONFIRMED',
    phone: null,
    email: null,
    websiteUrl: null,
    isActive: true,
    ...overrides,
  }
}

function makeChecklist(o: Partial<SubmitChecklist> = {}): SubmitChecklist {
  const c = { branch_created: false, contract_signed: false, rmv_configured: false, ...o }
  return { ...c, all_complete: c.branch_created && c.contract_signed && c.rmv_configured }
}

function makeDetail(opts: {
  status?: string
  onboardingStep?: string
  category?: string | null
  primaryCategoryId?: string | null
  branches?: BranchDetail[]
  checklist?: Partial<SubmitChecklist>
  canSubmitOnBehalf?: boolean
} = {}): MerchantDetail {
  return {
    merchant: {
      id: 'm-1',
      businessName: 'Southville Sourdough Ltd',
      tradingName: 'Southville Sourdough',
      status: opts.status ?? 'REGISTERED',
      verificationStatus: 'NOT_SUBMITTED',
      onboardingStep: opts.onboardingStep ?? 'REGISTERED',
      websiteUrl: null,
      vatNumber: null,
      companyNumber: null,
      logoUrl: null,
      category: opts.category ?? null,
      primaryCategoryId: opts.primaryCategoryId ?? null,
      categoryLocked: false,
      description: null,
      hasPendingIdentityEdit: false,
      submitChecklist: makeChecklist(opts.checklist),
      canSubmitOnBehalf: opts.canSubmitOnBehalf ?? true,
      owner: { name: 'Marta Owner', email: 'marta@southville.example', phone: null, emailVerified: false },
      documentsCount: 0,
    },
    branches: opts.branches ?? [],
  }
}

function mockDetail(overrides: Partial<ReturnType<typeof useMerchantDetail>> = {}) {
  mockedUseMerchantDetail.mockReturnValue({
    data: makeDetail(),
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  })
}

afterEach(() => {
  jest.clearAllMocks()
  mockSearch = ''
})

// ── Capability gate + states ───────────────────────────────────────────────────

describe('AssistedWizard gate + states', () => {
  it('shows the loader while the session is not ready', () => {
    mockSession(() => true, false)
    mockDetail()
    render(<AssistedOnboardingPage />)
    expect(screen.getByTestId('assisted-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('assisted-wizard')).not.toBeInTheDocument()
  })

  it('fail-closes on merchant:read', () => {
    mockSession(() => false)
    mockDetail()
    render(<AssistedOnboardingPage />)
    expect(screen.getByTestId('assisted-forbidden')).toBeInTheDocument()
    expect(screen.queryByTestId('assisted-wizard')).not.toBeInTheDocument()
  })

  // Honesty-copy sweep (2026-07-13): denied copy must name the actual gating
  // capability (merchant:read: see the wizard's own comment on why this
  // diverges from leads-onboarding-spec.md §A4's aspirational
  // "merchant:assisted-onboard") + the viewer's role, and reassure nothing is
  // broken.
  it('the forbidden state names merchant:read, the viewer role, and reassures nothing is broken', () => {
    mockSession(() => false, true, 'CONTENT')
    mockDetail()
    render(<AssistedOnboardingPage />)
    const forbidden = screen.getByTestId('assisted-forbidden')
    expect(forbidden).toHaveTextContent(/merchant:read/)
    expect(forbidden).toHaveTextContent(/CONTENT/)
    expect(forbidden).toHaveTextContent(/nothing is broken/i)
  })

  it('does not fire the detail read without merchant:read', () => {
    mockSession(() => false)
    mockDetail()
    render(<AssistedOnboardingPage />)
    expect(mockedUseMerchantDetail).toHaveBeenCalledWith('m-1', false)
  })

  it('shows the error state with a working retry', () => {
    mockSession()
    const refetch = jest.fn()
    mockDetail({ data: undefined, isError: true, refetch })
    render(<AssistedOnboardingPage />)
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  // Honesty-copy sweep (2026-07-13): error copy must reassure nothing was
  // changed.
  it('the error state reassures nothing was changed', () => {
    mockSession()
    mockDetail({ data: undefined, isError: true })
    render(<AssistedOnboardingPage />)
    expect(screen.getByTestId('assisted-error')).toHaveTextContent(/no items were changed/i)
  })

  it('renders the persistent on-behalf focus header', () => {
    mockSession()
    mockDetail()
    render(<AssistedOnboardingPage />)
    const header = screen.getByTestId('assisted-header')
    expect(header).toHaveTextContent('Southville Sourdough')
    expect(header).toHaveTextContent(/on behalf/i)
    expect(screen.getByTestId('assisted-exit-link')).toHaveAttribute('href', '/leads')
    expect(screen.getByTestId('assisted-save-later-link')).toHaveAttribute('href', '/leads')
  })
})

// ── Resume derivation landing ───────────────────────────────────────────────────

describe('AssistedWizard resume landing', () => {
  it('a fresh draft (no category) lands on step 1', () => {
    mockSession()
    mockDetail({ data: makeDetail() })
    render(<AssistedOnboardingPage />)
    expect(screen.getByTestId('assisted-step-category')).toBeInTheDocument()
    expect(screen.getByTestId('assisted-rail-step-1')).toHaveAttribute('aria-current', 'step')
  })

  it('category + branch + RMV, not submitted lands on step 8 (go-live review)', () => {
    mockSession()
    mockDetail({
      data: makeDetail({
        category: 'Food and drink',
        branches: [makeBranch()],
        checklist: { branch_created: true, rmv_configured: true, contract_signed: true },
      }),
    })
    render(<AssistedOnboardingPage />)
    expect(screen.getByTestId('assisted-step-review')).toBeInTheDocument()
  })

  it('a live merchant lands on step 9 (handover)', () => {
    mockSession()
    mockDetail({
      data: makeDetail({
        status: 'ACTIVE',
        category: 'Food and drink',
        branches: [makeBranch()],
        checklist: { branch_created: true, rmv_configured: true, contract_signed: true },
      }),
    })
    render(<AssistedOnboardingPage />)
    expect(screen.getByTestId('assisted-step-handover')).toBeInTheDocument()
  })

  it('an explicit ?step= overrides the derived resume step', () => {
    mockSearch = 'step=4'
    mockSession()
    mockDetail({ data: makeDetail() }) // fresh draft would derive step 1
    render(<AssistedOnboardingPage />)
    expect(screen.getByTestId('assisted-step-vouchers')).toBeInTheDocument()
    expect(screen.queryByTestId('assisted-step-category')).not.toBeInTheDocument()
  })

  it('an out-of-range ?step= falls back to the derived resume step', () => {
    mockSearch = 'step=99'
    mockSession()
    mockDetail({ data: makeDetail() })
    render(<AssistedOnboardingPage />)
    expect(screen.getByTestId('assisted-step-category')).toBeInTheDocument()
  })
})

// ── Free step navigation ─────────────────────────────────────────────────────────

describe('AssistedWizard navigation', () => {
  it('clicking a rail step writes ?step= to the URL', () => {
    mockSession()
    mockDetail()
    render(<AssistedOnboardingPage />)
    fireEvent.click(screen.getByTestId('assisted-rail-step-6'))
    expect(mockReplace).toHaveBeenCalledWith('/leads/assisted/m-1?step=6', { scroll: false })
  })

  it('the footer Next advances the step', () => {
    mockSearch = 'step=2'
    mockSession()
    mockDetail()
    render(<AssistedOnboardingPage />)
    fireEvent.click(screen.getByTestId('assisted-next-step'))
    expect(mockReplace).toHaveBeenCalledWith('/leads/assisted/m-1?step=3', { scroll: false })
  })

  it('the footer Previous goes back', () => {
    mockSearch = 'step=2'
    mockSession()
    mockDetail()
    render(<AssistedOnboardingPage />)
    fireEvent.click(screen.getByTestId('assisted-prev-step'))
    expect(mockReplace).toHaveBeenCalledWith('/leads/assisted/m-1?step=1', { scroll: false })
  })

  it('step 1 hides Previous; step 9 hides Next', () => {
    mockSearch = 'step=1'
    mockSession()
    mockDetail()
    const { rerender } = render(<AssistedOnboardingPage />)
    expect(screen.queryByTestId('assisted-prev-step')).not.toBeInTheDocument()
    expect(screen.getByTestId('assisted-next-step')).toBeInTheDocument()

    mockSearch = 'step=9'
    rerender(<AssistedOnboardingPage />)
    expect(screen.queryByTestId('assisted-next-step')).not.toBeInTheDocument()
    expect(screen.getByTestId('assisted-prev-step')).toBeInTheDocument()
  })
})

// ── Honestly-gated steps ─────────────────────────────────────────────────────────

describe('AssistedWizard honestly-gated steps', () => {
  it('step 5 staff is gated: no admin invite-on-behalf route', () => {
    mockSearch = 'step=5'
    mockSession()
    mockDetail()
    render(<AssistedOnboardingPage />)
    expect(screen.getByTestId('assisted-staff-gated')).toBeInTheDocument()
    expect(screen.getByTestId('assisted-staff-gated')).toHaveTextContent(/no admin invite-staff-on-behalf route/i)
  })

  it('step 7 contract is gated when unsigned, showing the owner-signs copy (OD6)', () => {
    mockSearch = 'step=7'
    mockSession()
    mockDetail({ data: makeDetail() })
    render(<AssistedOnboardingPage />)
    expect(screen.getByTestId('assisted-contract-gated')).toBeInTheDocument()
    expect(screen.getByTestId('assisted-contract-gated')).toHaveTextContent(/no admin contract-signing-on-behalf route/i)
  })

  it('step 7 contract shows the signed state when the real gate is met', () => {
    mockSearch = 'step=7'
    mockSession()
    mockDetail({ data: makeDetail({ checklist: { contract_signed: true } }) })
    render(<AssistedOnboardingPage />)
    expect(screen.getByTestId('assisted-contract-signed')).toBeInTheDocument()
    expect(screen.queryByTestId('assisted-contract-gated')).not.toBeInTheDocument()
  })
})

// ── Go-live review submit path ───────────────────────────────────────────────────

describe('AssistedWizard go-live review', () => {
  it('shows the shipped submit card (real 3-gate checklist) when submit is held and not yet submitted', () => {
    mockSearch = 'step=8'
    mockSession(() => true)
    mockDetail({
      data: makeDetail({
        category: 'Food and drink',
        branches: [makeBranch()],
        checklist: { branch_created: true, rmv_configured: true, contract_signed: true },
      }),
    })
    render(<AssistedOnboardingPage />)
    expect(screen.getByTestId('merchant-submit-card')).toBeInTheDocument()
    // Opening the submit dialog mounts the shipped SubmitMerchantDialog.
    fireEvent.click(screen.getByTestId('merchant-submit-button'))
    expect(screen.getByTestId('mock-submit-dialog')).toBeInTheDocument()
  })

  it('gates the submit affordance when merchant:submit is absent, still showing real gates', () => {
    mockSearch = 'step=8'
    mockSession((cap) => cap !== 'merchant:submit')
    mockDetail({
      data: makeDetail({
        category: 'Food and drink',
        branches: [makeBranch()],
        checklist: { branch_created: true, rmv_configured: true },
      }),
    })
    render(<AssistedOnboardingPage />)
    expect(screen.getByTestId('assisted-review-submit-gated')).toBeInTheDocument()
    expect(screen.getByTestId('assisted-review-checklist-readonly')).toBeInTheDocument()
    expect(screen.queryByTestId('merchant-submit-card')).not.toBeInTheDocument()
  })

  it('shows the submitted (in-queue) state once the merchant has been submitted', () => {
    mockSearch = 'step=8'
    mockSession()
    mockDetail({ data: makeDetail({ status: 'PENDING_APPROVAL' }) })
    render(<AssistedOnboardingPage />)
    expect(screen.getByTestId('assisted-review-submitted')).toBeInTheDocument()
    expect(screen.getByTestId('assisted-review-submitted')).toHaveTextContent(/approval queue/i)
    expect(screen.queryByTestId('merchant-submit-card')).not.toBeInTheDocument()
  })
})

// ── NEEDS_CHANGES resubmit path + state-aware copy (adversarial-review F1/N2) ────

describe('AssistedWizard go-live review · NEEDS_CHANGES resubmit (F1)', () => {
  function needsChangesDetail() {
    return makeDetail({
      status: 'PENDING_APPROVAL',
      onboardingStep: 'NEEDS_CHANGES',
      category: 'Food and drink',
      branches: [makeBranch()],
      checklist: { branch_created: true, rmv_configured: true, contract_signed: true },
    })
  }

  it('shows the changes-requested note and the submit card in resubmit mode, not the queued copy', () => {
    mockSearch = 'step=8'
    mockSession(() => true)
    mockDetail({ data: needsChangesDetail() })
    render(<AssistedOnboardingPage />)

    expect(screen.getByTestId('assisted-review-needs-changes')).toHaveTextContent(
      /changes requested by the review team: update the application and resubmit/i
    )
    expect(screen.queryByTestId('assisted-review-submitted')).not.toBeInTheDocument()

    const card = screen.getByTestId('merchant-submit-card')
    expect(card).toBeInTheDocument()
    expect(card).toHaveTextContent(/resubmit for review/i)

    // The rail marks review as needing attention, not complete (F1).
    expect(screen.getByTestId('assisted-rail-step-8')).toHaveAttribute('data-status', 'incomplete')

    // The dialog opened from the resubmit card carries isResubmit=true (was
    // dead code before this fix: the card never rendered for NEEDS_CHANGES).
    fireEvent.click(screen.getByTestId('merchant-submit-button'))
    expect(screen.getByTestId('mock-submit-dialog')).toHaveAttribute('data-is-resubmit', 'true')
  })

  it('without merchant:submit, shows the changes-requested note plus the readonly gates, no submit card', () => {
    mockSearch = 'step=8'
    mockSession((cap) => cap !== 'merchant:submit')
    mockDetail({ data: needsChangesDetail() })
    render(<AssistedOnboardingPage />)

    expect(screen.getByTestId('assisted-review-needs-changes')).toBeInTheDocument()
    expect(screen.getByTestId('assisted-review-submit-gated')).toBeInTheDocument()
    expect(screen.getByTestId('assisted-review-checklist-readonly')).toBeInTheDocument()
    expect(screen.queryByTestId('merchant-submit-card')).not.toBeInTheDocument()
  })

  it('a plain PENDING_APPROVAL merchant (no NEEDS_CHANGES) keeps the queued copy with no resubmit affordance', () => {
    mockSearch = 'step=8'
    mockSession(() => true)
    mockDetail({
      data: makeDetail({
        status: 'PENDING_APPROVAL',
        category: 'Food and drink',
        branches: [makeBranch()],
        checklist: { branch_created: true, rmv_configured: true, contract_signed: true },
      }),
    })
    render(<AssistedOnboardingPage />)

    expect(screen.getByTestId('assisted-review-submitted')).toHaveTextContent(/approval queue/i)
    expect(screen.queryByTestId('assisted-review-needs-changes')).not.toBeInTheDocument()
    expect(screen.queryByTestId('merchant-submit-card')).not.toBeInTheDocument()
    expect(screen.getByTestId('assisted-rail-step-8')).toHaveAttribute('data-status', 'complete')
  })
})

// ── State-aware step-8 copy for suspended/inactive (adversarial-review N2) ───────

describe('AssistedWizard go-live review · suspended/inactive copy (N2)', () => {
  it('a SUSPENDED merchant gets neutral suspended copy, not "approval queue" language', () => {
    mockSearch = 'step=8'
    mockSession()
    mockDetail({ data: makeDetail({ status: 'SUSPENDED' }) })
    render(<AssistedOnboardingPage />)
    const card = screen.getByTestId('assisted-review-submitted')
    expect(card).toHaveTextContent(/suspended/i)
    expect(card).not.toHaveTextContent(/approval queue/i)
  })

  it('an INACTIVE merchant gets neutral inactive copy, not "approval queue" language', () => {
    mockSearch = 'step=8'
    mockSession()
    mockDetail({ data: makeDetail({ status: 'INACTIVE' }) })
    render(<AssistedOnboardingPage />)
    const card = screen.getByTestId('assisted-review-submitted')
    expect(card).toHaveTextContent(/inactive/i)
    expect(card).not.toHaveTextContent(/approval queue/i)
  })

  it('a live merchant still gets the "This merchant is live" copy at step 8 (unchanged)', () => {
    mockSearch = 'step=8'
    mockSession()
    mockDetail({ data: makeDetail({ status: 'ACTIVE' }) })
    render(<AssistedOnboardingPage />)
    const card = screen.getByTestId('assisted-review-submitted')
    expect(card).toHaveTextContent(/this merchant is live/i)
  })
})

// ── Per-affordance capability gating ─────────────────────────────────────────────

describe('AssistedWizard per-affordance capability gating', () => {
  it('step 1 hides SUPER_ADMIN edit affordances when those caps are absent', () => {
    mockSearch = 'step=1'
    mockSession((cap) => cap === 'merchant:read')
    mockDetail()
    render(<AssistedOnboardingPage />)
    expect(screen.queryByTestId('assisted-category-edit')).not.toBeInTheDocument()
    expect(screen.queryByTestId('assisted-identity-edit')).not.toBeInTheDocument()
    expect(screen.queryByTestId('assisted-identity-propose')).not.toBeInTheDocument()
  })

  it('step 1 shows the edit affordances for a SUPER_ADMIN', () => {
    mockSearch = 'step=1'
    mockSession(() => true)
    mockDetail()
    render(<AssistedOnboardingPage />)
    fireEvent.click(screen.getByTestId('assisted-category-edit'))
    expect(screen.getByTestId('mock-category-dialog')).toBeInTheDocument()
  })

  it('step 4 passes the manage-vouchers capability down to the RMV co-build tab', () => {
    mockSearch = 'step=4'
    mockSession((cap) => cap === 'merchant:read')
    mockDetail()
    render(<AssistedOnboardingPage />)
    expect(screen.getByTestId('mock-vouchers-tab')).toHaveAttribute('data-can', 'false')
  })

  it('step 6 passes the manage-documents capability down to the documents tab', () => {
    mockSearch = 'step=6'
    mockSession(() => true)
    mockDetail()
    render(<AssistedOnboardingPage />)
    expect(screen.getAllByTestId('mock-documents-tab')[0]).toHaveAttribute('data-can', 'true')
  })
})

// ── Handover honesty ─────────────────────────────────────────────────────────────

describe('AssistedWizard handover', () => {
  it('shows honest manual-handover copy (no invented claim token) + the owner contact', () => {
    mockSearch = 'step=9'
    mockSession()
    mockDetail({ data: makeDetail({ status: 'ACTIVE' }) })
    render(<AssistedOnboardingPage />)
    expect(screen.getByTestId('assisted-handover-email-dark')).toHaveTextContent(/no claim token is available to copy/i)
    const owner = screen.getByTestId('assisted-handover-owner')
    expect(within(owner).getByText('Marta Owner')).toBeInTheDocument()
    expect(screen.getByTestId('assisted-handover-360-link')).toHaveAttribute('href', '/merchants/m-1')
  })
})
