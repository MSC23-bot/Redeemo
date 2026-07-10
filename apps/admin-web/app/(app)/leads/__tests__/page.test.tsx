/**
 * /leads page (C1) : capability gate + section composition.
 *
 * Covers: ready/forbidden/authorised gating on merchant:read; the awaiting-
 * review count wiring (incl. the approval:read sub-gate); the in-progress
 * onboardings list wiring; the honestly-gated assisted-onboarding and
 * prospect-pipeline panels (never a dead button, never a kanban); and that
 * every hook is invoked with the correct `enabled` value per capability.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import LeadsHubPage from '../page'
import type { MerchantSummary } from '@/lib/api/merchants'

// ── Mock next/link ────────────────────────────────────────────────────────────

jest.mock('next/link', () => {
  return function MockLink({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  }
})

// ── Mock useSession ───────────────────────────────────────────────────────────

jest.mock('@/lib/auth/useSession', () => ({
  useSession: jest.fn(),
}))

// ── Mock the leads hooks ──────────────────────────────────────────────────────

jest.mock('@/lib/leads/useAwaitingReviewCount', () => ({
  useAwaitingReviewCount: jest.fn(),
}))
jest.mock('@/lib/leads/useInProgressOnboardings', () => ({
  useInProgressOnboardings: jest.fn(),
  IN_PROGRESS_DISPLAY_CAP: 10,
}))

import { useSession } from '@/lib/auth/useSession'
import { useAwaitingReviewCount } from '@/lib/leads/useAwaitingReviewCount'
import { useInProgressOnboardings } from '@/lib/leads/useInProgressOnboardings'

const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>
const mockedUseAwaitingReviewCount = useAwaitingReviewCount as jest.MockedFunction<typeof useAwaitingReviewCount>
const mockedUseInProgressOnboardings = useInProgressOnboardings as jest.MockedFunction<typeof useInProgressOnboardings>

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockSession(overrides: { ready?: boolean; can?: (cap: string) => boolean } = {}) {
  mockedUseSession.mockReturnValue({
    accessToken: 'test-access-token',
    ready: overrides.ready ?? true,
    isAuthenticated: true,
    role: 'OPERATIONS',
    email: 'ops@redeemo.co.uk',
    adminId: 'admin-me',
    can: overrides.can ?? (() => true),
    setSession: jest.fn(),
    refresh: jest.fn(),
    signOut: jest.fn(),
  })
}

function mockAwaiting(overrides: Partial<ReturnType<typeof useAwaitingReviewCount>> = {}) {
  mockedUseAwaitingReviewCount.mockReturnValue({
    count: 6,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  })
}

function makeMerchant(overrides: Partial<MerchantSummary> & { id: string }): MerchantSummary {
  return {
    businessName: 'Southville Sourdough',
    tradingName: null,
    status: 'REGISTERED',
    verificationStatus: 'NOT_SUBMITTED',
    onboardingStep: 'BRANCH_ADDED',
    logoUrl: null,
    createdAt: '2026-07-01T10:00:00.000Z',
    category: null,
    branchCount: 1,
    ...overrides,
  }
}

function mockInProgress(overrides: Partial<ReturnType<typeof useInProgressOnboardings>> = {}) {
  mockedUseInProgressOnboardings.mockReturnValue({
    items: [],
    total: 0,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  })
}

afterEach(() => jest.clearAllMocks())

// ── Capability gate ───────────────────────────────────────────────────────────

describe('LeadsHubPage capability gate', () => {
  it('shows the loader while session is not ready', () => {
    mockSession({ ready: false, can: () => false })
    mockAwaiting()
    mockInProgress()

    render(<LeadsHubPage />)

    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument()
    expect(screen.queryByTestId('leads-forbidden')).not.toBeInTheDocument()
    expect(screen.queryByTestId('leads-hub-page')).not.toBeInTheDocument()
  })

  it('shows forbidden when the admin lacks merchant:read', () => {
    mockSession({ can: () => false })
    mockAwaiting()
    mockInProgress()

    render(<LeadsHubPage />)

    expect(screen.getByTestId('leads-forbidden')).toBeInTheDocument()
    expect(screen.queryByTestId('leads-hub-page')).not.toBeInTheDocument()
  })

  it('renders the hub when the admin has merchant:read', () => {
    mockSession({ can: () => true })
    mockAwaiting()
    mockInProgress()

    render(<LeadsHubPage />)

    expect(screen.getByTestId('leads-hub-page')).toBeInTheDocument()
    expect(screen.queryByTestId('leads-forbidden')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Leads and onboarding' })).toBeInTheDocument()
  })

  it('calls both leads hooks with enabled:false when the admin lacks merchant:read', () => {
    mockSession({ can: () => false })
    mockAwaiting()
    mockInProgress()

    render(<LeadsHubPage />)

    expect(mockedUseAwaitingReviewCount).toHaveBeenCalledWith({ enabled: false })
    expect(mockedUseInProgressOnboardings).toHaveBeenCalledWith({ enabled: false })
  })
})

// ── Section composition ───────────────────────────────────────────────────────

describe('LeadsHubPage section composition', () => {
  beforeEach(() => {
    mockSession({ can: () => true })
  })

  it('renders all three sections', () => {
    mockAwaiting()
    mockInProgress()
    render(<LeadsHubPage />)

    expect(screen.getByTestId('leads-section-onboard')).toBeInTheDocument()
    expect(screen.getByTestId('leads-section-in-progress')).toBeInTheDocument()
    expect(screen.getByTestId('leads-section-pipeline')).toBeInTheDocument()
  })

  it('wires the awaiting-review count into the inbound card', () => {
    mockAwaiting({ count: 6, isLoading: false, isError: false })
    mockInProgress()
    render(<LeadsHubPage />)

    expect(screen.getByTestId('leads-inbound-count')).toHaveTextContent('6')
  })

  it('gates the awaiting-review fetch on approval:read (a merchant:read-only admin never fires it)', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' })
    mockAwaiting()
    mockInProgress()

    render(<LeadsHubPage />)

    expect(mockedUseAwaitingReviewCount).toHaveBeenCalledWith({ enabled: false })
    expect(screen.getByTestId('leads-inbound-count-restricted')).toBeInTheDocument()
  })

  it('wires the in-progress onboardings list into SECTION 2', () => {
    mockAwaiting()
    mockInProgress({
      items: [makeMerchant({ id: 'm-1', businessName: 'Southville Sourdough' })],
      total: 1,
    })
    render(<LeadsHubPage />)

    expect(screen.getByTestId('leads-in-progress-row-m-1')).toHaveTextContent('Southville Sourdough')
    expect(screen.getByTestId('leads-continue-m-1')).toHaveAttribute('href', '/merchants/m-1')
  })

  it('the create-draft card links to the EXISTING /merchants/new form when capability is held', () => {
    mockSession({ can: () => true })
    mockAwaiting()
    mockInProgress()
    render(<LeadsHubPage />)

    expect(screen.getByTestId('leads-create-draft-link')).toHaveAttribute('href', '/merchants/new')
  })

  it('the create-draft card is honestly locked without merchant:create-draft', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' })
    mockAwaiting()
    mockInProgress()
    render(<LeadsHubPage />)

    expect(screen.getByTestId('leads-create-draft-locked')).toHaveTextContent('Needs merchant:create-draft')
    expect(screen.queryByTestId('leads-create-draft-link')).not.toBeInTheDocument()
  })

  it('the assisted-onboarding card (C2) is a live CTA when merchant:create-draft is held', () => {
    mockSession({ can: () => true })
    mockAwaiting()
    mockInProgress()
    render(<LeadsHubPage />)

    expect(screen.getByTestId('leads-assisted-link')).toHaveAttribute('href', '/merchants/new')
    expect(screen.queryByTestId('leads-assisted-button-disabled')).not.toBeInTheDocument()
  })

  it('the assisted-onboarding card is honestly locked without merchant:create-draft', () => {
    mockSession({ can: (cap) => cap === 'merchant:read' })
    mockAwaiting()
    mockInProgress()
    render(<LeadsHubPage />)

    expect(screen.getByTestId('leads-assisted-button-disabled')).toBeDisabled()
    expect(screen.getByTestId('leads-assisted-locked')).toHaveTextContent('Needs merchant:create-draft')
  })

  it('the prospect pipeline section is an honest gated placeholder : no kanban, no lead CRUD', () => {
    mockAwaiting()
    mockInProgress()
    render(<LeadsHubPage />)

    expect(screen.getByTestId('leads-pipeline-gated')).toHaveTextContent(/open owner decision/i)
    expect(screen.queryByText(/add lead/i)).not.toBeInTheDocument()
  })
})
