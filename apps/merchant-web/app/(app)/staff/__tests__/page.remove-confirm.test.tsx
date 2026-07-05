/**
 * PR-C C3 page-level integration coverage for the "Remove from team" confirm flow.
 *
 * This is a SIBLING file to page.test.tsx (not an extension of it): page.test.tsx
 * already carries 268 lines covering list/cards/lifecycle/owner-gating, and none of
 * it exercises the confirm dialog. Keeping the remove-confirm flow in its own file
 * keeps each file's job legible (list+cards+lifecycle vs one action's full
 * confirm/success/error/pending contract) while reusing the exact same mock/render
 * harness so both files stay consistent with each other.
 *
 * Covers: opening the dialog from the row menu; confirming calls removeStaff with
 * the right memberId and closes on success; backend failure maps to visible copy,
 * closes the dialog, and keeps the row; a distinct error code maps to distinct
 * copy; cancelling never calls removeStaff; the pending "Working..." state disables
 * both buttons and de-dupes a double-click into a single mutation call; and the
 * shared runConfirm mechanism also drives deactivate-member (distinct title/CTA).
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
const removeStaff = jest.fn()
const deactivateStaff = jest.fn()
jest.mock('@/lib/api/staff', () => ({
  listStaff: () => listStaff(),
  listBranchAppUsers: () => listBranchAppUsers(),
  inviteStaff: jest.fn(),
  updateStaff: jest.fn(),
  deactivateStaff: (memberId: string) => deactivateStaff(memberId),
  reactivateStaff: jest.fn(),
  removeStaff: (memberId: string) => removeStaff(memberId),
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

const LIVE_PROFILE: ProfileData = { status: 'ACTIVE', onboardingStep: 'LIVE', businessName: 'Roe Cafe' }

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <StaffPage />
    </QueryClientProvider>,
  )
}

function openRowMenu(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }))
}

async function openRemoveConfirmFor(memberLabel: RegExp) {
  openRowMenu(memberLabel)
  fireEvent.click(await screen.findByRole('menuitem', { name: /remove from team/i }))
}

beforeEach(() => {
  listStaff.mockReset().mockResolvedValue([OWNER, MANAGER])
  listBranchAppUsers.mockReset().mockResolvedValue({ branches: [] })
  listBranches.mockReset().mockResolvedValue([{ id: 'b1', name: 'High Street' }])
  removeStaff.mockReset()
  deactivateStaff.mockReset()
  mockProfile = { data: LIVE_PROFILE, isLoading: false }
})

describe('StaffPage remove-member confirm flow', () => {
  it('opening remove from the row menu shows the dialog with the member name, body copy and both buttons', async () => {
    renderPage()
    await screen.findByText('Bea Manager')
    await openRemoveConfirmFor(/actions for bea manager/i)

    const dialog = screen.getByTestId('staff-confirm')
    expect(within(dialog).getByText('Remove Bea Manager from the team?')).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        /they will lose portal access and drop off your team list\. you can invite them again later\./i,
      ),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('confirming removes the member: removeStaff is called once with the right id, and the dialog closes', async () => {
    removeStaff.mockResolvedValue({ id: 'm2' })
    renderPage()
    await screen.findByText('Bea Manager')
    await openRemoveConfirmFor(/actions for bea manager/i)

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(screen.queryByTestId('staff-confirm')).toBeNull())
    expect(removeStaff).toHaveBeenCalledTimes(1)
    expect(removeStaff).toHaveBeenCalledWith('m2')
    // useRemoveStaff invalidates ['staff'] on success, so listStaff refetches: the
    // observable effect of the query-invalidation contract, not an implementation
    // internal (initial mount call + the post-invalidate refetch).
    await waitFor(() => expect(listStaff).toHaveBeenCalledTimes(2))
  })

  it('a backend failure (LAST_OWNER_PROTECTED) shows the mapped copy, closes the dialog, and keeps the row', async () => {
    removeStaff.mockRejectedValue(new ApiError(409, { error: { code: 'LAST_OWNER_PROTECTED' } }))
    renderPage()
    await screen.findByText('Bea Manager')
    await openRemoveConfirmFor(/actions for bea manager/i)

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(
      await screen.findByText(
        /you cannot remove or deactivate the only active owner\. make someone else an owner first\./i,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('staff-confirm')).toBeNull()
    // The row is retained: no client-side optimistic removal on error.
    expect(screen.getByText('Bea Manager')).toBeInTheDocument()
  })

  it('a distinct backend failure (MEMBER_NOT_FOUND) maps to its own distinct copy', async () => {
    removeStaff.mockRejectedValue(new ApiError(404, { error: { code: 'MEMBER_NOT_FOUND' } }))
    renderPage()
    await screen.findByText('Bea Manager')
    await openRemoveConfirmFor(/actions for bea manager/i)

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(await screen.findByText(/we could not find that team member\. refresh and try again\./i)).toBeInTheDocument()
    expect(
      screen.queryByText(/you cannot remove or deactivate the only active owner/i),
    ).toBeNull()
  })

  it('cancelling closes the dialog and never calls removeStaff', async () => {
    renderPage()
    await screen.findByText('Bea Manager')
    await openRemoveConfirmFor(/actions for bea manager/i)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByTestId('staff-confirm')).toBeNull())
    expect(removeStaff).not.toHaveBeenCalled()
  })

  it('while the mutation is pending, the CTA reads "Working..." and both buttons are disabled; a second click fires only one mutation', async () => {
    let resolveRemove: (v: { id: string }) => void
    removeStaff.mockReturnValue(
      new Promise((resolve) => {
        resolveRemove = resolve
      }),
    )
    renderPage()
    await screen.findByText('Bea Manager')
    await openRemoveConfirmFor(/actions for bea manager/i)

    const cta = screen.getByRole('button', { name: 'Remove' })
    fireEvent.click(cta)

    const workingCta = await screen.findByRole('button', { name: 'Working...' })
    expect(workingCta).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

    // A second click on the now-disabled CTA must not fire a second mutation call.
    fireEvent.click(workingCta)
    expect(removeStaff).toHaveBeenCalledTimes(1)

    resolveRemove!({ id: 'm2' })
    await waitFor(() => expect(screen.queryByTestId('staff-confirm')).toBeNull())
  })

  it('the shared confirm mechanism also drives deactivate-member with its own distinct title and CTA', async () => {
    deactivateStaff.mockResolvedValue({ id: 'm2' })
    renderPage()
    await screen.findByText('Bea Manager')
    openRowMenu(/actions for bea manager/i)
    fireEvent.click(await screen.findByRole('menuitem', { name: /^deactivate$/i }))

    const dialog = screen.getByTestId('staff-confirm')
    expect(within(dialog).getByText('Deactivate Bea Manager?')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Deactivate' })).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => expect(screen.queryByTestId('staff-confirm')).toBeNull())
    expect(deactivateStaff).toHaveBeenCalledTimes(1)
    expect(deactivateStaff).toHaveBeenCalledWith('m2')
    expect(removeStaff).not.toHaveBeenCalled()
  })
})
