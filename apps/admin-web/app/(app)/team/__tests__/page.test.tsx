/**
 * /team page: capability gate (fail-closed), roster rendering, dialog wiring
 * (create / change-role / grant / revoke / deactivate fire the right mutation
 * payloads), self-deactivate disabled, and error-code copy via
 * NamedGateBanner. Mirrors app/(app)/redemptions/__tests__/page.test.tsx's
 * mocking style, extended to also mock the 5 team mutation hooks so the REAL
 * dialogs + table render and are driven through the actual DOM.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TeamPage from '../page'
import { ApiError } from '@/lib/api/client'
import type { TeamAdmin } from '@/lib/api/team'

// ── Mock useSession ───────────────────────────────────────────────────────────

jest.mock('@/lib/auth/useSession', () => ({
  useSession: jest.fn(),
}))

// ── Mock lib/team/useTeam (roster read + all 5 mutations) ─────────────────────

const mockRefetch = jest.fn()

const mockCreate = { mutateAsync: jest.fn(), isPending: false, error: null as Error | null }
const mockSetRole = { mutateAsync: jest.fn(), isPending: false, error: null as Error | null }
const mockDeactivate = { mutateAsync: jest.fn(), isPending: false, error: null as Error | null }
const mockGrant = { mutateAsync: jest.fn(), isPending: false, error: null as Error | null }
const mockRevoke = { mutateAsync: jest.fn(), isPending: false, error: null as Error | null }

jest.mock('@/lib/team/useTeam', () => ({
  useTeamRoster: jest.fn(),
  useCreateAdmin: jest.fn(() => mockCreate),
  useSetAdminRole: jest.fn(() => mockSetRole),
  useDeactivateAdmin: jest.fn(() => mockDeactivate),
  useGrantCapability: jest.fn(() => mockGrant),
  useRevokeCapability: jest.fn(() => mockRevoke),
}))

import { useSession } from '@/lib/auth/useSession'
import { useTeamRoster } from '@/lib/team/useTeam'

const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>
const mockedUseTeamRoster = useTeamRoster as jest.MockedFunction<typeof useTeamRoster>

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockSession(overrides: {
  can?: (cap: string) => boolean
  ready?: boolean
  adminId?: string | null
  role?: string
}) {
  mockedUseSession.mockReturnValue({
    accessToken: 'test-access-token',
    ready: overrides.ready ?? true,
    isAuthenticated: true,
    role: (overrides.role ?? 'SUPER_ADMIN') as never,
    email: 'super@redeemo.co.uk',
    adminId: overrides.adminId ?? 'me',
    can: overrides.can ?? (() => true),
    setSession: jest.fn(),
    refresh: jest.fn(),
    signOut: jest.fn(),
  })
}

function makeAdmin(overrides: Partial<TeamAdmin> = {}): TeamAdmin {
  return {
    id: 'me',
    email: 'super@redeemo.co.uk',
    name: 'Super Person',
    role: 'SUPER_ADMIN',
    isActive: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    activeGrants: [],
    ...overrides,
  }
}

function mockRoster(overrides: Partial<ReturnType<typeof useTeamRoster>> = {}) {
  mockedUseTeamRoster.mockReturnValue({
    data: { admins: [] },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: mockRefetch,
    ...overrides,
  })
}

afterEach(() => {
  jest.clearAllMocks()
  for (const m of [mockCreate, mockSetRole, mockDeactivate, mockGrant, mockRevoke]) {
    m.isPending = false
    m.error = null
  }
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TeamPage capability gate (fail-closed)', () => {
  it('shows forbidden state when role lacks admin:manage-team', () => {
    mockSession({ can: () => false })
    mockRoster()

    render(<TeamPage />)

    expect(screen.getByTestId('team-forbidden')).toBeInTheDocument()
    expect(screen.queryByText('Team & roles')).not.toBeInTheDocument()
  })

  // Honesty-copy sweep (2026-07-13): denied copy must name the capability +
  // the viewer's role and reassure that nothing is broken.
  it('the forbidden state names admin:manage-team, the viewer role, and reassures nothing is broken', () => {
    mockSession({ can: () => false, role: 'OPERATIONS' })
    mockRoster()

    render(<TeamPage />)

    const forbidden = screen.getByTestId('team-forbidden')
    expect(forbidden).toHaveTextContent(/admin:manage-team/)
    expect(forbidden).toHaveTextContent(/OPERATIONS/)
    expect(forbidden).toHaveTextContent(/nothing is broken/i)
  })

  it('calls useTeamRoster with enabled:false when the admin lacks admin:manage-team', () => {
    mockSession({ can: () => false })
    mockRoster()

    render(<TeamPage />)

    expect(mockedUseTeamRoster).toHaveBeenCalledWith({ enabled: false })
  })

  it('authorised (SUPER_ADMIN) admin does NOT see the forbidden state', () => {
    mockSession({ can: () => true })
    mockRoster()

    render(<TeamPage />)

    expect(screen.queryByTestId('team-forbidden')).not.toBeInTheDocument()
    expect(screen.getByText('Team & roles')).toBeInTheDocument()
  })

  it('shows the loader (not forbidden) while session is not yet ready', () => {
    mockSession({ ready: false, can: () => false })
    mockRoster()

    render(<TeamPage />)

    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument()
    expect(screen.queryByTestId('team-forbidden')).not.toBeInTheDocument()
  })
})

describe('TeamPage roster rendering', () => {
  beforeEach(() => {
    mockSession({ can: () => true })
  })

  it('shows loading state while isLoading is true', () => {
    mockRoster({ isLoading: true })
    render(<TeamPage />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows error state when isError is true', () => {
    mockRoster({ isError: true, isLoading: false })
    render(<TeamPage />)
    expect(screen.getByText(/could not load the team roster/i)).toBeInTheDocument()
  })

  // Honesty-copy sweep (2026-07-13): error copy must reassure nothing was
  // changed, distinct from the "No admin accounts yet" empty state below.
  it('the error state reassures nothing was changed', () => {
    mockRoster({ isError: true, isLoading: false })
    render(<TeamPage />)
    expect(screen.getByTestId('team-error')).toHaveTextContent(/no items were changed/i)
  })

  it('clicking Retry in the error state calls refetch', () => {
    mockRoster({ isError: true, isLoading: false })
    render(<TeamPage />)
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })

  it('shows the empty state when there are no admins', () => {
    mockRoster({ data: { admins: [] } })
    render(<TeamPage />)
    expect(screen.getByText('No admin accounts yet.')).toBeInTheDocument()
  })

  it('renders a roster row with name, email, role, status', () => {
    mockRoster({ data: { admins: [makeAdmin({ id: 'a1', name: 'Field Rep', email: 'rep@redeemo.com', role: 'FIELD' })] } })
    render(<TeamPage />)
    const row = screen.getByTestId('team-row-a1')
    expect(row).toHaveTextContent('Field Rep')
    expect(row).toHaveTextContent('rep@redeemo.com')
    expect(row).toHaveTextContent('Field')
    expect(row).toHaveTextContent('Active')
  })
})

describe('TeamPage self-deactivate disabled', () => {
  it('disables the Deactivate button on the signed-in admin own row', () => {
    mockSession({ can: () => true, adminId: 'me' })
    mockRoster({ data: { admins: [makeAdmin({ id: 'me' })] } })
    render(<TeamPage />)
    expect(screen.getByTestId('team-deactivate-me')).toBeDisabled()
  })

  it('leaves Deactivate enabled on a different admin row', () => {
    mockSession({ can: () => true, adminId: 'me' })
    mockRoster({ data: { admins: [makeAdmin({ id: 'other', email: 'x@y.com' })] } })
    render(<TeamPage />)
    expect(screen.getByTestId('team-deactivate-other')).not.toBeDisabled()
  })
})

describe('TeamPage — Create account dialog wiring', () => {
  beforeEach(() => {
    mockSession({ can: () => true })
    mockRoster({ data: { admins: [] } })
  })

  it('clicking "Create account" opens the dialog', () => {
    render(<TeamPage />)
    expect(screen.queryByTestId('create-account-dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('team-create-account-button'))
    expect(screen.getByTestId('create-account-dialog')).toBeInTheDocument()
  })

  it('submitting valid fields calls create with the right payload, closes the dialog, and refetches', async () => {
    mockCreate.mutateAsync.mockResolvedValueOnce({ id: 'new-1' })
    render(<TeamPage />)
    fireEvent.click(screen.getByTestId('team-create-account-button'))

    fireEvent.change(screen.getByTestId('create-account-email'), { target: { value: 'new@redeemo.com' } })
    fireEvent.change(screen.getByTestId('create-account-first-name'), { target: { value: 'New' } })
    fireEvent.change(screen.getByTestId('create-account-last-name'), { target: { value: 'Person' } })
    fireEvent.change(screen.getByTestId('create-account-role'), { target: { value: 'CONTENT' } })
    fireEvent.click(screen.getByTestId('create-account-submit'))

    await waitFor(() => {
      expect(mockCreate.mutateAsync).toHaveBeenCalledWith({
        email: 'new@redeemo.com',
        firstName: 'New',
        lastName: 'Person',
        role: 'CONTENT',
      })
    })
    await waitFor(() => expect(screen.queryByTestId('create-account-dialog')).not.toBeInTheDocument())
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('cancelling closes the dialog without calling create', () => {
    render(<TeamPage />)
    fireEvent.click(screen.getByTestId('team-create-account-button'))
    fireEvent.click(screen.getByTestId('create-account-cancel'))
    expect(screen.queryByTestId('create-account-dialog')).not.toBeInTheDocument()
    expect(mockCreate.mutateAsync).not.toHaveBeenCalled()
  })

  it('shows the EMAIL_ALREADY_EXISTS error copy (account-context override, not "owner email")', () => {
    mockCreate.error = new ApiError(409, { error: { code: 'EMAIL_ALREADY_EXISTS', message: 'Exists' } })
    render(<TeamPage />)
    fireEvent.click(screen.getByTestId('team-create-account-button'))
    const banner = screen.getByTestId('named-gate-banner')
    expect(banner).toHaveTextContent('An account with this email already exists. Use a different email.')
    expect(banner).not.toHaveTextContent('owner email')
  })
})

describe('TeamPage — Change role dialog wiring', () => {
  beforeEach(() => {
    mockSession({ can: () => true })
    mockRoster({ data: { admins: [makeAdmin({ id: 'a1', role: 'OPERATIONS' })] } })
  })

  it('clicking "Change role" opens the dialog for that admin', () => {
    render(<TeamPage />)
    fireEvent.click(screen.getByTestId('team-change-role-a1'))
    expect(screen.getByTestId('change-role-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('change-role-current')).toHaveTextContent('Operations')
  })

  it('confirming a new role calls setRole with the payload, closes the dialog, and refetches', async () => {
    mockSetRole.mutateAsync.mockResolvedValueOnce({ id: 'a1', email: 'x', role: 'FIELD', isActive: true })
    render(<TeamPage />)
    fireEvent.click(screen.getByTestId('team-change-role-a1'))
    fireEvent.change(screen.getByTestId('change-role-select'), { target: { value: 'FIELD' } })
    fireEvent.click(screen.getByTestId('change-role-submit'))

    await waitFor(() => expect(mockSetRole.mutateAsync).toHaveBeenCalledWith('FIELD'))
    await waitFor(() => expect(screen.queryByTestId('change-role-dialog')).not.toBeInTheDocument())
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('shows the ADMIN_NOT_FOUND error copy on a stale row', () => {
    mockSetRole.error = new ApiError(404, { error: { code: 'ADMIN_NOT_FOUND', message: 'Not found.' } })
    render(<TeamPage />)
    fireEvent.click(screen.getByTestId('team-change-role-a1'))
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'This admin account no longer exists. The list has refreshed.'
    )
  })
})

describe('TeamPage — grant/revoke approval flows', () => {
  it('Grant flow: clicking "Grant approve" opens the confirm; confirming calls grant + closes + refetches', async () => {
    mockSession({ can: () => true })
    mockRoster({ data: { admins: [makeAdmin({ id: 'a1', activeGrants: [] })] } })
    mockGrant.mutateAsync.mockResolvedValueOnce({ id: 'g1', capability: 'approval:action', grantedAt: '2026-07-01T00:00:00.000Z', alreadyGranted: false })
    render(<TeamPage />)

    fireEvent.click(screen.getByTestId('team-grant-approval-a1'))
    expect(screen.getByTestId('grant-approval-dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('grant-approval-submit'))

    await waitFor(() => expect(mockGrant.mutateAsync).toHaveBeenCalledWith('approval:action'))
    await waitFor(() => expect(screen.queryByTestId('grant-approval-dialog')).not.toBeInTheDocument())
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('Revoke flow: clicking "Revoke approve" opens the confirm; confirming calls revoke + closes + refetches', async () => {
    mockSession({ can: () => true })
    mockRoster({ data: { admins: [makeAdmin({ id: 'a1', activeGrants: ['approval:action'] })] } })
    mockRevoke.mutateAsync.mockResolvedValueOnce({ capability: 'approval:action', revokedCount: 1 })
    render(<TeamPage />)

    fireEvent.click(screen.getByTestId('team-revoke-approval-a1'))
    expect(screen.getByTestId('revoke-approval-dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('revoke-approval-submit'))

    await waitFor(() => expect(mockRevoke.mutateAsync).toHaveBeenCalledWith('approval:action'))
    await waitFor(() => expect(screen.queryByTestId('revoke-approval-dialog')).not.toBeInTheDocument())
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('shows the CAPABILITY_NOT_GRANTABLE error copy in the grant dialog', () => {
    mockSession({ can: () => true })
    mockRoster({ data: { admins: [makeAdmin({ id: 'a1', activeGrants: [] })] } })
    mockGrant.error = new ApiError(400, { error: { code: 'CAPABILITY_NOT_GRANTABLE', message: 'No.' } })
    render(<TeamPage />)
    fireEvent.click(screen.getByTestId('team-grant-approval-a1'))
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent('This capability cannot be granted from this screen.')
  })
})

describe('TeamPage — Deactivate dialog wiring', () => {
  it('clicking "Deactivate" (non-self row) opens the confirm; confirming calls deactivate + closes + refetches', async () => {
    mockSession({ can: () => true, adminId: 'me' })
    mockRoster({ data: { admins: [makeAdmin({ id: 'other', email: 'x@y.com' })] } })
    mockDeactivate.mutateAsync.mockResolvedValueOnce({ id: 'other', email: 'x@y.com', role: 'OPERATIONS', isActive: false })
    render(<TeamPage />)

    fireEvent.click(screen.getByTestId('team-deactivate-other'))
    expect(screen.getByTestId('deactivate-admin-dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('deactivate-admin-submit'))

    await waitFor(() => expect(mockDeactivate.mutateAsync).toHaveBeenCalledWith())
    await waitFor(() => expect(screen.queryByTestId('deactivate-admin-dialog')).not.toBeInTheDocument())
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('the disabled self-row Deactivate button cannot be clicked to open the dialog', () => {
    mockSession({ can: () => true, adminId: 'me' })
    mockRoster({ data: { admins: [makeAdmin({ id: 'me' })] } })
    render(<TeamPage />)

    fireEvent.click(screen.getByTestId('team-deactivate-me'))
    expect(screen.queryByTestId('deactivate-admin-dialog')).not.toBeInTheDocument()
  })
})
