import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RedemptionAlertsCard } from '@/components/branches/sections/RedemptionAlertsCard'
import type { Branch } from '@/lib/api/branch'
import type { MemberRow } from '@/lib/api/staff'

// Branches PR-7 (§6 / §8): the Redemption alerts card. The PR-1 disabled locked
// affordance is now a LIVE single per-branch on/off switch reading / writing
// branch.redemptionAlertsEnabled. Copy says the team is alerted in the portal (the
// notification bell) when a voucher is validated in store; email is dark / coming
// later. The privacy line names the voucher / branch / validation time and never the
// redemption code. Per-recipient toggles + an "Add an extra recipient" email field are
// DEFERRED (must be ABSENT). An optional read-only recipient list (owner + scope-covering
// BMs) renders from the existing owner-gated useStaff query.

// --- the PR-7 mutation hook -------------------------------------------------
const mutateAsync = jest.fn()
let isPending = false
const useSetRedemptionAlerts = jest.fn((_branchId: string) => ({ mutateAsync, isPending }))
jest.mock('@/lib/branches/useBranches', () => ({
  useSetRedemptionAlerts: (branchId: string) => useSetRedemptionAlerts(branchId),
}))

// --- the owner-gated staff query (recipient list) ---------------------------
let staffData: MemberRow[] | undefined
let staffLoading = false
jest.mock('@/lib/staff/useStaff', () => ({
  useStaff: (enabled: boolean) => {
    useStaffEnabledArg = enabled
    return { data: staffData, isLoading: staffLoading }
  },
}))
let useStaffEnabledArg: boolean | undefined

// --- toast ------------------------------------------------------------------
const toast = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast }) }))

function branch(over: Partial<Branch> = {}): Branch {
  return {
    id: 'b1',
    name: 'High Street',
    isActive: true,
    redemptionAlertsEnabled: false,
    ...over,
  } as Branch
}

function member(over: Partial<MemberRow> = {}): MemberRow {
  return {
    id: 'm1',
    name: 'Asha Owner',
    email: 'asha@example.co.uk',
    role: 'OWNER',
    status: 'ACTIVE',
    canManageVouchers: true,
    allBranches: true,
    branchIds: [],
    claimed: true,
    lastLoginAt: null,
    ...over,
  } as MemberRow
}

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue({})
  useSetRedemptionAlerts.mockClear()
  toast.mockReset()
  isPending = false
  staffData = undefined
  staffLoading = false
  useStaffEnabledArg = undefined
})

describe('RedemptionAlertsCard heading + visibility', () => {
  it('renders the card with its heading (always visible)', () => {
    render(<RedemptionAlertsCard branch={branch()} isOwner />)
    expect(screen.getByText(/redemption alerts/i)).toBeInTheDocument()
  })
})

describe('RedemptionAlertsCard live toggle (owner)', () => {
  it('renders a switch reflecting redemptionAlertsEnabled: off', () => {
    render(<RedemptionAlertsCard branch={branch({ redemptionAlertsEnabled: false })} isOwner />)
    const sw = screen.getByRole('switch', { name: /redemption alerts for this branch/i })
    expect(sw).toHaveAttribute('aria-checked', 'false')
  })

  it('renders a switch reflecting redemptionAlertsEnabled: on', () => {
    render(<RedemptionAlertsCard branch={branch({ redemptionAlertsEnabled: true })} isOwner />)
    const sw = screen.getByRole('switch', { name: /redemption alerts for this branch/i })
    expect(sw).toHaveAttribute('aria-checked', 'true')
  })

  it('binds the mutation to this branch id', () => {
    render(<RedemptionAlertsCard branch={branch({ id: 'branch-42' })} isOwner />)
    expect(useSetRedemptionAlerts).toHaveBeenCalledWith('branch-42')
  })

  it('turning the toggle ON calls the mutation with enabled=true', async () => {
    render(<RedemptionAlertsCard branch={branch({ redemptionAlertsEnabled: false })} isOwner />)
    fireEvent.click(screen.getByRole('switch', { name: /redemption alerts for this branch/i }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(true))
  })

  it('turning the toggle OFF calls the mutation with enabled=false', async () => {
    render(<RedemptionAlertsCard branch={branch({ redemptionAlertsEnabled: true })} isOwner />)
    fireEvent.click(screen.getByRole('switch', { name: /redemption alerts for this branch/i }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(false))
  })

  it('shows a calm error and leaves the value persisted when the write fails', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('boom'))
    render(<RedemptionAlertsCard branch={branch({ redemptionAlertsEnabled: false })} isOwner />)
    fireEvent.click(screen.getByRole('switch', { name: /redemption alerts for this branch/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/could not update redemption alerts/i),
    )
    // reverts to the persisted value (off)
    expect(
      screen.getByRole('switch', { name: /redemption alerts for this branch/i }),
    ).toHaveAttribute('aria-checked', 'false')
  })
})

describe('RedemptionAlertsCard gating (non-owner)', () => {
  it('does NOT render the switch for a non-owner', () => {
    render(<RedemptionAlertsCard branch={branch({ redemptionAlertsEnabled: true })} isOwner={false} />)
    expect(
      screen.queryByRole('switch', { name: /redemption alerts for this branch/i }),
    ).not.toBeInTheDocument()
  })

  it('does NOT fetch the owner-only staff query for a non-owner', () => {
    render(<RedemptionAlertsCard branch={branch()} isOwner={false} />)
    expect(useStaffEnabledArg).toBe(false)
  })
})

describe('RedemptionAlertsCard copy (in-app now, email later)', () => {
  it('says the team is alerted in the portal / notification bell', () => {
    render(<RedemptionAlertsCard branch={branch()} isOwner />)
    expect(screen.getByText(/alerted in the portal/i)).toBeInTheDocument()
    expect(screen.getByText(/notification bell/i)).toBeInTheDocument()
  })

  it('says email alerts are coming later (does NOT promise an email now)', () => {
    render(<RedemptionAlertsCard branch={branch()} isOwner />)
    expect(screen.getByText(/email alerts are coming later/i)).toBeInTheDocument()
    // no "gets an email" / "everyone below gets an email" promise
    expect(screen.queryByText(/gets an email/i)).not.toBeInTheDocument()
  })

  it('privacy line names voucher / branch / validation time and never the redemption code', () => {
    render(<RedemptionAlertsCard branch={branch()} isOwner />)
    expect(screen.getByText(/shows the voucher, the branch, and the validation time/i)).toBeInTheDocument()
    expect(screen.getByText(/never shows the customer personal details/i)).toBeInTheDocument()
    expect(screen.queryByText(/redemption code/i)).not.toBeInTheDocument()
  })
})

describe('RedemptionAlertsCard deferred controls are ABSENT', () => {
  it('renders no "Add an extra recipient" email field', () => {
    render(<RedemptionAlertsCard branch={branch({ redemptionAlertsEnabled: true })} isOwner />)
    expect(screen.queryByText(/add an extra recipient/i)).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/@/)).not.toBeInTheDocument()
  })

  it('renders no per-recipient on/off toggles (only the single per-branch switch)', () => {
    staffData = [member(), member({ id: 'm2', name: 'Ben Manager', role: 'BRANCH_MANAGER' })]
    render(<RedemptionAlertsCard branch={branch({ redemptionAlertsEnabled: true })} isOwner />)
    // exactly one switch on the card: the per-branch toggle
    expect(screen.getAllByRole('switch')).toHaveLength(1)
  })
})

describe('RedemptionAlertsCard read-only recipient list', () => {
  it('lists active owners + scope-covering branch managers (and excludes STAFF / unscoped BM)', () => {
    staffData = [
      member({ id: 'm1', name: 'Asha Owner', role: 'OWNER', allBranches: true }),
      member({ id: 'm2', name: 'Ben Manager', role: 'BRANCH_MANAGER', allBranches: false, branchIds: ['b1'] }),
      member({ id: 'm3', name: 'Cara Faraway', role: 'BRANCH_MANAGER', allBranches: false, branchIds: ['other'] }),
      member({ id: 'm4', name: 'Dev Staff', role: 'STAFF', allBranches: true }),
      member({ id: 'm5', name: 'Inactive Owner', role: 'OWNER', allBranches: true, status: 'INACTIVE' }),
    ]
    render(<RedemptionAlertsCard branch={branch({ id: 'b1', redemptionAlertsEnabled: true })} isOwner />)
    const rows = screen.getAllByTestId('branch-alerts-recipient-row')
    expect(rows).toHaveLength(2)
    expect(screen.getByText('Asha Owner')).toBeInTheDocument()
    expect(screen.getByText('Ben Manager')).toBeInTheDocument()
    expect(screen.queryByText('Cara Faraway')).not.toBeInTheDocument()
    expect(screen.queryByText('Dev Staff')).not.toBeInTheDocument()
    expect(screen.queryByText('Inactive Owner')).not.toBeInTheDocument()
  })

  it('hides the recipient list when the toggle is off', () => {
    staffData = [member()]
    render(<RedemptionAlertsCard branch={branch({ redemptionAlertsEnabled: false })} isOwner />)
    expect(screen.queryByTestId('branch-alerts-recipients')).not.toBeInTheDocument()
  })
})
