/**
 * PR-C C4 RTL tests for the Add / Edit drawer.
 *
 * Pins the D7 reconciliation: the drawer provisions a PORTAL member only (submit
 * fires onSubmit with the portal invite/update payload, never a BranchUser create);
 * App access is display-only/disabled and non-interactive; Portal role radios carry
 * Can/Cannot copy; Manage vouchers is the canManageVouchers grant (Branch-manager
 * only); Manage campaigns + billing are disabled coming-soon; Branches All/Specific;
 * Automated emails are read-only informational; the title swaps Add / Edit {name}.
 */
import { render, screen, fireEvent, within } from '@testing-library/react'
import { StaffAddEditDrawer } from '@/components/staff/StaffAddEditDrawer'
import type { PortalPerson } from '@/components/staff/types'

const BRANCHES = [
  { id: 'b1', name: 'High Street' },
  { id: 'b2', name: 'Riverside' },
]

const EDIT_MANAGER: PortalPerson = {
  kind: 'portal',
  id: 'm2',
  name: 'Bea Manager',
  email: 'bea@shop.test',
  role: 'BRANCH_MANAGER',
  status: 'ACTIVE',
  canManageVouchers: true,
  allBranches: false,
  branchIds: ['b1'],
  claimed: true,
  lastLoginAt: null,
  isLastActiveOwner: false,
  raw: {} as never,
}

function renderDrawer(props: Partial<React.ComponentProps<typeof StaffAddEditDrawer>> = {}) {
  const onSubmit = jest.fn()
  const onClose = jest.fn()
  render(
    <StaffAddEditDrawer
      editing={null}
      branches={BRANCHES}
      busy={false}
      errorMessage={null}
      onClose={onClose}
      onSubmit={onSubmit}
      {...props}
    />,
  )
  return { onSubmit, onClose }
}

describe('StaffAddEditDrawer (C4)', () => {
  it('renders the Add title + identity fields', () => {
    renderDrawer()
    expect(screen.getByRole('heading', { name: 'Add staff member' })).toBeInTheDocument()
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/job title/i)).toBeInTheDocument()
  })

  it('swaps to "Edit {name}" when editing', () => {
    renderDrawer({ editing: EDIT_MANAGER })
    expect(screen.getByRole('heading', { name: 'Edit Bea Manager' })).toBeInTheDocument()
  })

  it('App access is DISPLAY-ONLY: the switch is disabled and fires no mutation', () => {
    const { onSubmit } = renderDrawer()
    const appAccess = screen.getByTestId('app-access-display')
    expect(within(appAccess).getByText(/app access is managed on the App users view/i)).toBeInTheDocument()
    const appSwitch = within(appAccess).getByRole('switch')
    expect(appSwitch).toBeDisabled()
    fireEvent.click(appSwitch)
    // Clicking the disabled app-access control never submits anything.
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('renders Portal role radios with Can/Cannot detail', () => {
    renderDrawer()
    const group = screen.getByRole('radiogroup', { name: /portal role/i })
    expect(within(group).getByLabelText('Owner')).toBeInTheDocument()
    expect(within(group).getByLabelText('Branch manager')).toBeInTheDocument()
    expect(within(group).getByLabelText('Staff')).toBeInTheDocument()
    expect(screen.getByText('Can')).toBeInTheDocument()
    expect(screen.getByText('Cannot')).toBeInTheDocument()
  })

  it('Manage vouchers is enabled only for Branch manager; campaigns/billing are disabled coming-soon', () => {
    renderDrawer()
    // Default role is Staff -> Manage vouchers disabled.
    expect(screen.getByRole('switch', { name: 'Manage vouchers' })).toBeDisabled()
    // Switch to Branch manager -> Manage vouchers becomes enabled.
    fireEvent.click(screen.getByLabelText('Branch manager'))
    expect(screen.getByRole('switch', { name: 'Manage vouchers' })).toBeEnabled()
    // Campaigns + billing are always disabled coming-soon.
    expect(screen.getByRole('switch', { name: /manage campaigns/i })).toBeDisabled()
    expect(screen.getByRole('switch', { name: /manage billing/i })).toBeDisabled()
    expect(screen.getAllByText(/coming soon/i).length).toBeGreaterThan(0)
  })

  it('Automated emails section is read-only informational (no editable toggle)', () => {
    renderDrawer()
    const info = screen.getByTestId('automated-emails-info')
    // No editable toggle (D9): the section is informational only.
    expect(within(info).queryByRole('switch')).toBeNull()
    // Default role Staff -> the "no automated emails" default copy.
    expect(within(info).getByText(/staff do not receive automated emails/i)).toBeInTheDocument()
    // Owner/manager roles surface the redemption-alert + monthly-report default.
    fireEvent.click(screen.getByLabelText('Branch manager'))
    expect(within(info).getByText(/redemption alerts and a monthly report/i)).toBeInTheDocument()
  })

  it('shows the Specific-branches selector and submits the portal invite payload', () => {
    const { onSubmit } = renderDrawer()
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'New' } })
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Person' } })
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'new@shop.test' } })
    fireEvent.click(screen.getByLabelText('Branch manager'))
    // Choose Specific branches (segmented control) and tick one.
    fireEvent.click(screen.getByRole('radio', { name: 'Specific branches' }))
    fireEvent.click(screen.getByLabelText('High Street'))
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    const payload = onSubmit.mock.calls[0][0]
    expect(payload.invite).toMatchObject({
      email: 'new@shop.test',
      firstName: 'New',
      lastName: 'Person',
      role: 'BRANCH_MANAGER',
      allBranches: false,
      branchIds: ['b1'],
    })
  })

  it('grants canManageVouchers only when the Manage vouchers switch is on for a Branch manager', () => {
    const { onSubmit } = renderDrawer()
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'New' } })
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Person' } })
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'new@shop.test' } })
    fireEvent.click(screen.getByLabelText('Branch manager'))
    fireEvent.click(screen.getByRole('switch', { name: 'Manage vouchers' }))
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }))
    expect(onSubmit.mock.calls[0][0].invite.canManageVouchers).toBe(true)
  })

  it('never grants canManageVouchers for a Staff role', () => {
    const { onSubmit } = renderDrawer()
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'New' } })
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Person' } })
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'new@shop.test' } })
    // Role stays Staff (default).
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }))
    expect(onSubmit.mock.calls[0][0].invite.canManageVouchers).toBe(false)
  })

  it('validates required name + email before submitting on Add', () => {
    const { onSubmit } = renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/full name/i)
  })

  it('the segmented Branches control toggles the same allBranches state both ways (visual change only)', () => {
    const { onSubmit } = renderDrawer()
    const allBtn = screen.getByRole('radio', { name: 'All branches' })
    const specificBtn = screen.getByRole('radio', { name: 'Specific branches' })
    expect(allBtn).toHaveAttribute('aria-checked', 'true')
    expect(specificBtn).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(specificBtn)
    expect(specificBtn).toHaveAttribute('aria-checked', 'true')
    expect(allBtn).toHaveAttribute('aria-checked', 'false')

    // Toggling back to All branches works too (same underlying state both ways).
    fireEvent.click(allBtn)
    expect(allBtn).toHaveAttribute('aria-checked', 'true')
    expect(specificBtn).toHaveAttribute('aria-checked', 'false')

    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'New' } })
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Person' } })
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'new@shop.test' } })
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }))
    expect(onSubmit.mock.calls[0][0].invite.allBranches).toBe(true)
  })

  it('shows the prototype-matched placeholders on the identity fields', () => {
    renderDrawer()
    expect(screen.getByLabelText(/first name/i)).toHaveAttribute('placeholder', 'e.g. Sam')
    expect(screen.getByLabelText(/last name/i)).toHaveAttribute('placeholder', 'e.g. Thorne')
    expect(screen.getByLabelText(/^email$/i)).toHaveAttribute('placeholder', 'name@oldfoundrykitchen.co.uk')
    expect(screen.getByLabelText(/job title/i)).toHaveAttribute('placeholder', 'e.g. Barista, Branch Manager')
  })

  it('uses the prototype sub-header copy (fidelity fix)', () => {
    renderDrawer()
    expect(screen.getByText(/manage the business on the web/i)).toBeInTheDocument()
    expect(screen.getByText(/validate redemptions at their branches/i)).toBeInTheDocument()
  })

  it('an edit prefills role/scope and submits the update payload', () => {
    const { onSubmit } = renderDrawer({ editing: EDIT_MANAGER })
    // Name + email are disabled on edit.
    expect(screen.getByLabelText(/first name/i)).toBeDisabled()
    expect(screen.getByLabelText(/^email$/i)).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].update).toMatchObject({
      role: 'BRANCH_MANAGER',
      allBranches: false,
      branchIds: ['b1'],
      canManageVouchers: true,
    })
  })
})
