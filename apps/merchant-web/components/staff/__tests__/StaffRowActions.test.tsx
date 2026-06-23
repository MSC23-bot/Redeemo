/**
 * PR-C C5 RTL tests for the per-row kebab actions menu.
 *
 * Member actions: Edit access; Resend invite (not-yet-claimed only); Deactivate /
 * Remove (active, not last owner); Reactivate (deactivated only); last-owner lock
 * footnote (the only active owner has no deactivate/remove). App-user actions:
 * Reset app password / Deactivate / Reactivate, each disabled when the branch's
 * appUserCount > 1 (the §5.3 UI guard).
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { StaffRowActions, type StaffRowActionHandlers } from '@/components/staff/StaffRowActions'
import type { PortalPerson, AppPerson } from '@/components/staff/types'

function handlers(): StaffRowActionHandlers {
  return {
    onEditAccess: jest.fn(),
    onDeactivateMember: jest.fn(),
    onReactivateMember: jest.fn(),
    onRemoveMember: jest.fn(),
    onResendInvite: jest.fn(),
    onResetAppPassword: jest.fn(),
    onDeactivateAppUser: jest.fn(),
    onReactivateAppUser: jest.fn(),
  }
}

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

function open(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }))
}

describe('StaffRowActions member menu (C5)', () => {
  it('shows Edit access + Deactivate + Remove for an active, non-last-owner member', () => {
    const h = handlers()
    render(<StaffRowActions person={portal()} handlers={h} />)
    open(/actions for bea manager/i)
    fireEvent.click(screen.getByRole('menuitem', { name: /edit access/i }))
    expect(h.onEditAccess).toHaveBeenCalledTimes(1)
  })

  it('shows Resend invite ONLY for a not-yet-claimed member', () => {
    const h = handlers()
    const { rerender } = render(<StaffRowActions person={portal({ claimed: false })} handlers={h} />)
    open(/actions for bea manager/i)
    expect(screen.getByRole('menuitem', { name: /resend invite/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /resend invite/i }))
    expect(h.onResendInvite).toHaveBeenCalledTimes(1)

    rerender(<StaffRowActions person={portal({ claimed: true })} handlers={h} />)
    open(/actions for bea manager/i)
    expect(screen.queryByRole('menuitem', { name: /resend invite/i })).toBeNull()
  })

  it('shows Reactivate (not Deactivate) for a deactivated member', () => {
    const h = handlers()
    render(<StaffRowActions person={portal({ status: 'INACTIVE' })} handlers={h} />)
    open(/actions for bea manager/i)
    expect(screen.getByRole('menuitem', { name: /reactivate/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /^deactivate$/i })).toBeNull()
  })

  it('the last active owner shows the lock footnote and no deactivate/remove', () => {
    const h = handlers()
    render(<StaffRowActions person={portal({ role: 'OWNER', isLastActiveOwner: true })} handlers={h} />)
    open(/actions for bea manager/i)
    expect(screen.getByTestId('last-owner-lock')).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /deactivate/i })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /remove from team/i })).toBeNull()
    // Edit access stays available even for the last owner.
    expect(screen.getByRole('menuitem', { name: /edit access/i })).toBeInTheDocument()
  })

  it('Remove from team calls the handler for a non-last-owner', () => {
    const h = handlers()
    render(<StaffRowActions person={portal()} handlers={h} />)
    open(/actions for bea manager/i)
    fireEvent.click(screen.getByRole('menuitem', { name: /remove from team/i }))
    expect(h.onRemoveMember).toHaveBeenCalledTimes(1)
  })
})

describe('StaffRowActions app-user menu (§5.3 disable-on->1)', () => {
  it('enables Reset app password / Deactivate when the branch has exactly 1 app user', () => {
    const h = handlers()
    render(<StaffRowActions person={app({ appUserCount: 1 })} handlers={h} />)
    open(/actions for jo till/i)
    const reset = screen.getByRole('menuitem', { name: /reset app password/i })
    expect(reset).toBeEnabled()
    fireEvent.click(reset)
    expect(h.onResetAppPassword).toHaveBeenCalledTimes(1)
  })

  it('disables the app-user actions when the branch has more than 1 app user', () => {
    const h = handlers()
    render(<StaffRowActions person={app({ appUserCount: 2 })} handlers={h} />)
    open(/actions for jo till/i)
    expect(screen.getByRole('menuitem', { name: /reset app password/i })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: /deactivate/i })).toBeDisabled()
    expect(screen.getByTestId('multi-app-user-note')).toBeInTheDocument()
    // Clicking the disabled action fires nothing.
    fireEvent.click(screen.getByRole('menuitem', { name: /reset app password/i }))
    expect(h.onResetAppPassword).not.toHaveBeenCalled()
  })

  it('shows Reactivate (not Deactivate) for a deactivated app user', () => {
    const h = handlers()
    render(<StaffRowActions person={app({ status: 'INACTIVE' })} handlers={h} />)
    open(/actions for jo till/i)
    expect(screen.getByRole('menuitem', { name: /reactivate/i })).toBeInTheDocument()
  })
})
