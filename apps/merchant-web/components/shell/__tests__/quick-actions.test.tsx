/**
 * Shell wave: QuickActionsMenu tests. Pins the prototype action set + the
 * capability gating (UX hints; backend asserts remain the boundary):
 * Validate (always) / Create a voucher (canManageVouchers) / branch PIN
 * (D-BM1: OWNER or an assigned BRANCH_MANAGER, routes to the guarded on-page
 * PinCard - never inline; STAFF never sees the row) / Today's redemptions
 * (always).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { QuickActionsMenu } from '../QuickActionsMenu'
import { ValidateDialogContext } from '@/components/redemptions/validateDialogContext'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const listBranches = jest.fn()
jest.mock('@/lib/api/branch', () => ({ listBranches: () => listBranches() }))

function branch(over: Partial<Record<string, unknown>> = {}) {
  return { id: 'b1', name: 'Old Foundry', city: 'Huddersfield', lifecycleStatus: 'LIVE', ...over }
}

function renderMenu(props: Partial<React.ComponentProps<typeof QuickActionsMenu>> = {}, openValidate = jest.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onOpenChange = jest.fn()
  const utils = render(
    <QueryClientProvider client={qc}>
      <ValidateDialogContext.Provider value={{ openValidate }}>
        <QuickActionsMenu open onOpenChange={onOpenChange} role={null} canManageVouchers={false} {...props} />
      </ValidateDialogContext.Provider>
    </QueryClientProvider>,
  )
  return { ...utils, onOpenChange, openValidate }
}

beforeEach(() => {
  push.mockReset()
  listBranches.mockReset().mockResolvedValue([branch()])
})

describe('QuickActionsMenu', () => {
  it('always shows Validate a code + Today\'s redemptions; hides gated actions without capabilities', () => {
    renderMenu()
    expect(screen.getByText('Validate a code')).toBeInTheDocument()
    expect(screen.getByText("Today's redemptions")).toBeInTheDocument()
    expect(screen.queryByText('Create a voucher')).not.toBeInTheDocument()
    expect(screen.queryByText('View a branch redemption PIN')).not.toBeInTheDocument()
  })

  it('Validate a code opens the shared dialog and closes the menu', () => {
    const { onOpenChange, openValidate } = renderMenu()
    fireEvent.click(screen.getByText('Validate a code'))
    expect(openValidate).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows Create a voucher only with canManageVouchers, routing to /vouchers?create=1', () => {
    renderMenu({ canManageVouchers: true })
    fireEvent.click(screen.getByText('Create a voucher'))
    expect(push).toHaveBeenCalledWith('/vouchers?create=1')
  })

  it("Today's redemptions routes to the pre-filtered log", () => {
    renderMenu()
    fireEvent.click(screen.getByText("Today's redemptions"))
    expect(push).toHaveBeenCalledWith('/redemptions?range=today')
  })

  it('single-branch OWNER: the PIN action routes straight to that branch PIN section', async () => {
    renderMenu({ role: 'OWNER' })
    const action = await screen.findByText('View a branch redemption PIN')
    expect(screen.getByText('Reveal your branch PIN')).toBeInTheDocument()
    fireEvent.click(action)
    expect(push).toHaveBeenCalledWith('/branches/b1#pin')
  })

  it('same-page #pin jump: scrolls the already-mounted PIN card after navigation', async () => {
    // Simulate being ON the branch page already: the card exists in the DOM, so
    // pushing only changes the hash and no remount effect fires. The quick
    // action itself scrolls the card after the navigation settles.
    const pinEl = document.createElement('div')
    pinEl.id = 'pin'
    pinEl.scrollIntoView = jest.fn()
    document.body.appendChild(pinEl)
    try {
      renderMenu({ role: 'OWNER' })
      const action = await screen.findByText('View a branch redemption PIN')
      jest.useFakeTimers()
      fireEvent.click(action)
      jest.advanceTimersByTime(200)
      jest.useRealTimers()
      expect(pinEl.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    } finally {
      pinEl.remove()
    }
  })

  it('multi-branch OWNER: the PIN action expands the sub-picker; a branch row routes to its PIN section', async () => {
    listBranches.mockResolvedValue([branch(), branch({ id: 'b2', name: 'Riverside', city: 'Leeds' })])
    renderMenu({ role: 'OWNER' })
    const action = await screen.findByText('View a branch redemption PIN')
    expect(screen.getByText('Pick a branch to reveal its PIN')).toBeInTheDocument()
    fireEvent.click(action)
    expect(push).not.toHaveBeenCalled() // no direct nav on multi-branch
    expect(screen.getByText('Choose a branch to reveal its PIN')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Riverside'))
    expect(push).toHaveBeenCalledWith('/branches/b2#pin')
  })

  it('CLOSED branches are excluded from the PIN flow', async () => {
    listBranches.mockResolvedValue([branch(), branch({ id: 'b3', name: 'Gone', lifecycleStatus: 'CLOSED' })])
    renderMenu({ role: 'OWNER' })
    await screen.findByText('View a branch redemption PIN')
    // Only one live branch left -> single-branch copy, no picker.
    expect(screen.getByText('Reveal your branch PIN')).toBeInTheDocument()
  })

  // D-BM1 (merged spec §10): the PIN row widens from OWNER-only to OWNER OR
  // BRANCH_MANAGER. Safety chain: the branch list is scope-filtered server-side
  // (a BM only ever receives their assigned set), so every listed row already
  // satisfies assertCanManageBranch for that BM, and the reveal route itself
  // stays server-guarded regardless. STAFF keeps NO PIN row and fetches nothing.
  it('a BRANCH_MANAGER sees the PIN row (single-branch copy) and the scoped branch list is fetched', async () => {
    renderMenu({ role: 'BRANCH_MANAGER' })
    const action = await screen.findByText('View a branch redemption PIN')
    expect(screen.getByText('Reveal your branch PIN')).toBeInTheDocument()
    fireEvent.click(action)
    expect(push).toHaveBeenCalledWith('/branches/b1#pin')
    expect(listBranches).toHaveBeenCalled()
  })

  it('the PIN action never appears for STAFF in this wave (fail closed)', async () => {
    renderMenu({ role: 'STAFF' })
    expect(screen.queryByText('View a branch redemption PIN')).not.toBeInTheDocument()
    // And no branch fetch fires for STAFF (lazy + gated).
    await waitFor(() => expect(listBranches).not.toHaveBeenCalled())
  })

  it('never renders a PIN value anywhere in the popover', async () => {
    renderMenu({ role: 'OWNER' })
    await screen.findByText('View a branch redemption PIN')
    expect(screen.queryByText(/\d{4}/)).not.toBeInTheDocument()
  })
})
