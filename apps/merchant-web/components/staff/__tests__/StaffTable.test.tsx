/**
 * PR-C RTL tests for the unified person table.
 *
 * Covers the status pills on the Person cell: an unclaimed portal member reads as
 * "Invite pending", a claimed member shows no pending pill, and a deactivated member
 * keeps the "Deactivated" pill. Also pins the empty-state copy (search-empty default
 * vs the page-supplied neutral label).
 */
import { render, screen, within } from '@testing-library/react'
import { StaffTable } from '@/components/staff/StaffTable'
import type { PortalPerson, AppPerson, Person } from '@/components/staff/types'

const portal = (over: Partial<PortalPerson> = {}): PortalPerson => ({
  kind: 'portal',
  id: 'm1',
  name: 'Bea Manager',
  email: 'bea@shop.test',
  role: 'BRANCH_MANAGER',
  status: 'ACTIVE',
  canManageVouchers: false,
  allBranches: true,
  branchIds: [],
  claimed: true,
  lastLoginAt: null,
  isLastActiveOwner: false,
  raw: {} as never,
  ...over,
})

const app = (over: Partial<AppPerson> = {}): AppPerson => ({
  kind: 'app',
  id: 'au1',
  name: 'Jo Till',
  email: 'jo@shop.test',
  status: 'ACTIVE',
  jobTitle: 'Floor',
  branchId: 'b1',
  branchName: 'High Street',
  appUserCount: 1,
  lastLoginAt: null,
  raw: {} as never,
  ...over,
})

const branchNameById = (id: string) => ({ b1: 'High Street' })[id as 'b1']

function renderTable(people: Person[], emptyLabel?: string) {
  return render(
    <StaffTable people={people} branchNameById={branchNameById} emptyLabel={emptyLabel} />,
  )
}

describe('StaffTable invite-pending pill', () => {
  it('shows an "Invite pending" pill for an unclaimed (claimed=false) active member', () => {
    renderTable([portal({ id: 'm2', name: 'Newbie', email: 'new@shop.test', claimed: false })])
    const table = screen.getByRole('table')
    expect(within(table).getByText('Invite pending')).toBeInTheDocument()
  })

  it('does NOT show the "Invite pending" pill for a claimed member', () => {
    renderTable([portal({ id: 'm3', name: 'Claimed', email: 'claimed@shop.test', claimed: true })])
    const table = screen.getByRole('table')
    expect(within(table).queryByText('Invite pending')).toBeNull()
  })

  it('shows the "Deactivated" pill (not "Invite pending") for an unclaimed deactivated member', () => {
    renderTable([portal({ id: 'm4', name: 'Gone', email: 'gone@shop.test', claimed: false, status: 'INACTIVE' })])
    const table = screen.getByRole('table')
    expect(within(table).getByText('Deactivated')).toBeInTheDocument()
    expect(within(table).queryByText('Invite pending')).toBeNull()
  })

  it('never shows an "Invite pending" pill for an app user (no claim concept)', () => {
    renderTable([app()])
    const table = screen.getByRole('table')
    expect(within(table).queryByText('Invite pending')).toBeNull()
  })
})

describe('StaffTable job titles (fidelity fix)', () => {
  it('renders the real job title for an app row instead of a generic "App user" chip', () => {
    renderTable([app({ jobTitle: 'Front of House' })])
    const table = screen.getByRole('table')
    expect(within(table).getByText('Front of House')).toBeInTheDocument()
    expect(within(table).queryByText('App user')).toBeNull()
  })

  it('falls back to plain text (no em-dash) when an app row has no job title set', () => {
    renderTable([app({ jobTitle: null })])
    const table = screen.getByRole('table')
    expect(within(table).getByText('Not set')).toBeInTheDocument()
    expect(within(table).queryByText('App user')).toBeNull()
  })

  it('threads a portal member job title under their role chip', () => {
    renderTable([portal({ role: 'BRANCH_MANAGER', jobTitle: 'General Manager' })])
    const table = screen.getByRole('table')
    expect(within(table).getByText('Branch manager')).toBeInTheDocument()
    expect(within(table).getByText('General Manager')).toBeInTheDocument()
  })

  it('renders no job-title line for a portal member with no job title set (prototype-matched)', () => {
    renderTable([portal({ role: 'BRANCH_MANAGER', jobTitle: null })])
    const table = screen.getByRole('table')
    expect(within(table).getByText('Branch manager')).toBeInTheDocument()
    expect(within(table).queryByText('Not set')).toBeNull()
  })

  it('gives the Owner role chip a distinct pale-rose tone vs the Branch manager/Staff tone', () => {
    // jsdom does not reliably surface CSS custom-property shorthand values via
    // getAttribute('style'), so this asserts the tone marker (data-tone) the chip
    // renders alongside the token-based style, following the Badge component's
    // established data-variant convention.
    renderTable([portal({ id: 'owner-row', role: 'OWNER', name: 'Owner Person' })])
    const table = screen.getByRole('table')
    const ownerChip = within(table).getByText('Owner')
    expect(ownerChip).toHaveAttribute('data-tone', 'owner')

    renderTable([portal({ id: 'bm-row', role: 'BRANCH_MANAGER', name: 'Manager Person' })])
    const bmChip = screen.getByText('Branch manager')
    expect(bmChip).toHaveAttribute('data-tone', 'default')
  })
})

describe('StaffTable empty state', () => {
  it('defaults to the search-empty copy', () => {
    renderTable([])
    expect(screen.getByText('No one matches your search.')).toBeInTheDocument()
  })

  it('uses a page-supplied neutral label when given', () => {
    renderTable([], 'Your team will appear here.')
    expect(screen.getByText('Your team will appear here.')).toBeInTheDocument()
    expect(screen.queryByText('No one matches your search.')).toBeNull()
  })
})
