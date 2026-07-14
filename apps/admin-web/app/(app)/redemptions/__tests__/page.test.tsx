/**
 * /redemptions page: capability gate, filters, table, pagination.
 * Mirrors app/(app)/queue/__tests__/page.test.tsx's mocking style.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import RedemptionsPage from '../page'
import type { AdminRedemptionRow } from '@/lib/api/redemptions'

// ── Mock useSession ───────────────────────────────────────────────────────────

jest.mock('@/lib/auth/useSession', () => ({
  useSession: jest.fn(),
}))

// ── Mock useRedemptions ───────────────────────────────────────────────────────

jest.mock('@/lib/redemptions/useRedemptions', () => ({
  useRedemptions: jest.fn(),
}))

import { useSession } from '@/lib/auth/useSession'
import { useRedemptions } from '@/lib/redemptions/useRedemptions'

const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>
const mockedUseRedemptions = useRedemptions as jest.MockedFunction<typeof useRedemptions>

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockSession(overrides: { can?: (cap: string) => boolean; role?: string }) {
  mockedUseSession.mockReturnValue({
    accessToken: 'test-access-token',
    ready: true,
    isAuthenticated: true,
    role: (overrides.role ?? 'OPERATIONS') as never,
    email: 'ops@redeemo.co.uk',
    adminId: 'admin-me',
    can: overrides.can ?? (() => true),
    setSession: jest.fn(),
    refresh: jest.fn(),
    signOut: jest.fn(),
  })
}

function row(overrides: Partial<AdminRedemptionRow> = {}) {
  return { ...baseRow(), ...overrides }
}
// Typed against the real row type so overrides accept the full status union
// (a `ReturnType<typeof baseRow>` fixture would narrow `status` to the
// literal and reject 'VALIDATED' overrides).
function baseRow(): AdminRedemptionRow {
  return {
    id: 'r1',
    redemptionCode: 'A7K2P9X4',
    voucher: { id: 'v1', title: 'Half-price pizza', type: 'BOGO' },
    branch: { id: 'b1', name: 'Main Branch' },
    merchant: { id: 'm1', businessName: 'Acme Coffee' },
    customerName: 'Sarah K.',
    redeemedAt: '2026-07-01T10:00:00.000Z',
    status: 'AWAITING_VALIDATION',
    validatedAt: null,
    validationMethod: null,
    validatedByLabel: null,
    estimatedSaving: 5,
    isTestData: false,
  }
}

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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RedemptionsPage capability gate', () => {
  it('shows forbidden state when role lacks redemption:read', () => {
    mockSession({ can: () => false })
    mockRedemptions()

    render(<RedemptionsPage />)

    expect(screen.getByTestId('redemptions-forbidden')).toBeInTheDocument()
    // Exact match: the forbidden heading itself legitimately contains the
    // word "redemptions" (honesty-copy sweep names the surface), so this
    // must check for the real page H1 by its exact text, not a substring.
    expect(screen.queryByRole('heading', { name: 'Redemptions' })).not.toBeInTheDocument()
  })

  // Honesty-copy sweep (2026-07-13): denied copy must name the capability +
  // the viewer's role and reassure that nothing is broken.
  it('the forbidden state names redemption:read, the viewer role, and reassures nothing is broken', () => {
    mockSession({ can: () => false, role: 'CONTENT' })
    mockRedemptions()

    render(<RedemptionsPage />)

    const forbidden = screen.getByTestId('redemptions-forbidden')
    expect(forbidden).toHaveTextContent(/redemption:read/)
    expect(forbidden).toHaveTextContent(/CONTENT/)
    expect(forbidden).toHaveTextContent(/nothing is broken/i)
  })

  it('calls useRedemptions with enabled:false when the admin lacks redemption:read', () => {
    mockSession({ can: () => false })
    mockRedemptions()

    render(<RedemptionsPage />)

    expect(mockedUseRedemptions).toHaveBeenCalledWith(expect.anything(), { enabled: false })
  })

  it('authorised admin does NOT see the forbidden state', () => {
    mockSession({ can: () => true })
    mockRedemptions()

    render(<RedemptionsPage />)

    expect(screen.queryByTestId('redemptions-forbidden')).not.toBeInTheDocument()
    expect(screen.getByText('Redemptions')).toBeInTheDocument()
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
    mockRedemptions()

    render(<RedemptionsPage />)

    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument()
    expect(screen.queryByTestId('redemptions-forbidden')).not.toBeInTheDocument()
  })
})

describe('RedemptionsPage OPERATIONS role (has redemption:read)', () => {
  beforeEach(() => {
    mockSession({ can: () => true })
  })

  it('shows loading state while isLoading is true', () => {
    mockRedemptions({ isLoading: true })
    render(<RedemptionsPage />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows error state when isError is true', () => {
    mockRedemptions({ isError: true, isLoading: false })
    render(<RedemptionsPage />)
    expect(screen.getByText(/could not load redemptions/i)).toBeInTheDocument()
  })

  // Honesty-copy sweep (2026-07-13): error copy must reassure nothing was
  // changed, distinct from the "No redemptions match" empty state below.
  it('the error state reassures nothing was changed', () => {
    mockRedemptions({ isError: true, isLoading: false })
    render(<RedemptionsPage />)
    expect(screen.getByTestId('redemptions-error')).toHaveTextContent(/no items were changed/i)
  })

  it('calls refetch when Retry is clicked in the error state', () => {
    const refetch = jest.fn()
    mockRedemptions({ isError: true, isLoading: false, refetch })
    render(<RedemptionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('shows the empty state when items is empty', () => {
    mockRedemptions({ data: { items: [], total: 0, limit: 25, offset: 0 } })
    render(<RedemptionsPage />)
    expect(screen.getByText(/no redemptions match this search/i)).toBeInTheDocument()
  })

  it('renders a redemption row with code, merchant, branch, voucher, customer, saving, status', () => {
    mockRedemptions({ data: { items: [row()], total: 1, limit: 25, offset: 0 } })
    render(<RedemptionsPage />)
    const tr = screen.getByTestId('redemption-row-r1')
    expect(tr).toHaveTextContent('A7K2 P9X4')
    expect(tr).toHaveTextContent('Acme Coffee')
    expect(tr).toHaveTextContent('Main Branch')
    expect(tr).toHaveTextContent('Half-price pizza')
    expect(tr).toHaveTextContent('Sarah K.')
    expect(tr).toHaveTextContent('£5.00')
    expect(tr).toHaveTextContent('Awaiting validation')
  })

  it('shows a Test badge for an isTestData row and not for a non-test row', () => {
    mockRedemptions({
      data: {
        items: [row({ id: 'r1', isTestData: true }), row({ id: 'r2', isTestData: false })],
        total: 2, limit: 25, offset: 0,
      },
    })
    render(<RedemptionsPage />)
    expect(screen.getByTestId('redemption-row-r1')).toHaveTextContent('Test')
    expect(screen.getByTestId('redemption-row-r2')).not.toHaveTextContent('Test')
  })

  it('shows a Validated status pill for a validated row', () => {
    mockRedemptions({
      data: { items: [row({ status: 'VALIDATED' as const })], total: 1, limit: 25, offset: 0 },
    })
    render(<RedemptionsPage />)
    expect(screen.getByTestId('redemption-row-r1')).toHaveTextContent('Validated')
  })

  it('renders the status filter chips', () => {
    mockRedemptions()
    render(<RedemptionsPage />)
    expect(screen.getByRole('tab', { name: /^all$/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /awaiting/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /validated/i })).toBeInTheDocument()
  })

  it('clicking the Awaiting chip passes status:"awaiting" to useRedemptions', () => {
    mockRedemptions()
    render(<RedemptionsPage />)
    fireEvent.click(screen.getByRole('tab', { name: /awaiting/i }))
    const lastCallFilters = mockedUseRedemptions.mock.calls[mockedUseRedemptions.mock.calls.length - 1][0]
    expect(lastCallFilters.status).toBe('awaiting')
  })

  it('the include-test toggle defaults ON (includeTest:true passed to useRedemptions)', () => {
    mockRedemptions()
    render(<RedemptionsPage />)
    const lastCallFilters = mockedUseRedemptions.mock.calls[mockedUseRedemptions.mock.calls.length - 1][0]
    expect(lastCallFilters.includeTest).toBe(true)
    expect(screen.getByTestId('redemptions-include-test-toggle')).toBeChecked()
  })

  it('unchecking the include-test toggle passes includeTest:false', () => {
    mockRedemptions()
    render(<RedemptionsPage />)
    fireEvent.click(screen.getByTestId('redemptions-include-test-toggle'))
    const lastCallFilters = mockedUseRedemptions.mock.calls[mockedUseRedemptions.mock.calls.length - 1][0]
    expect(lastCallFilters.includeTest).toBe(false)
  })

  it('pressing Enter in the search box submits the code filter', () => {
    mockRedemptions()
    render(<RedemptionsPage />)
    const input = screen.getByTestId('redemptions-search-input')
    fireEvent.change(input, { target: { value: 'coffee' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const lastCallFilters = mockedUseRedemptions.mock.calls[mockedUseRedemptions.mock.calls.length - 1][0]
    expect(lastCallFilters.code).toBe('coffee')
  })

  it('typing without pressing Enter does NOT submit the code filter', () => {
    mockRedemptions()
    render(<RedemptionsPage />)
    const input = screen.getByTestId('redemptions-search-input')
    fireEvent.change(input, { target: { value: 'coffee' } })
    const lastCallFilters = mockedUseRedemptions.mock.calls[mockedUseRedemptions.mock.calls.length - 1][0]
    expect(lastCallFilters.code).toBeUndefined()
  })

  it('renders pagination and disables Previous on the first page', () => {
    mockRedemptions({ data: { items: [row()], total: 30, limit: 25, offset: 0 } })
    render(<RedemptionsPage />)
    expect(screen.getByTestId('redemptions-prev-page')).toBeDisabled()
    expect(screen.getByTestId('redemptions-next-page')).not.toBeDisabled()
  })

  it('clicking Next advances the offset passed to useRedemptions', () => {
    mockRedemptions({ data: { items: [row()], total: 30, limit: 25, offset: 0 } })
    render(<RedemptionsPage />)
    fireEvent.click(screen.getByTestId('redemptions-next-page'))
    const lastCallFilters = mockedUseRedemptions.mock.calls[mockedUseRedemptions.mock.calls.length - 1][0]
    expect(lastCallFilters.offset).toBe(25)
  })

  it('disables Next on the last page', () => {
    mockRedemptions({ data: { items: [row()], total: 1, limit: 25, offset: 0 } })
    render(<RedemptionsPage />)
    expect(screen.getByTestId('redemptions-next-page')).toBeDisabled()
  })
})
