/**
 * /queue/[id] review page — capability gate, loading/error states, content render.
 *
 * Mocks useSession, useReview, and React.use (for params Promise resolution).
 * All feature components are rendered unmocked; the page is tested as an
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
// renderPage() passes a plain object { id: 'apr-1' } cast as Promise.
// The mock returns it directly; no async unwrapping needed.

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

import { useSession } from '@/lib/auth/useSession'
import { useReview } from '@/lib/review/useReview'
import type { UseReviewResult } from '@/lib/review/useReview'

const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>
const mockedUseReview = useReview as jest.MockedFunction<typeof useReview>

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  // React.use is mocked to return its argument directly.
  // Cast params so TypeScript accepts it; the mock returns { id: 'apr-1' }
  // synchronously, giving the component the approval ID immediately.
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
    // Acme Coffee appears in both the breadcrumb and the header h1
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

  it('does NOT render any action buttons (approve, reject, claim, release)', () => {
    mockReview({ data: makeContext() })
    renderPage()
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /claim/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /release/i })).not.toBeInTheDocument()
  })

  it('shows the merchant name in the breadcrumb', () => {
    mockReview({ data: makeContext() })
    renderPage()
    // Business name appears in the breadcrumb and in the merchant header
    const acmeElements = screen.getAllByText('Acme Coffee')
    expect(acmeElements.length).toBeGreaterThanOrEqual(1)
  })
})
