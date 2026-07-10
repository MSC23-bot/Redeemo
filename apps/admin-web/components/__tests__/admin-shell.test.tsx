/**
 * AdminShell : NAV_ITEMS capability-filtering tests.
 *
 * C1 adds "Leads and onboarding" (`/leads`, gated on `merchant:create-draft`)
 * to the existing capability-filtered nav. These tests cover that new entry
 * specifically, plus confirm the pre-existing items and the fail-closed
 * empty-nav behaviour are unaffected by the addition.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { AdminShell } from '../admin-shell'

// ── Mock next/navigation ──────────────────────────────────────────────────────

const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

// ── Mock NotificationBell (exercised by its own tests) ────────────────────────

jest.mock('@/components/notification-bell', () => ({
  NotificationBell: () => <div data-testid="notification-bell-mock" />,
}))

// ── Mock useSession ───────────────────────────────────────────────────────────

jest.mock('@/lib/auth/useSession', () => ({
  useSession: jest.fn(),
}))

import { useSession } from '@/lib/auth/useSession'

const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>

function mockSession(can: (cap: string) => boolean) {
  mockedUseSession.mockReturnValue({
    accessToken: 'test-access-token',
    ready: true,
    isAuthenticated: true,
    role: 'OPERATIONS',
    email: 'ops@redeemo.co.uk',
    adminId: 'admin-me',
    can,
    setSession: jest.fn(),
    refresh: jest.fn(),
    signOut: jest.fn(),
  })
}

afterEach(() => jest.clearAllMocks())

describe('AdminShell nav : Leads and onboarding entry', () => {
  it('shows "Leads and onboarding" linking to /leads when the admin has merchant:create-draft', () => {
    mockSession((cap) => cap === 'merchant:create-draft')
    render(<AdminShell>content</AdminShell>)

    const link = screen.getByRole('link', { name: 'Leads and onboarding' })
    expect(link).toHaveAttribute('href', '/leads')
  })

  it('hides "Leads and onboarding" when the admin lacks merchant:create-draft, even with merchant:read', () => {
    mockSession((cap) => cap === 'merchant:read')
    render(<AdminShell>content</AdminShell>)

    expect(screen.queryByRole('link', { name: 'Leads and onboarding' })).not.toBeInTheDocument()
  })

  it('SUPER_ADMIN (all capabilities) sees every nav item including Leads and onboarding', () => {
    mockSession(() => true)
    render(<AdminShell>content</AdminShell>)

    expect(screen.getByRole('link', { name: 'Approval queue' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Merchants' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Leads and onboarding' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Redemptions' })).toBeInTheDocument()
  })

  it('a role with none of the nav capabilities renders no nav at all (fail-closed)', () => {
    mockSession(() => false)
    render(<AdminShell>content</AdminShell>)

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('existing nav items are unaffected by the new entry', () => {
    mockSession((cap) => cap === 'approval:read' || cap === 'redemption:read')
    render(<AdminShell>content</AdminShell>)

    expect(screen.getByRole('link', { name: 'Approval queue' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Redemptions' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Merchants' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Leads and onboarding' })).not.toBeInTheDocument()
  })
})
