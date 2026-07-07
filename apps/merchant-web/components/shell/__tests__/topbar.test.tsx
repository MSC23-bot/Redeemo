import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Topbar } from '../Topbar'
import { ValidateDialogContext } from '@/components/redemptions/validateDialogContext'
import { ValidateDialogProvider } from '@/components/redemptions/ValidateDialogProvider'

// The Topbar mounts <NotificationBell> + <QuickActionsMenu> + <AccountMenu>,
// which use next/navigation + React Query. Mock the router and stub the API
// clients so the menus mount without firing real requests.
const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
jest.mock('@/lib/api/notifications', () => ({
  getUnreadCount: jest.fn(() => Promise.resolve({ count: 0 })),
  listNotifications: jest.fn(() => Promise.resolve({ notifications: [], page: 1, pageSize: 5, total: 0 })),
  markNotificationRead: jest.fn(() => Promise.resolve({ updated: 0 })),
  markAllNotificationsRead: jest.fn(() => Promise.resolve({ updated: 0 })),
}))
jest.mock('@/lib/api/branch', () => ({
  listBranches: jest.fn(() => Promise.resolve([])),
}))
// The real ValidateDialogProvider mounts ValidateCodeDialog, which calls this
// API client on submit. It is never invoked just by opening the entry step,
// but stub it so the module resolves without hitting the network.
jest.mock('@/lib/api/redemptions', () => ({
  lookupRedemptionByCode: jest.fn(),
  validateRedemptionCode: jest.fn(),
}))

function renderTopbar(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('Topbar', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders the Validate-a-code CTA and the icon slots', () => {
    renderTopbar(<Topbar onMenu={() => {}} />)
    expect(screen.getByRole('button', { name: /validate a code/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /quick actions/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /account/i })).toBeInTheDocument()
  })

  it('does NOT render the prototype-only View-as or Demo controls', () => {
    renderTopbar(<Topbar onMenu={() => {}} />)
    expect(screen.queryByText(/view as/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^demo/i)).not.toBeInTheDocument()
  })

  // Shell wave: the hamburger is ALWAYS rendered (wide = collapse toggle,
  // narrow = drawer toggle; the shell decides via onMenu).
  it('renders the hamburger on wide viewports and fires onMenu', () => {
    const onMenu = jest.fn()
    renderTopbar(<Topbar onMenu={onMenu} />)
    fireEvent.click(screen.getByRole('button', { name: /toggle navigation/i }))
    expect(onMenu).toHaveBeenCalledTimes(1)
  })

  it('renders the hamburger toggle and centred wordmark on narrow viewports', () => {
    renderTopbar(<Topbar onMenu={() => {}} isNarrow />)
    expect(screen.getByRole('button', { name: /toggle navigation/i })).toBeInTheDocument()
    expect(screen.getByText('Redeemo for Business')).toBeInTheDocument()
  })

  // Shell wave: below the 720px compact threshold the Validate label collapses
  // to icon-only (the accessible name survives via aria-label).
  it('hides the Validate label text when compact but keeps the accessible name', () => {
    renderTopbar(<Topbar onMenu={() => {}} isCompact />)
    const btn = screen.getByRole('button', { name: /validate a code/i })
    expect(btn).toBeInTheDocument()
    expect(btn).not.toHaveTextContent('Validate a code')
  })

  it('account menu shows identity + destinations, and Log out requires the confirm dialog', () => {
    const onSignOut = jest.fn()
    renderTopbar(
      <Topbar onMenu={() => {}} businessName="Roe Cafe" displayName="Priya Shah" role="OWNER" onSignOut={onSignOut} />,
    )
    expect(screen.queryByRole('menuitem', { name: /log out/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }))
    expect(screen.getByText('Roe Cafe')).toBeInTheDocument()
    expect(screen.getByText('Priya Shah')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /my account/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /business profile/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /help & support/i })).toBeInTheDocument()
    // Log out opens the CONFIRM dialog - onSignOut has NOT fired yet.
    fireEvent.click(screen.getByRole('menuitem', { name: /log out/i }))
    expect(onSignOut).not.toHaveBeenCalled()
    expect(screen.getByText('Log out of Redeemo for Business?')).toBeInTheDocument()
    // "Stay logged in" cancels without signing out, and focus returns to the
    // account trigger (the menu that held focus unmounted - CodeRabbit a11y fix).
    fireEvent.click(screen.getByRole('button', { name: /stay logged in/i }))
    expect(onSignOut).not.toHaveBeenCalled()
    expect(screen.queryByText('Log out of Redeemo for Business?')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /account menu/i })).toHaveFocus()
  })

  it('confirming the logout dialog calls onSignOut', () => {
    const onSignOut = jest.fn()
    renderTopbar(<Topbar onMenu={() => {}} businessName="Roe Cafe" role="OWNER" onSignOut={onSignOut} />)
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /log out/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  // Codex correction 3: Business profile is a positive allowlist (OWNER/BM) -
  // STAFF, an unresolved (null) role and unknown future roles all fail closed.
  it.each([['STAFF'], [null], ['AUDITOR']])('hides Business profile in the account menu for role %s', (role) => {
    renderTopbar(<Topbar onMenu={() => {}} businessName="Roe Cafe" role={role as string | null} />)
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }))
    expect(screen.queryByRole('menuitem', { name: /business profile/i })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /my account/i })).toBeInTheDocument()
  })

  it('shows Business profile for BRANCH_MANAGER', () => {
    renderTopbar(<Topbar onMenu={() => {}} businessName="Roe Cafe" role="BRANCH_MANAGER" />)
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }))
    expect(screen.getByRole('menuitem', { name: /business profile/i })).toBeInTheDocument()
  })

  it('closes the account menu on Escape and returns focus to the trigger (a11y)', () => {
    renderTopbar(<Topbar onMenu={() => {}} businessName="Roe Cafe" onSignOut={jest.fn()} />)
    const trigger = screen.getByRole('button', { name: /account menu/i })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    fireEvent.click(trigger)
    expect(screen.getByRole('menuitem', { name: /my account/i })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menuitem', { name: /my account/i })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  // Shell wave: the topbar menus are mutually exclusive.
  it('opening the quick actions closes the account menu (mutual exclusion)', () => {
    renderTopbar(<Topbar onMenu={() => {}} businessName="Roe Cafe" role="OWNER" />)
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }))
    expect(screen.getByRole('menuitem', { name: /my account/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /quick actions/i }))
    expect(screen.queryByRole('menuitem', { name: /my account/i })).not.toBeInTheDocument()
    expect(screen.getByText('Jump straight to what you do most')).toBeInTheDocument()
  })

  it('Validate-a-code opens the shared dialog via the context (M3 F2)', () => {
    const openValidate = jest.fn()
    renderTopbar(
      <ValidateDialogContext.Provider value={{ openValidate }}>
        <Topbar onMenu={() => {}} />
      </ValidateDialogContext.Provider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /validate a code/i }))
    expect(openValidate).toHaveBeenCalledTimes(1)
  })

  // Regression for the staging-acceptance P1 crash: the topbar CTA used
  // `onClick={openValidate}` directly, so React forwarded the click
  // SyntheticEvent as the `code` argument and it landed in initialCode,
  // which normalizeCode() then tried to run string ops on and threw. A mocked
  // openValidate (see the test above) can never catch this - it never runs
  // the real provider/dialog code path. This test wires up the REAL
  // ValidateDialogProvider + ValidateCodeDialog, exactly as MerchantPortalShell
  // does, so the click actually flows through openValidate's real
  // implementation end to end.
  it('clicking Validate a code opens the real dialog at the entry step with an empty input and does not crash (regression)', () => {
    renderTopbar(
      <ValidateDialogProvider>
        <Topbar onMenu={() => {}} />
      </ValidateDialogProvider>,
    )
    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: /validate a code/i }))
    }).not.toThrow()
    expect(screen.getByTestId('validate-code-dialog')).toBeInTheDocument()
    expect((screen.getByLabelText(/redemption code/i) as HTMLInputElement).value).toBe('')
  })
})
