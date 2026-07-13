/**
 * /queue page — capability gate, refresh, last-updated, and B1 two-court
 * orchestration: court tab switching + counts, type chips composing with the
 * active court, History reachability (lazy fetch), and optional-field grace
 * for edit/branch-lifecycle rows (merchant enrichment landing via #455).
 */
import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import QueuePage from '../page'
import type { AdminApproval } from '@/lib/api/approvals'

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

// ── Mock useSession ───────────────────────────────────────────────────────────

jest.mock('@/lib/auth/useSession', () => ({
  useSession: jest.fn(),
}))

// ── Mock useQueue / useQueueHistory ───────────────────────────────────────────

jest.mock('@/lib/queue/useQueue', () => ({
  useQueue: jest.fn(),
}))
jest.mock('@/lib/queue/useQueueHistory', () => ({
  useQueueHistory: jest.fn(),
}))

import { useSession } from '@/lib/auth/useSession'
import { useQueue } from '@/lib/queue/useQueue'
import { useQueueHistory } from '@/lib/queue/useQueueHistory'

const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>
const mockedUseQueue = useQueue as jest.MockedFunction<typeof useQueue>
const mockedUseQueueHistory = useQueueHistory as jest.MockedFunction<typeof useQueueHistory>

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockSession(overrides: { can?: (cap: string) => boolean; adminId?: string | null; role?: string }) {
  mockedUseSession.mockReturnValue({
    accessToken: 'test-access-token',
    ready: true,
    isAuthenticated: true,
    role: (overrides.role ?? 'OPERATIONS') as never,
    email: 'ops@redeemo.co.uk',
    adminId: overrides.adminId ?? 'admin-me',
    can: overrides.can ?? (() => true),
    setSession: jest.fn(),
    refresh: jest.fn(),
    signOut: jest.fn(),
  })
}

function mockQueue(overrides: Partial<ReturnType<typeof useQueue>> = {}) {
  mockedUseQueue.mockReturnValue({
    items: [],
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: jest.fn(),
    dataUpdatedAt: new Date('2026-06-14T10:30:00.000Z').getTime(),
    ...overrides,
  })
}

function mockQueueHistory(overrides: Partial<ReturnType<typeof useQueueHistory>> = {}) {
  mockedUseQueueHistory.mockReturnValue({
    items: [],
    isLoading: false,
    isError: false,
    isFetching: false,
    hasLoaded: false,
    refetch: jest.fn(),
    ...overrides,
  })
}

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString()
}

function makeApproval(overrides: Partial<AdminApproval> = {}): AdminApproval {
  return {
    id: 'a-1',
    type: 'MERCHANT_ONBOARDING',
    referenceId: 'ref-1',
    referenceType: 'MERCHANT',
    status: 'PENDING',
    adminUserId: null,
    comment: null,
    submittedAt: hoursAgoIso(2),
    actionedAt: null,
    claimedById: null,
    claimedAt: null,
    claimedBy: null,
    merchant: {
      id: 'm-1',
      businessName: 'Acme Coffee',
      status: 'PENDING_APPROVAL',
      onboardingStep: 'SUBMIT_FOR_REVIEW',
      verificationStatus: 'PENDING',
      contractStatus: 'SIGNED',
    },
    ...overrides,
  }
}

// ── Capability gate ───────────────────────────────────────────────────────────

describe('QueuePage capability gate', () => {
  it('shows forbidden state when role lacks approval:read', () => {
    mockSession({ can: () => false })
    mockQueue()
    mockQueueHistory()

    render(<QueuePage />)

    expect(screen.getByTestId('queue-forbidden')).toBeInTheDocument()
    // Exact match: the forbidden heading itself legitimately contains the
    // phrase "approval queue" (honesty-copy sweep names the surface), so this
    // must check for the real page H1 by its exact text, not a substring.
    expect(screen.queryByRole('heading', { name: 'Approval queue' })).not.toBeInTheDocument()
  })

  // Honesty-copy sweep (2026-07-13): denied copy must name the capability +
  // the viewer's actual role and reassure that nothing is broken (module
  // spec approval-queue-spec.md §A.1 qDenied).
  it('the forbidden state names approval:read, the viewer role, and reassures nothing is broken', () => {
    mockSession({ can: () => false, role: 'FINANCE' })
    mockQueue()
    mockQueueHistory()

    render(<QueuePage />)

    const forbidden = screen.getByTestId('queue-forbidden')
    expect(forbidden).toHaveTextContent(/approval:read/)
    expect(forbidden).toHaveTextContent(/FINANCE/)
    expect(forbidden).toHaveTextContent(/nothing is broken/i)
  })

  it('calls useQueue with enabled:false when the admin lacks approval:read', () => {
    mockSession({ can: () => false })
    mockQueue()
    mockQueueHistory()

    render(<QueuePage />)

    expect(mockedUseQueue).toHaveBeenCalledWith({ enabled: false })
  })

  it('authorised admin does NOT see the forbidden state', () => {
    mockSession({ can: () => true })
    mockQueue()
    mockQueueHistory()

    render(<QueuePage />)

    expect(screen.queryByTestId('queue-forbidden')).not.toBeInTheDocument()
    expect(screen.getByText('Approval queue')).toBeInTheDocument()
  })

  it('shows the loader (not forbidden) while session is not yet ready', () => {
    mockedUseSession.mockReturnValue({
      accessToken: null,
      ready: false,
      isAuthenticated: false,
      role: null,
      email: null,
      adminId: null,
      can: () => false,
      setSession: jest.fn(),
      refresh: jest.fn(),
      signOut: jest.fn(),
    })
    mockQueue()
    mockQueueHistory()

    render(<QueuePage />)

    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument()
    expect(screen.queryByTestId('queue-forbidden')).not.toBeInTheDocument()
  })
})

// ── Loading / error / refresh / last-updated (unchanged from pre-B1) ─────────

describe('QueuePage OPERATIONS role (has approval:read)', () => {
  beforeEach(() => {
    mockSession({ can: () => true })
    mockQueueHistory()
  })

  it('renders the queue heading when capability is granted', () => {
    mockQueue()
    render(<QueuePage />)
    expect(screen.getByText('Approval queue')).toBeInTheDocument()
  })

  it('shows loading state while isLoading is true (Needs-you court is the default)', () => {
    mockQueue({ isLoading: true })
    render(<QueuePage />)
    expect(screen.queryByTestId('queue-wide-table')).not.toBeInTheDocument()
  })

  it('shows error state when isError is true', () => {
    mockQueue({ isError: true, isLoading: false })
    render(<QueuePage />)
    expect(screen.getByText(/could not load the approval queue/i)).toBeInTheDocument()
  })

  // Honesty-copy sweep (2026-07-13): error copy must reassure nothing was
  // changed, so it can never be mistaken for an empty queue (module spec
  // approval-queue-spec.md §A.1 qError: "This is different from an empty
  // queue.").
  it('the error state reassures nothing was changed and is distinct from empty', () => {
    mockQueue({ isError: true, isLoading: false })
    render(<QueuePage />)
    const error = screen.getByTestId('queue-error')
    expect(error).toHaveTextContent(/no items were changed/i)
    expect(screen.queryByText(/nothing is waiting/i)).not.toBeInTheDocument()
  })

  it('calls refetch when the Refresh button is clicked', () => {
    const refetch = jest.fn()
    mockQueue({ refetch })
    render(<QueuePage />)

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('renders LastUpdated with the dataUpdatedAt time', () => {
    const dataUpdatedAt = new Date('2026-06-14T10:30:45.000Z').getTime()
    mockQueue({ dataUpdatedAt })
    render(<QueuePage />)
    expect(screen.getByText(/last updated/i)).toBeInTheDocument()
  })
})

// ── B1: court tab switching + counts ─────────────────────────────────────────

describe('QueuePage court tabs', () => {
  beforeEach(() => {
    mockSession({ can: () => true })
    mockQueueHistory()
  })

  const NEEDS_UNCLAIMED = makeApproval({ id: 'a-needs-1', status: 'PENDING', claimedById: null })
  const NEEDS_CLAIMED_OTHER = makeApproval({
    id: 'a-needs-2',
    status: 'PENDING',
    claimedById: 'admin-other',
    claimedBy: { id: 'admin-other', name: 'Jordan Lee' },
  })
  const AWAITING_MERCHANT = makeApproval({
    id: 'a-merchant-1',
    status: 'CHANGES_REQUESTED',
    merchant: { id: 'm-2', businessName: 'Brew and Bloom', status: 'PENDING_APPROVAL' } as AdminApproval['merchant'],
  })

  function items() {
    return [NEEDS_UNCLAIMED, NEEDS_CLAIMED_OTHER, AWAITING_MERCHANT]
  }

  it('defaults to the "Needs you" court, showing PENDING rows (including claimed-by-other)', () => {
    mockQueue({ items: items() })
    render(<QueuePage />)

    expect(screen.getByTestId('queue-row-a-needs-1')).toBeInTheDocument()
    expect(screen.getByTestId('queue-row-a-needs-2')).toBeInTheDocument()
    expect(screen.queryByTestId('queue-row-a-merchant-1')).not.toBeInTheDocument()
  })

  it('shows the correct count on each court tab', () => {
    mockQueue({ items: items() })
    render(<QueuePage />)

    const needsTab = screen.getByRole('tab', { name: /needs you/i })
    const merchantTab = screen.getByRole('tab', { name: /awaiting merchant/i })
    expect(needsTab).toHaveTextContent('2')
    expect(merchantTab).toHaveTextContent('1')
  })

  it('switching to "Awaiting merchant" shows only CHANGES_REQUESTED rows', () => {
    mockQueue({ items: items() })
    render(<QueuePage />)

    fireEvent.click(screen.getByRole('tab', { name: /awaiting merchant/i }))

    expect(screen.getByTestId('queue-row-a-merchant-1')).toBeInTheDocument()
    expect(screen.queryByTestId('queue-row-a-needs-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('queue-row-a-needs-2')).not.toBeInTheDocument()
  })

  it('marks the active court tab aria-selected=true', () => {
    mockQueue({ items: items() })
    render(<QueuePage />)

    expect(screen.getByRole('tab', { name: /needs you/i })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    fireEvent.click(screen.getByRole('tab', { name: /awaiting merchant/i }))
    expect(screen.getByRole('tab', { name: /awaiting merchant/i })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('tab', { name: /needs you/i })).toHaveAttribute(
      'aria-selected',
      'false'
    )
  })
})

// ── B1: type chips composing with the active court ───────────────────────────

describe('QueuePage type chips composing with court tabs', () => {
  beforeEach(() => {
    mockSession({ can: () => true })
    mockQueueHistory()
  })

  const NEEDS_ONBOARDING = makeApproval({ id: 'a-onb', type: 'MERCHANT_ONBOARDING', status: 'PENDING' })
  const NEEDS_VOUCHER = makeApproval({
    id: 'a-vou',
    type: 'VOUCHER',
    status: 'PENDING',
    merchant: { id: 'm-3', businessName: 'Harbour Yoga', status: 'ACTIVE' } as AdminApproval['merchant'],
    voucher: { title: '2-for-1 mat classes', type: 'BOGO', status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' },
  })
  const MERCHANT_VOUCHER = makeApproval({
    id: 'a-mv',
    type: 'VOUCHER',
    status: 'CHANGES_REQUESTED',
    merchant: { id: 'm-4', businessName: 'Northside Barbers', status: 'ACTIVE' } as AdminApproval['merchant'],
    voucher: { title: '10% off a cut', type: 'DISCOUNT', status: 'PENDING_APPROVAL', approvalStatus: 'CHANGES_REQUESTED' },
  })

  function items() {
    return [NEEDS_ONBOARDING, NEEDS_VOUCHER, MERCHANT_VOUCHER]
  }

  it('filters the active court by the selected type chip', () => {
    mockQueue({ items: items() })
    render(<QueuePage />)

    // Needs-you court holds both onboarding + voucher rows initially.
    expect(screen.getByTestId('queue-row-a-onb')).toBeInTheDocument()
    expect(screen.getByTestId('queue-row-a-vou')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /^voucher/i }))

    expect(screen.queryByTestId('queue-row-a-onb')).not.toBeInTheDocument()
    expect(screen.getByTestId('queue-row-a-vou')).toBeInTheDocument()
  })

  it('scopes type-chip counts to the active court (Needs-you vs Awaiting-merchant)', () => {
    mockQueue({ items: items() })
    render(<QueuePage />)

    // Needs-you: 1 onboarding + 1 voucher.
    expect(screen.getByRole('tab', { name: /^onboarding/i })).toHaveTextContent('1')
    expect(screen.getByRole('tab', { name: /^voucher/i })).toHaveTextContent('1')

    fireEvent.click(screen.getByRole('tab', { name: /awaiting merchant/i }))

    // Awaiting-merchant: 0 onboarding + 1 voucher.
    expect(screen.getByRole('tab', { name: /^onboarding/i })).toHaveTextContent('0')
    expect(screen.getByRole('tab', { name: /^voucher/i })).toHaveTextContent('1')
  })

  it('resets the type filter to "all" when the court tab changes', () => {
    mockQueue({ items: items() })
    render(<QueuePage />)

    fireEvent.click(screen.getByRole('tab', { name: /^voucher/i }))
    expect(screen.getByRole('tab', { name: /^voucher/i })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('tab', { name: /awaiting merchant/i }))

    expect(screen.getByRole('tab', { name: /^all/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /^voucher/i })).toHaveAttribute(
      'aria-selected',
      'false'
    )
  })

  it('offers a "Clear filter" action in the empty state when a type filter yields nothing', () => {
    mockQueue({ items: [NEEDS_ONBOARDING] })
    render(<QueuePage />)

    fireEvent.click(screen.getByRole('tab', { name: /^voucher/i }))

    expect(screen.getByText(/no items match/i)).toBeInTheDocument()
    const clearButton = screen.getByRole('button', { name: /clear filter/i })
    fireEvent.click(clearButton)

    expect(screen.getByTestId('queue-row-a-onb')).toBeInTheDocument()
  })
})

// ── B1: History reachability ──────────────────────────────────────────────────

describe('QueuePage History tab', () => {
  const APPROVED_ITEM = makeApproval({
    id: 'a-approved',
    status: 'APPROVED',
    actionedAt: hoursAgoIso(48),
    merchant: { id: 'm-5', businessName: 'Historic Co', status: 'ACTIVE' } as AdminApproval['merchant'],
  })

  beforeEach(() => {
    mockSession({ can: () => true })
  })

  it('calls useQueueHistory with enabled:false until the History tab is selected', () => {
    mockQueue({ items: [] })
    mockQueueHistory({ hasLoaded: true, items: [APPROVED_ITEM] })
    render(<QueuePage />)

    expect(mockedUseQueueHistory.mock.calls[0][0]).toEqual({ enabled: false })

    fireEvent.click(screen.getByRole('tab', { name: /history/i }))

    const lastCall = mockedUseQueueHistory.mock.calls.at(-1)
    expect(lastCall?.[0]).toEqual({ enabled: true })
  })

  it('the closed/history item is not visible on the default "Needs you" court', () => {
    mockQueue({ items: [] })
    mockQueueHistory({ hasLoaded: true, items: [APPROVED_ITEM] })
    render(<QueuePage />)

    expect(screen.queryByText('Historic Co')).not.toBeInTheDocument()
  })

  it('selecting the History tab renders the terminal-status rows', () => {
    mockQueue({ items: [] })
    mockQueueHistory({ hasLoaded: true, items: [APPROVED_ITEM] })
    render(<QueuePage />)

    fireEvent.click(screen.getByRole('tab', { name: /history/i }))

    expect(screen.getByTestId('queue-row-a-approved')).toHaveTextContent('Historic Co')
    expect(screen.getByTestId('queue-row-a-approved')).toHaveTextContent('Approved')
  })

  it('shows no count on the History tab until it has loaded (undefined, not a misleading 0)', () => {
    mockQueue({ items: [] })
    mockQueueHistory({ hasLoaded: false, items: [] })
    render(<QueuePage />)

    const historyTab = screen.getByRole('tab', { name: /history/i })
    expect(historyTab).not.toHaveTextContent('0')
  })

  it('shows the History count once loaded', () => {
    mockQueue({ items: [] })
    mockQueueHistory({ hasLoaded: true, items: [APPROVED_ITEM] })
    render(<QueuePage />)

    expect(screen.getByRole('tab', { name: /history/i })).toHaveTextContent('1')
  })
})

// ── B1: optional-field grace (unmerged PR #455 merchant-name enrichment) ────

describe('QueuePage optional-field grace for edit/branch-lifecycle rows', () => {
  beforeEach(() => {
    mockSession({ can: () => true })
    mockQueueHistory()
  })

  it('renders gracefully (Unknown merchant, no crash) when merchant is null — pre-#455 shape', () => {
    const row = makeApproval({
      id: 'a-edit-nomerchant',
      type: 'BRANCH_CREATE',
      referenceId: 'branch-1',
      referenceType: 'branch',
      merchant: null,
    })
    mockQueue({ items: [row] })
    render(<QueuePage />)

    expect(screen.getByTestId('queue-row-a-edit-nomerchant')).toHaveTextContent('Unknown merchant')
  })

  it('renders the enriched merchant name when present — post-#455 shape', () => {
    const row = makeApproval({
      id: 'a-edit-withmerchant',
      type: 'BRANCH_CREATE',
      referenceId: 'branch-2',
      referenceType: 'branch',
      merchant: { id: 'm-6', businessName: 'Green Fork Deli', status: 'ACTIVE' } as AdminApproval['merchant'],
    })
    mockQueue({ items: [row] })
    render(<QueuePage />)

    expect(screen.getByTestId('queue-row-a-edit-withmerchant')).toHaveTextContent('Green Fork Deli')
  })

  it('renders both shapes side by side without crashing', () => {
    const withoutMerchant = makeApproval({
      id: 'a-mixed-1',
      type: 'MERCHANT_IDENTITY_EDIT',
      merchant: null,
    })
    const withMerchant = makeApproval({
      id: 'a-mixed-2',
      type: 'MERCHANT_IDENTITY_EDIT',
      merchant: { id: 'm-7', businessName: 'Northside Barbers', status: 'ACTIVE' } as AdminApproval['merchant'],
    })
    mockQueue({ items: [withoutMerchant, withMerchant] })
    render(<QueuePage />)

    expect(screen.getByTestId('queue-row-a-mixed-1')).toHaveTextContent('Unknown merchant')
    expect(screen.getByTestId('queue-row-a-mixed-2')).toHaveTextContent('Northside Barbers')
  })
})

// ── M6: Create merchant draft topbar entry (unchanged) ────────────────────────

describe('QueuePage create-draft topbar entry', () => {
  beforeEach(() => {
    mockQueueHistory()
  })

  it('shows the "Create merchant draft" button when the admin has merchant:create-draft', () => {
    mockSession({ can: (cap) => cap === 'approval:read' || cap === 'merchant:create-draft' })
    mockQueue()
    render(<QueuePage />)
    const entry = screen.getByTestId('create-draft-entry')
    expect(entry).toBeInTheDocument()
    expect(entry).toHaveAttribute('href', '/merchants/new')
    expect(screen.getByText(/create merchant draft/i)).toBeInTheDocument()
  })

  it('hides the "Create merchant draft" button without merchant:create-draft', () => {
    mockSession({ can: (cap) => cap === 'approval:read' })
    mockQueue()
    render(<QueuePage />)
    expect(screen.queryByTestId('create-draft-entry')).not.toBeInTheDocument()
  })
})

// ── B1: age-tint rendering smoke test (boundary logic itself is covered by
//        lib/ui/__tests__/adminTones.test.ts + rowHelpers.test.ts) ───────────

describe('QueuePage age-tint rendering', () => {
  beforeEach(() => {
    mockSession({ can: () => true })
    mockQueueHistory()
  })

  it('renders neutral/warn/danger waiting pills at the 12h/36h boundaries', () => {
    const rows = [
      makeApproval({ id: 'a-11h', submittedAt: hoursAgoIso(11) }),
      makeApproval({ id: 'a-12h', submittedAt: hoursAgoIso(12) }),
      makeApproval({ id: 'a-36h', submittedAt: hoursAgoIso(36) }),
    ]
    mockQueue({ items: rows })
    render(<QueuePage />)

    // Scope to the wide-table row (jsdom renders both the wide table and the
    // narrow card list at once — real CSS media queries decide visibility —
    // so an unscoped text query would ambiguously match both).
    const neutralBadge = within(screen.getByTestId('queue-row-a-11h')).getByText('11h')
    const warnBadge = within(screen.getByTestId('queue-row-a-12h')).getByText('12h')
    // 36h == "1d 12h" in the combined d/h format.
    const dangerBadge = within(screen.getByTestId('queue-row-a-36h')).getByText('1d 12h')

    expect(neutralBadge.className).not.toMatch(/amber|red/)
    expect(warnBadge.className).toMatch(/amber/)
    expect(dangerBadge.className).toMatch(/red/)
  })
})


// ── S4: Self-approved filter (SUPER_ADMIN-only, History court) ─────────────────

describe('QueuePage self-approved filter (S4)', () => {
  const SELF_ITEM = makeApproval({
    id: 'a-self',
    status: 'APPROVED',
    actionedAt: hoursAgoIso(48),
    selfOnboarded: true,
    merchant: { id: 'm-self', businessName: 'Self Approved Co', status: 'ACTIVE' } as AdminApproval['merchant'],
  })
  const OTHER_ITEM = makeApproval({
    id: 'a-other',
    status: 'APPROVED',
    actionedAt: hoursAgoIso(48),
    selfOnboarded: false,
    merchant: { id: 'm-other', businessName: 'Two Eyes Co', status: 'ACTIVE' } as AdminApproval['merchant'],
  })

  function renderHistoryAs(role: string) {
    mockSession({ can: () => true, role })
    mockQueue({ items: [] })
    mockQueueHistory({ hasLoaded: true, items: [SELF_ITEM, OTHER_ITEM] })
    render(<QueuePage />)
    fireEvent.click(screen.getByRole('tab', { name: /history/i }))
  }

  it('shows the self-approved filter for SUPER_ADMIN on the History court', () => {
    renderHistoryAs('SUPER_ADMIN')
    expect(screen.getByTestId('self-approved-filter')).toBeInTheDocument()
  })

  it('HIDES the self-approved filter for OPERATIONS (non-super) even on History', () => {
    renderHistoryAs('OPERATIONS')
    expect(screen.queryByTestId('self-approved-filter')).not.toBeInTheDocument()
  })

  it('HIDES the self-approved filter for FIELD even on History', () => {
    renderHistoryAs('FIELD')
    expect(screen.queryByTestId('self-approved-filter')).not.toBeInTheDocument()
  })

  it('does NOT show the filter for SUPER_ADMIN on the default Needs-you court', () => {
    mockSession({ can: () => true, role: 'SUPER_ADMIN' })
    mockQueue({ items: [] })
    mockQueueHistory({ hasLoaded: true, items: [SELF_ITEM, OTHER_ITEM] })
    render(<QueuePage />)
    expect(screen.queryByTestId('self-approved-filter')).not.toBeInTheDocument()
  })

  it('the badge is visible to a non-super on a self-approved history row (transparency, ungated)', () => {
    renderHistoryAs('OPERATIONS')
    expect(screen.getByTestId('queue-row-a-self')).toHaveTextContent(/self-approved/i)
    expect(screen.getByTestId('queue-row-a-other')).not.toHaveTextContent(/self-approved/i)
  })

  it('toggling the filter narrows the rows to self-approved only (SUPER_ADMIN)', () => {
    renderHistoryAs('SUPER_ADMIN')
    // Both visible before toggling.
    expect(screen.getByTestId('queue-row-a-self')).toBeInTheDocument()
    expect(screen.getByTestId('queue-row-a-other')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('self-approved-filter'))

    expect(screen.getByTestId('queue-row-a-self')).toBeInTheDocument()
    expect(screen.queryByTestId('queue-row-a-other')).not.toBeInTheDocument()
  })
})
