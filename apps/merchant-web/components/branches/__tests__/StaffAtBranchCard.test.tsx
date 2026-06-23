import { render, screen, within } from '@testing-library/react'
import { StaffAtBranchCard } from '@/components/branches/StaffAtBranchCard'

// Branches PR-1 F12: the owner-only "Staff at this branch" card. It merges the two
// owner-gated staff feeds (portal members + app users), filters them to THIS branch,
// renders a colour-coded role chip + an access pill per person, and a cross-link to
// the Staff & Access surface. The whole panel is hidden for a non-owner (the staff
// queries 403). Secrets (passwordHash / PIN / phone) are never in the DOM.

// --- staff hooks ------------------------------------------------------------
let membersResult: { data?: unknown; isLoading?: boolean; isError?: boolean } = {}
let appUsersResult: { data?: unknown; isLoading?: boolean; isError?: boolean } = {}
jest.mock('@/lib/staff/useStaff', () => ({
  useStaff: () => membersResult,
  useBranchAppUsers: () => appUsersResult,
}))

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

function member(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    name: 'James Whitfield',
    email: 'james@kitchen.co.uk',
    role: 'OWNER',
    status: 'ACTIVE',
    canManageVouchers: false,
    allBranches: true,
    branchIds: [],
    claimed: true,
    lastLoginAt: '2026-06-20T10:00:00.000Z',
    ...over,
  }
}

function appBranchGroup(over: Record<string, unknown> = {}) {
  return {
    branchId: 'b1',
    branchName: 'High Street',
    appUserCount: 1,
    users: [
      {
        id: 'u1',
        branchId: 'b1',
        firstName: 'Olivia',
        lastName: 'Reed',
        jobTitle: 'Branch staff',
        email: 'olivia@kitchen.co.uk',
        status: 'ACTIVE',
        lastLoginAt: null,
      },
    ],
    ...over,
  }
}

function renderCard(props: { isOwner?: boolean; ready?: boolean; branchId?: string } = {}) {
  return render(
    <StaffAtBranchCard
      branchId={props.branchId ?? 'b1'}
      isOwner={props.isOwner ?? true}
      ready={props.ready ?? true}
    />,
  )
}

beforeEach(() => {
  push.mockReset()
  membersResult = { data: [] }
  appUsersResult = { data: { branches: [] } }
})

describe('StaffAtBranchCard owner gating', () => {
  it('renders nothing for a non-owner', () => {
    membersResult = { data: [member()] }
    appUsersResult = { data: { branches: [appBranchGroup()] } }
    const { container } = renderCard({ isOwner: false })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing while not ready (no premature staff flash)', () => {
    const { container } = renderCard({ isOwner: false, ready: false })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the panel for an owner', () => {
    membersResult = { data: [member()] }
    renderCard({ isOwner: true })
    expect(screen.getByText(/staff at this branch/i)).toBeInTheDocument()
  })
})

describe('StaffAtBranchCard merge + filter', () => {
  it('shows a portal member assigned to this branch by branchIds', () => {
    membersResult = {
      data: [member({ id: 'm2', name: 'Sam Thorne', role: 'BRANCH_MANAGER', allBranches: false, branchIds: ['b1'] })],
    }
    renderCard({ branchId: 'b1' })
    expect(screen.getByText('Sam Thorne')).toBeInTheDocument()
  })

  it('does NOT show a portal member assigned to a different branch', () => {
    membersResult = {
      data: [member({ id: 'm3', name: 'Other Branch Manager', role: 'BRANCH_MANAGER', allBranches: false, branchIds: ['b9'] })],
    }
    renderCard({ branchId: 'b1' })
    expect(screen.queryByText('Other Branch Manager')).not.toBeInTheDocument()
  })

  it('shows an allBranches member at every branch', () => {
    membersResult = { data: [member({ id: 'm1', name: 'All Branches Owner', allBranches: true, branchIds: [] })] }
    renderCard({ branchId: 'b7' })
    expect(screen.getByText('All Branches Owner')).toBeInTheDocument()
  })

  it('shows an app user filtered to this branch', () => {
    appUsersResult = { data: { branches: [appBranchGroup({ branchId: 'b1' })] } }
    renderCard({ branchId: 'b1' })
    expect(screen.getByText('Olivia Reed')).toBeInTheDocument()
  })

  it('does NOT show an app user from a different branch group', () => {
    appUsersResult = {
      data: {
        branches: [appBranchGroup({ branchId: 'b9', branchName: 'Mill Road', users: [{ id: 'u9', branchId: 'b9', firstName: 'Far', lastName: 'Away', jobTitle: null, email: 'far@x.co', status: 'ACTIVE', lastLoginAt: null }] })],
      },
    }
    renderCard({ branchId: 'b1' })
    expect(screen.queryByText('Far Away')).not.toBeInTheDocument()
  })
})

describe('StaffAtBranchCard pills (exact approved labels)', () => {
  it('renders the literal "Portal + app" access pill for a portal member', () => {
    membersResult = { data: [member({ id: 'm2', name: 'Sam Thorne', role: 'BRANCH_MANAGER', allBranches: true, branchIds: [] })] }
    renderCard({ branchId: 'b1' })
    const row = screen.getByText('Sam Thorne').closest('[data-testid="staff-at-branch-row"]')!
    expect(within(row as HTMLElement).getByText('Portal + app')).toBeInTheDocument()
  })

  it('renders the literal "App access" access pill for an app-only user', () => {
    appUsersResult = { data: { branches: [appBranchGroup({ branchId: 'b1' })] } }
    renderCard({ branchId: 'b1' })
    const row = screen.getByText('Olivia Reed').closest('[data-testid="staff-at-branch-row"]')!
    expect(within(row as HTMLElement).getByText('App access')).toBeInTheDocument()
  })

  it('renders the role label for a portal member', () => {
    membersResult = { data: [member({ id: 'm2', name: 'Sam Thorne', role: 'BRANCH_MANAGER', allBranches: true })] }
    renderCard({ branchId: 'b1' })
    const row = screen.getByText('Sam Thorne').closest('[data-testid="staff-at-branch-row"]')!
    expect(within(row as HTMLElement).getByText('Branch manager')).toBeInTheDocument()
  })

  it('shows "Invite pending" for a portal member who has not claimed', () => {
    membersResult = { data: [member({ id: 'm4', name: 'Pending Person', allBranches: true, claimed: false })] }
    renderCard({ branchId: 'b1' })
    const row = screen.getByText('Pending Person').closest('[data-testid="staff-at-branch-row"]')!
    expect(within(row as HTMLElement).getByText(/invite pending/i)).toBeInTheDocument()
  })
})

describe('StaffAtBranchCard secrets + cross-link', () => {
  it('never renders passwordHash / PIN / phone even if present on the payload', () => {
    membersResult = {
      data: [member({ allBranches: true, passwordHash: 'HASH-SECRET', phone: '+447700900000', redemptionPin: '4821' })],
    }
    appUsersResult = {
      data: {
        branches: [
          appBranchGroup({
            branchId: 'b1',
            users: [{ id: 'u1', branchId: 'b1', firstName: 'Olivia', lastName: 'Reed', jobTitle: 'Branch staff', email: 'olivia@kitchen.co.uk', status: 'ACTIVE', lastLoginAt: null, passwordHash: 'APP-HASH', phone: '+447711111111' }],
          }),
        ],
      },
    }
    const { container } = renderCard({ branchId: 'b1' })
    const text = container.textContent ?? ''
    expect(text).not.toContain('HASH-SECRET')
    expect(text).not.toContain('APP-HASH')
    expect(text).not.toContain('+447700900000')
    expect(text).not.toContain('+447711111111')
    expect(text).not.toContain('4821')
  })

  it('renders an "Assign or manage staff" cross-link to the Staff surface', () => {
    membersResult = { data: [member({ allBranches: true })] }
    renderCard({ branchId: 'b1' })
    const link = screen.getByRole('button', { name: /assign or manage staff/i })
    link.click()
    expect(push).toHaveBeenCalledWith('/staff')
  })

  it('renders a calm empty state when no one is assigned', () => {
    membersResult = { data: [] }
    appUsersResult = { data: { branches: [] } }
    renderCard({ branchId: 'b1' })
    expect(screen.getByText(/no one is assigned to this branch yet/i)).toBeInTheDocument()
  })
})
