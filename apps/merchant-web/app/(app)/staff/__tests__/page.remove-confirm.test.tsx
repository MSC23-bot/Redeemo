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
 * copy; cancelling never calls removeStaff; scrim-click and Escape both dismiss
 * without calling removeStaff (pinning the shared Dialog primitive's close paths);
 * the pending "Working..." state disables both buttons and de-dupes a double-click
 * into a single mutation call; and the shared runConfirm mechanism also drives
 * deactivate-member (distinct title/CTA).
 *
 * §Follow-up (closing the 3 DEFER gaps from the PR #371 adversarial review):
 * the actionError banner's structural render site (not just its text); that a
 * stale actionError from a prior failed action is cleared by a subsequent
 * successful action (runConfirm's setActionError(null) at the top); and the
 * deactivate-member confirm flow's own error-mapping path (previously only
 * remove-member had error-case coverage). Plus the deactivate-appuser confirm
 * flow's happy path, since its fixture wiring drops in cleanly alongside the
 * existing portal-member harness.
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
const deactivateAppUser = jest.fn()
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
  deactivateAppUser: (branchId: string) => deactivateAppUser(branchId),
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
  deactivateAppUser.mockReset()
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

  it('clicking the scrim dismisses the dialog and never calls removeStaff', async () => {
    renderPage()
    await screen.findByText('Bea Manager')
    await openRemoveConfirmFor(/actions for bea manager/i)

    // The shared Dialog primitive (components/ui/dialog.tsx) wires the scrim's
    // onClick to onClose; the page's onCancel clears the confirm state, which
    // unmounts the dialog.
    fireEvent.click(screen.getByTestId('staff-confirm-scrim'))

    await waitFor(() => expect(screen.queryByTestId('staff-confirm')).toBeNull())
    expect(removeStaff).not.toHaveBeenCalled()
  })

  it('pressing Escape dismisses the dialog and never calls removeStaff', async () => {
    renderPage()
    await screen.findByText('Bea Manager')
    await openRemoveConfirmFor(/actions for bea manager/i)

    // The shared Dialog primitive handles Escape via onKeyDown on its root wrapper
    // div (components/ui/dialog.tsx handleKeyDown); a keyDown fired on the panel
    // bubbles up to that wrapper handler, which calls onClose.
    fireEvent.keyDown(screen.getByTestId('staff-confirm'), { key: 'Escape' })

    await waitFor(() => expect(screen.queryByTestId('staff-confirm')).toBeNull())
    expect(removeStaff).not.toHaveBeenCalled()
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
    let resolveRemove!: (v: { id: string }) => void
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

    resolveRemove({ id: 'm2' })
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

  // --- §Follow-up: DEFER gap 1 — actionError render-site structural pin ------
  //
  // The pre-existing error tests (above) only assert the mapped copy is somewhere
  // in the document via findByText. That would still pass if the banner rendered
  // in the wrong container, or with no semantic role at all. page.tsx renders the
  // banner as a bare `<div role="alert">` at page level (a sibling of the summary
  // cards / table, NOT inside the Dialog): there is no dedicated data-testid or
  // other structural hook beyond that role attribute. This pins exactly that
  // structural identity, and pins the negative space around it: the banner is a
  // getByRole('alert') node whose accessible content is the mapped copy, it is
  // NOT nested inside the confirm dialog (which has already closed by the time it
  // appears), and it is not duplicated by some other role="alert" node on the page.
  it('the mapped error copy renders inside the actual role="alert" banner (its real structural container), not merely somewhere on the page', async () => {
    removeStaff.mockRejectedValue(new ApiError(409, { error: { code: 'LAST_OWNER_PROTECTED' } }))
    renderPage()
    await screen.findByText('Bea Manager')
    await openRemoveConfirmFor(/actions for bea manager/i)

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    // Wait for the dialog to close (the error path always closes it) before
    // asserting on the alert, so we are not accidentally matching against a
    // role="alert" that might transiently exist inside the dialog itself.
    await waitFor(() => expect(screen.queryByTestId('staff-confirm')).toBeNull())

    const alerts = screen.getAllByRole('alert')
    // Exactly one role="alert" node is live on the page at this point (the
    // actionError banner); asserting the count guards against a future change
    // silently introducing a second competing alert region.
    expect(alerts).toHaveLength(1)
    const banner = alerts[0]
    expect(
      within(banner).getByText(
        /you cannot remove or deactivate the only active owner\. make someone else an owner first\./i,
      ),
    ).toBeInTheDocument()
    // Structural negative: the banner is not the dialog panel (the dialog is
    // already gone, but this also guards against a regression that re-parents
    // the banner under a lingering dialog element keyed by testid).
    expect(screen.queryByTestId('staff-confirm')).toBeNull()
  })

  // --- §Follow-up: DEFER gap 2 — stale actionError clearing -------------------
  //
  // runConfirm() calls setActionError(null) at the top before attempting the
  // mutation. This proves that contract observably: a first failed action shows
  // its error banner, then a second, DIFFERENT, successful action must make that
  // banner disappear rather than leaving stale copy on screen underneath (or
  // beside) the newly-succeeded state.
  it('a stale error banner from a prior failed action is cleared once a subsequent action succeeds', async () => {
    removeStaff.mockRejectedValue(new ApiError(409, { error: { code: 'LAST_OWNER_PROTECTED' } }))
    deactivateStaff.mockResolvedValue({ id: 'm2' })
    renderPage()
    await screen.findByText('Bea Manager')

    // First: a failing remove attempt leaves the mapped error banner visible.
    await openRemoveConfirmFor(/actions for bea manager/i)
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(
      await screen.findByText(
        /you cannot remove or deactivate the only active owner\. make someone else an owner first\./i,
      ),
    ).toBeInTheDocument()

    // Second: a distinct, successful action (deactivate) on the same person.
    openRowMenu(/actions for bea manager/i)
    fireEvent.click(await screen.findByRole('menuitem', { name: /^deactivate$/i }))
    const dialog = screen.getByTestId('staff-confirm')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => expect(screen.queryByTestId('staff-confirm')).toBeNull())
    // The stale remove-failure copy must be gone; nothing replaces it because the
    // second action succeeded (no new error to show).
    await waitFor(() =>
      expect(
        screen.queryByText(/you cannot remove or deactivate the only active owner/i),
      ).toBeNull(),
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(deactivateStaff).toHaveBeenCalledTimes(1)
    expect(deactivateStaff).toHaveBeenCalledWith('m2')
  })

  // --- §Follow-up: DEFER gap 3 — deactivate-member error-mapping coverage ----
  //
  // Previously only remove-member had error-case tests; deactivate-member's own
  // confirm/error path was untested. LAST_OWNER_PROTECTED is a real code the
  // backend's deactivateMember throws (via assertNotLastOwner) when the target is
  // the sole active owner, and it is the exact code errorMessages.ts maps for
  // both the remove and deactivate actions, so it doubles as the deactivate-side
  // pin for that shared mapping.
  it('a backend failure (LAST_OWNER_PROTECTED) on deactivate-member shows the mapped copy, closes the dialog, and keeps the row', async () => {
    deactivateStaff.mockRejectedValue(new ApiError(409, { error: { code: 'LAST_OWNER_PROTECTED' } }))
    renderPage()
    await screen.findByText('Bea Manager')
    openRowMenu(/actions for bea manager/i)
    fireEvent.click(await screen.findByRole('menuitem', { name: /^deactivate$/i }))

    const dialog = screen.getByTestId('staff-confirm')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }))

    expect(
      await screen.findByText(
        /you cannot remove or deactivate the only active owner\. make someone else an owner first\./i,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('staff-confirm')).toBeNull()
    // The row is retained: no client-side optimistic deactivation on error.
    expect(screen.getByText('Bea Manager')).toBeInTheDocument()
    expect(removeStaff).not.toHaveBeenCalled()
  })

  // --- Bonus: deactivate-appuser confirm happy path ---------------------------
  //
  // The third runConfirm branch (menu -> dialog title "Deactivate this app user?"
  // -> confirm calls deactivateAppUser with the branchId) had no page-level
  // coverage at all. The APP_USERS fixture (single user, appUserCount: 1) is the
  // same non-ambiguous shape used in page.test.tsx, so the Deactivate menu item
  // is enabled (the §5.3 ambiguous-branch guard only disables it when
  // appUserCount > 1).
  it('opening deactivate for an app user from the row menu calls deactivateAppUser with the branchId and closes on success', async () => {
    listBranchAppUsers.mockResolvedValue(APP_USERS)
    deactivateAppUser.mockResolvedValue({ id: 'au1' })
    renderPage()
    await screen.findByText('Jo Till')

    openRowMenu(/actions for jo till/i)
    fireEvent.click(await screen.findByRole('menuitem', { name: /^deactivate$/i }))

    const dialog = screen.getByTestId('staff-confirm')
    expect(within(dialog).getByText('Deactivate this app user?')).toBeInTheDocument()
    expect(
      within(dialog).getByText(/they will be signed out of the validation app until you reactivate them\./i),
    ).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => expect(screen.queryByTestId('staff-confirm')).toBeNull())
    expect(deactivateAppUser).toHaveBeenCalledTimes(1)
    expect(deactivateAppUser).toHaveBeenCalledWith('b1')
    expect(deactivateStaff).not.toHaveBeenCalled()
    expect(removeStaff).not.toHaveBeenCalled()
  })
})
