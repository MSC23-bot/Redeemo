/**
 * PR-C C3 RTL tests for the Staff & Access list page.
 *
 * Covers: loading; the member + app-user table; the three summary cards + caps;
 * the allowance banner when a cap is full; the >4-people search; lifecycle gating
 * (pre-live owner-only "for now it is just you"; suspended = blocked, no table);
 * owner-only management (non-owner 403 hides Add + row actions).
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import StaffPage from '@/app/(app)/staff/page'
import { ApiError } from '@/lib/api/client'

// --- session + profile mocks ------------------------------------------------
jest.mock('@/lib/auth/session', () => ({ useSession: () => ({ isAuthenticated: true }) }))

interface ProfileData {
  status: string
  onboardingStep: string
  businessName: string
}
let mockProfile: { data?: ProfileData; isLoading: boolean; isError?: boolean; refetch?: () => void }
jest.mock('@/lib/auth/useMerchantProfile', () => ({ useMerchantProfile: () => mockProfile }))

// --- staff api mocks --------------------------------------------------------
const listStaff = jest.fn()
const listBranchAppUsers = jest.fn()
jest.mock('@/lib/api/staff', () => ({
  listStaff: () => listStaff(),
  listBranchAppUsers: () => listBranchAppUsers(),
  inviteStaff: jest.fn(),
  updateStaff: jest.fn(),
  deactivateStaff: jest.fn(),
  reactivateStaff: jest.fn(),
  removeStaff: jest.fn(),
  resendInvite: jest.fn(),
  resetAppUserPassword: jest.fn(),
  deactivateAppUser: jest.fn(),
  reactivateAppUser: jest.fn(),
}))

const listBranches = jest.fn()
jest.mock('@/lib/api/branch', () => ({ listBranches: () => listBranches() }))

const OWNER = {
  id: 'm1',
  name: 'Sam Owner',
  email: 'sam@shop.test',
  role: 'OWNER',
  status: 'ACTIVE',
  canManageVouchers: false,
  allBranches: true,
  branchIds: [],
  claimed: true,
  lastLoginAt: '2026-06-20T10:00:00.000Z',
}
const MANAGER = {
  id: 'm2',
  name: 'Bea Manager',
  email: 'bea@shop.test',
  role: 'BRANCH_MANAGER',
  status: 'ACTIVE',
  canManageVouchers: true,
  allBranches: false,
  branchIds: ['b1'],
  claimed: false,
  lastLoginAt: null,
}
const APP_USERS = {
  branches: [
    {
      branchId: 'b1',
      branchName: 'High Street',
      appUserCount: 1,
      users: [
        {
          id: 'au1',
          branchId: 'b1',
          firstName: 'Jo',
          lastName: 'Till',
          jobTitle: 'Floor',
          email: 'jo@shop.test',
          status: 'ACTIVE',
          lastLoginAt: null,
        },
      ],
    },
  ],
}

const LIVE_PROFILE: ProfileData = { status: 'ACTIVE', onboardingStep: 'LIVE', businessName: 'Roe Cafe' }
const PRELIVE_PROFILE: ProfileData = { status: 'REGISTERED', onboardingStep: 'REGISTERED', businessName: 'Roe Cafe' }
const SUSPENDED_PROFILE: ProfileData = { status: 'SUSPENDED', onboardingStep: 'LIVE', businessName: 'Roe Cafe' }

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <StaffPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  listStaff.mockReset().mockResolvedValue([OWNER])
  listBranchAppUsers.mockReset().mockResolvedValue({ branches: [] })
  listBranches.mockReset().mockResolvedValue([{ id: 'b1', name: 'High Street' }])
  mockProfile = { data: LIVE_PROFILE, isLoading: false }
})

describe('StaffPage (C3 list + cards + lifecycle)', () => {
  it('renders a loading state while the profile is loading', () => {
    mockProfile = { data: undefined, isLoading: true }
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders the member table with role chip, access pills and branch coverage', async () => {
    listStaff.mockResolvedValue([OWNER, MANAGER])
    listBranchAppUsers.mockResolvedValue(APP_USERS)
    renderPage()
    expect(await screen.findByText('Sam Owner')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText('Bea Manager')).toBeInTheDocument()
    expect(within(table).getByText('Owner')).toBeInTheDocument()
    expect(within(table).getByText('Branch manager')).toBeInTheDocument()
    expect(within(table).getByText('+ Vouchers')).toBeInTheDocument()
    // App user surfaces in the same unified table.
    expect(within(table).getByText('Jo Till')).toBeInTheDocument()
    expect(within(table).getByText('App user')).toBeInTheDocument()
    // Branch coverage: scoped manager shows the branch name, owner shows All branches.
    // "High Street" appears both as the manager's scoped-branch coverage and the app
    // user's branch column, so it is expected to occur more than once.
    expect(within(table).getAllByText('High Street').length).toBeGreaterThan(0)
    expect(within(table).getAllByText('All branches').length).toBeGreaterThan(0)
  })

  it('renders the three summary cards with the hardcoded caps', async () => {
    listStaff.mockResolvedValue([OWNER, MANAGER])
    listBranchAppUsers.mockResolvedValue(APP_USERS)
    renderPage()
    await screen.findByText('Sam Owner')
    expect(screen.getByText('People')).toBeInTheDocument()
    expect(screen.getByText('2 of 8')).toBeInTheDocument() // 2 portal members of cap 8
    expect(screen.getByText('1 of 20')).toBeInTheDocument() // 1 app user of cap 20
  })

  it('shows the allowance banner when the portal cap is full', async () => {
    const full = Array.from({ length: 8 }).map((_, i) => ({ ...OWNER, id: `m${i}`, email: `o${i}@x.test` }))
    listStaff.mockResolvedValue(full)
    renderPage()
    await screen.findByText('o0@x.test')
    expect(screen.getByText(/reached your portal user limit/i)).toBeInTheDocument()
    expect(screen.getByText(/contact redeemo to raise/i)).toBeInTheDocument()
  })

  it('shows the people search only when there are more than 4 people', async () => {
    const five = [OWNER, MANAGER, { ...OWNER, id: 'm3', email: 'c@x.test', name: 'C Three' }, { ...OWNER, id: 'm4', email: 'd@x.test', name: 'D Four' }, { ...OWNER, id: 'm5', email: 'e@x.test', name: 'E Five' }]
    listStaff.mockResolvedValue(five)
    renderPage()
    await screen.findByText('Sam Owner')
    expect(screen.getByLabelText(/search people/i)).toBeInTheDocument()
  })

  it('does NOT show the search with 4 or fewer people', async () => {
    listStaff.mockResolvedValue([OWNER, MANAGER])
    renderPage()
    await screen.findByText('Sam Owner')
    expect(screen.queryByLabelText(/search people/i)).toBeNull()
  })

  it('filters people by the search term', async () => {
    const five = [OWNER, MANAGER, { ...OWNER, id: 'm3', email: 'c@x.test', name: 'C Three' }, { ...OWNER, id: 'm4', email: 'd@x.test', name: 'D Four' }, { ...OWNER, id: 'm5', email: 'e@x.test', name: 'E Five' }]
    listStaff.mockResolvedValue(five)
    renderPage()
    await screen.findByText('Sam Owner')
    fireEvent.change(screen.getByLabelText(/search people/i), { target: { value: 'Bea' } })
    await waitFor(() => expect(screen.queryByText('Sam Owner')).toBeNull())
    expect(screen.getByText('Bea Manager')).toBeInTheDocument()
  })

  it('pre-live shows owner-only "for now it is just you" and a disabled Add', async () => {
    mockProfile = { data: PRELIVE_PROFILE, isLoading: false }
    renderPage()
    await screen.findByText('Sam Owner')
    expect(screen.getByText(/for now it is just you/i)).toBeInTheDocument()
    const addBtn = screen.getByRole('button', { name: /add staff member/i })
    expect(addBtn).toBeDisabled()
  })

  it('suspended = BLOCKED: shows the suspended state and no team table', async () => {
    mockProfile = { data: SUSPENDED_PROFILE, isLoading: false }
    renderPage()
    // The heading is an exact match (the body copy also contains the phrase).
    expect(await screen.findByText('Your account is suspended')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
    // Suspended must not even fetch the team.
    expect(listStaff).not.toHaveBeenCalled()
  })

  it('live owner sees an enabled Add staff member button', async () => {
    renderPage()
    await screen.findByText('Sam Owner')
    const addBtn = screen.getByRole('button', { name: /add staff member/i })
    expect(addBtn).toBeEnabled()
  })

  it('a non-owner (403) sees the team but NO Add and NO row actions', async () => {
    listStaff.mockRejectedValue(new ApiError(403, { error: { code: 'INSUFFICIENT_PERMISSIONS' } }))
    listBranchAppUsers.mockResolvedValue(APP_USERS)
    renderPage()
    // The app users still render (their own endpoint succeeds), but no Add button.
    expect(await screen.findByText(/only an owner can invite or change members/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add staff member/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /actions for/i })).toBeNull()
  })

  it('owner rows expose a row-actions menu trigger', async () => {
    listStaff.mockResolvedValue([OWNER, MANAGER])
    renderPage()
    await screen.findByText('Bea Manager')
    expect(screen.getByRole('button', { name: /actions for bea manager/i })).toBeInTheDocument()
  })

  it('the member payload never leaks passwordHash into the DOM', async () => {
    listStaff.mockResolvedValue([OWNER, MANAGER])
    const { container } = renderPage()
    await screen.findByText('Sam Owner')
    expect(container.textContent ?? '').not.toMatch(/passwordHash|\$2[aby]\$/)
  })
})
