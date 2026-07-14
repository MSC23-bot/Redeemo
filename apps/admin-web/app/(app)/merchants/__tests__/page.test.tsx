/**
 * /merchants directory page: capability gate + list states. This page had no
 * test before the MerchantNote slice (#517 disclosure); this covers the three
 * load-bearing branches following the queue page test idiom: the directory
 * renders with merchant:read, ForbiddenState renders without it (and the read is
 * never fired), and ErrorState renders on a hook error (distinct from empty).
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import MerchantsPage from '../page'
import type { MerchantSummary } from '@/lib/api/merchants'

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

jest.mock('@/lib/auth/useSession', () => ({ useSession: jest.fn() }))
jest.mock('@/lib/merchants/useMerchantsList', () => ({ useMerchantsList: jest.fn() }))

import { useSession } from '@/lib/auth/useSession'
import { useMerchantsList } from '@/lib/merchants/useMerchantsList'

const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>
const mockedUseMerchantsList = useMerchantsList as jest.MockedFunction<typeof useMerchantsList>

function mockSession(overrides: { can?: (cap: string) => boolean; ready?: boolean } = {}) {
  mockedUseSession.mockReturnValue({
    accessToken: 'tok',
    ready: overrides.ready ?? true,
    isAuthenticated: true,
    role: 'OPERATIONS' as never,
    email: 'ops@redeemo.co.uk',
    adminId: 'admin-me',
    can: overrides.can ?? (() => true),
    setSession: jest.fn(),
    refresh: jest.fn(),
    signOut: jest.fn(),
  })
}

function mockList(overrides: Partial<ReturnType<typeof useMerchantsList>> = {}) {
  mockedUseMerchantsList.mockReturnValue({
    data: { page: 1, pageSize: 20, total: 0, merchants: [] },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: jest.fn(),
    ...overrides,
  })
}

function makeMerchant(overrides: Partial<MerchantSummary> = {}): MerchantSummary {
  return {
    id: 'm-1',
    businessName: 'Acme Coffee',
    tradingName: 'Acme',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED',
    onboardingStep: 'LIVE',
    logoUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    category: 'Food & Drink',
    branchCount: 2,
    ...overrides,
  }
}

afterEach(() => jest.clearAllMocks())

describe('MerchantsPage capability gate', () => {
  it('renders the directory heading when the admin has merchant:read', () => {
    mockSession({ can: () => true })
    mockList({ data: { page: 1, pageSize: 20, total: 1, merchants: [makeMerchant()] } })
    render(<MerchantsPage />)
    expect(screen.getByRole('heading', { name: 'Merchants' })).toBeInTheDocument()
    expect(screen.getByText('Acme Coffee')).toBeInTheDocument()
    expect(screen.queryByTestId('merchants-forbidden')).not.toBeInTheDocument()
  })

  it('shows ForbiddenState (naming the capability) and never fires the read without merchant:read', () => {
    mockSession({ can: () => false })
    mockList()
    render(<MerchantsPage />)
    const forbidden = screen.getByTestId('merchants-forbidden')
    expect(forbidden).toHaveTextContent(/merchant:read/)
    expect(mockedUseMerchantsList).toHaveBeenCalledWith(expect.anything(), { enabled: false })
  })

  it('shows the loader (not forbidden) while the session is not yet ready', () => {
    mockSession({ ready: false, can: () => false })
    mockList()
    render(<MerchantsPage />)
    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument()
    expect(screen.queryByTestId('merchants-forbidden')).not.toBeInTheDocument()
  })
})

describe('MerchantsPage list states', () => {
  beforeEach(() => mockSession({ can: () => true }))

  it('shows the error state (distinct from empty) on a hook error', () => {
    mockList({ isError: true })
    render(<MerchantsPage />)
    const error = screen.getByTestId('merchants-error')
    expect(error).toHaveTextContent(/could not load the merchants directory/i)
    expect(error).toHaveTextContent(/no items were changed/i)
  })

  it('renders the empty table without an error when there are no merchants', () => {
    mockList({ data: { page: 1, pageSize: 20, total: 0, merchants: [] } })
    render(<MerchantsPage />)
    expect(screen.queryByTestId('merchants-error')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Merchants' })).toBeInTheDocument()
  })
})
