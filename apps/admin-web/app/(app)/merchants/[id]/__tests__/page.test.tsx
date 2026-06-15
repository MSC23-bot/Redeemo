/**
 * /merchants/[id] detail page - capability gate, loading/error states, content
 * render (header + website card + branches), Edit affordance gating on
 * merchant:edit, and edit-dialog mounting.
 *
 * Mocks useSession, useMerchantDetail, useParams, next/link, and the two edit
 * dialogs (so we can detect whether they mount without their RQ mutations).
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

// ── Mock useParams ────────────────────────────────────────────────────────────

jest.mock('next/navigation', () => ({
  useParams: jest.fn(() => ({ id: 'm-1' })),
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

// ── Mock the edit dialogs ─────────────────────────────────────────────────────

jest.mock('@/features/merchants/EditMerchantWebsiteDialog', () => ({
  EditMerchantWebsiteDialog: ({
    merchantId,
    onCancel,
  }: {
    merchantId: string
    onCancel: () => void
  }) => (
    <div data-testid="edit-merchant-website-dialog-mock" data-merchant-id={merchantId}>
      <button onClick={onCancel} data-testid="edit-website-dialog-cancel">
        Cancel
      </button>
    </div>
  ),
}))

jest.mock('@/features/merchants/EditBranchDialog', () => ({
  EditBranchDialog: ({
    branchId,
    onCancel,
  }: {
    branchId: string
    onCancel: () => void
  }) => (
    <div data-testid="edit-branch-dialog-mock" data-branch-id={branchId}>
      <button onClick={onCancel} data-testid="edit-branch-dialog-cancel">
        Cancel
      </button>
    </div>
  ),
}))

jest.mock('@/features/merchants/EditMerchantIdentityDialog', () => ({
  EditMerchantIdentityDialog: ({
    merchantId,
    onCancel,
  }: {
    merchantId: string
    onCancel: () => void
  }) => (
    <div data-testid="edit-merchant-identity-dialog-mock" data-merchant-id={merchantId}>
      <button onClick={onCancel} data-testid="edit-identity-dialog-cancel">
        Cancel
      </button>
    </div>
  ),
}))

jest.mock('@/features/merchants/EditCategoryDialog', () => ({
  EditCategoryDialog: ({
    merchantId,
    onCancel,
  }: {
    merchantId: string
    onCancel: () => void
  }) => (
    <div data-testid="edit-category-dialog-mock" data-merchant-id={merchantId}>
      <button onClick={onCancel} data-testid="edit-category-dialog-cancel">
        Cancel
      </button>
    </div>
  ),
}))

import { useSession } from '@/lib/auth/useSession'
import { useMerchantDetail } from '@/lib/merchants/useMerchantDetail'
import type { UseMerchantDetailResult } from '@/lib/merchants/useMerchantDetail'

const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>
const mockedUseMerchantDetail = useMerchantDetail as jest.MockedFunction<typeof useMerchantDetail>

function mockSession(opts: { ready?: boolean; can?: (cap: string) => boolean } = {}) {
  mockedUseSession.mockReturnValue({
    ready: opts.ready ?? true,
    isAuthenticated: true,
    role: 'OPERATIONS',
    email: 'ops@redeemo.co.uk',
    adminId: 'admin-me',
    can: opts.can ?? (() => true),
    refresh: jest.fn(),
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
    ],
    ...overrides,
  }
}

afterEach(() => jest.clearAllMocks())

// ── Capability gate ─────────────────────────────────────────────────────────

describe('MerchantDetailPage capability gate', () => {
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

describe('MerchantDetailPage loading/error states', () => {
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

// ── Full content render ─────────────────────────────────────────────────────

describe('MerchantDetailPage content', () => {
  beforeEach(() => mockSession())

  it('renders the header with business name, trading name, status + verification badges', () => {
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    const header = screen.getByTestId('merchant-detail-header')
    expect(header).toHaveTextContent('Acme Coffee')
    expect(header).toHaveTextContent('Trading as Acme')
    expect(header).toHaveTextContent('Active')
    expect(header).toHaveTextContent('Verified')
  })

  it('renders the website value', () => {
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-website-value')).toHaveTextContent('https://acme.test')
  })

  it('shows "Not set" when the merchant has no website', () => {
    mockDetail({ data: makeDetail({ merchant: { ...makeDetail().merchant, websiteUrl: null } }) })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-website-value')).toHaveTextContent('Not set')
  })

  it('renders a card per branch with contact fields', () => {
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('branch-card-br-1')).toBeInTheDocument()
    expect(screen.getByTestId('branch-phone-br-1')).toHaveTextContent('+447700900123')
    expect(screen.getByTestId('branch-email-br-1')).toHaveTextContent('main@acme.test')
    expect(screen.getByTestId('branch-website-br-1')).toHaveTextContent('Not set')
  })

  it('renders an empty branches state when there are no branches', () => {
    mockDetail({ data: makeDetail({ branches: [] }) })
    render(<MerchantDetailPage />)
    expect(screen.getByText(/no branches yet/i)).toBeInTheDocument()
  })

  it('renders the back link to /merchants', () => {
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    const back = screen.getByRole('link', { name: /back to merchants directory/i })
    expect(back).toHaveAttribute('href', '/merchants')
  })
})

// ── Edit affordance gating ────────────────────────────────────────────────────

describe('MerchantDetailPage edit affordance gating', () => {
  it('shows the website Edit button + branch Edit button WITH merchant:edit', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-website-edit')).toBeInTheDocument()
    expect(screen.getByTestId('branch-edit-br-1')).toBeInTheDocument()
  })

  it('HIDES the Edit buttons for a merchant:read-only admin (no merchant:edit)', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    // The detail still renders (read), but no edit affordances.
    expect(screen.getByTestId('merchant-detail-header')).toBeInTheDocument()
    expect(screen.queryByTestId('merchant-website-edit')).not.toBeInTheDocument()
    expect(screen.queryByTestId('branch-edit-br-1')).not.toBeInTheDocument()
  })
})

// ── B2.2: Business registration card + identity-edit gating ───────────────────

describe('MerchantDetailPage business registration card (B2.2)', () => {
  it('renders the identity card with read-only vat/company for a merchant:read admin', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-identity-card')).toBeInTheDocument()
    expect(screen.getByTestId('merchant-vat-value')).toHaveTextContent('GB123456789')
    expect(screen.getByTestId('merchant-company-value')).toHaveTextContent('12345678')
  })

  it('shows "Not set" when vat/company are null', () => {
    mockSession({ can: () => true })
    mockDetail({
      data: makeDetail({
        merchant: { ...makeDetail().merchant, vatNumber: null, companyNumber: null },
      }),
    })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-vat-value')).toHaveTextContent('Not set')
    expect(screen.getByTestId('merchant-company-value')).toHaveTextContent('Not set')
  })

  it('shows the identity Edit button WITH merchant:edit-identity (SUPER_ADMIN)', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-identity-edit')).toBeInTheDocument()
  })

  it('HIDES the identity Edit button for an admin with merchant:read + merchant:edit but NOT merchant:edit-identity', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' || cap === 'merchant:edit' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    // The card still renders read-only; the website Edit shows; identity Edit does NOT.
    expect(screen.getByTestId('merchant-identity-card')).toBeInTheDocument()
    expect(screen.getByTestId('merchant-website-edit')).toBeInTheDocument()
    expect(screen.queryByTestId('merchant-identity-edit')).not.toBeInTheDocument()
  })

  it('opens the identity dialog when the identity Edit is clicked', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('merchant-identity-edit'))
    const dialog = screen.getByTestId('edit-merchant-identity-dialog-mock')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('data-merchant-id', 'm-1')
  })

  it('closes the identity dialog on its Cancel', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('merchant-identity-edit'))
    fireEvent.click(screen.getByTestId('edit-identity-dialog-cancel'))
    expect(screen.queryByTestId('edit-merchant-identity-dialog-mock')).not.toBeInTheDocument()
  })
})

// ── B2.3: Category card + edit gating + locked state ──────────────────────────

describe('MerchantDetailPage category card (B2.3)', () => {
  it('renders the category card with the current category for a merchant:read admin', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-category-card')).toBeInTheDocument()
    expect(screen.getByTestId('merchant-category-value')).toHaveTextContent('Restaurants')
  })

  it('shows "Not set" when the merchant has no category', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail({ merchant: { ...makeDetail().merchant, category: null, primaryCategoryId: null } }) })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-category-value')).toHaveTextContent('Not set')
  })

  it('shows the category Edit button WITH merchant:edit-category and not locked', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    expect(screen.getByTestId('merchant-category-edit')).toBeInTheDocument()
  })

  it('HIDES the category Edit button for an admin without merchant:edit-category', () => {
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

  it('opens the category dialog when the category Edit is clicked', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('merchant-category-edit'))
    const dialog = screen.getByTestId('edit-category-dialog-mock')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('data-merchant-id', 'm-1')
  })

  it('closes the category dialog on its Cancel', () => {
    mockSession({ can: () => true })
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('merchant-category-edit'))
    fireEvent.click(screen.getByTestId('edit-category-dialog-cancel'))
    expect(screen.queryByTestId('edit-category-dialog-mock')).not.toBeInTheDocument()
  })
})

// ── Edit dialog mounting ──────────────────────────────────────────────────────

describe('MerchantDetailPage edit dialogs', () => {
  beforeEach(() => mockSession({ can: () => true }))

  it('opens the website dialog when the website Edit is clicked', () => {
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('merchant-website-edit'))
    const dialog = screen.getByTestId('edit-merchant-website-dialog-mock')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('data-merchant-id', 'm-1')
  })

  it('closes the website dialog on its Cancel', () => {
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('merchant-website-edit'))
    fireEvent.click(screen.getByTestId('edit-website-dialog-cancel'))
    expect(screen.queryByTestId('edit-merchant-website-dialog-mock')).not.toBeInTheDocument()
  })

  it('opens the branch dialog with the branch id when a branch Edit is clicked', () => {
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('branch-edit-br-1'))
    const dialog = screen.getByTestId('edit-branch-dialog-mock')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('data-branch-id', 'br-1')
  })

  it('closes the branch dialog on its Cancel', () => {
    mockDetail({ data: makeDetail() })
    render(<MerchantDetailPage />)
    fireEvent.click(screen.getByTestId('branch-edit-br-1'))
    fireEvent.click(screen.getByTestId('edit-branch-dialog-cancel'))
    expect(screen.queryByTestId('edit-branch-dialog-mock')).not.toBeInTheDocument()
  })
})
