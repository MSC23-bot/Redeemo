import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { LoginSecurityCard } from '@/components/account/LoginSecurityCard'
import type { MerchantAccount, MerchantSession } from '@/lib/api/account'

const changePasswordMutateAsync = jest.fn()
jest.mock('@/lib/account/useChangePassword', () => ({
  useChangePassword: () => ({ mutateAsync: changePasswordMutateAsync, isPending: false }),
}))

const logoutAllMutateAsync = jest.fn()
let logoutAllPending = false
jest.mock('@/lib/account/useLogoutAllOtherSessions', () => ({
  useLogoutAllOtherSessions: () => ({ mutateAsync: logoutAllMutateAsync, isPending: logoutAllPending }),
}))

// The ChangePasswordModal child still uses useToast; the card itself no longer does.
const toast = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast }) }))

// The card composes logout-all (revoke OTHERS) with the app's normal signOut
// (end THIS session + clear the httpOnly cookie + redirect to /sign-in).
const signOut = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/auth/session', () => ({
  useSession: () => ({ signOut }),
}))

function account(over: Partial<MerchantAccount> = {}): MerchantAccount {
  return {
    id: 'a1',
    firstName: 'James',
    lastName: 'Whitfield',
    jobTitle: 'Owner',
    email: 'james@oldfoundrykitchen.co.uk',
    phone: '+44 7700 900145',
    phoneCountryCode: '+44',
    emailVerified: true,
    passwordChangedAt: '2026-04-06T12:00:00.000Z',
    ...over,
  } as MerchantAccount
}

const CURRENT_SESSION: MerchantSession = {
  deviceType: 'web',
  deviceName: null,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0 Safari/537.36',
  ipAddress: '203.0.113.10',
  lastActiveAt: new Date().toISOString(),
  createdAt: '2026-06-01T00:00:00.000Z',
  isCurrent: true,
}
const OTHER_SESSION: MerchantSession = {
  deviceType: 'web',
  deviceName: null,
  userAgent:
    'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  ipAddress: '198.51.100.4',
  lastActiveAt: '2026-07-03T12:00:00.000Z',
  createdAt: '2026-05-01T00:00:00.000Z',
  isCurrent: false,
}

beforeEach(() => {
  changePasswordMutateAsync.mockReset()
  logoutAllMutateAsync.mockReset().mockResolvedValue({ message: 'Signed out of all other sessions.', revokedCount: 1 })
  logoutAllPending = false
  toast.mockReset()
  signOut.mockReset().mockResolvedValue(undefined)
})

function renderCard(sessions: MerchantSession[] = [CURRENT_SESSION, OTHER_SESSION]) {
  return render(
    <LoginSecurityCard account={account()} sessions={sessions} sessionsLoading={false} sessionsError={false} />,
  )
}

describe('LoginSecurityCard password row', () => {
  it('shows "Last changed <relative time>" when passwordChangedAt is set', () => {
    renderCard()
    expect(screen.getByText(/last changed/i)).toBeInTheDocument()
  })

  it('omits the "Last changed" line when passwordChangedAt is null', () => {
    render(
      <LoginSecurityCard
        account={account({ passwordChangedAt: null })}
        sessions={[]}
        sessionsLoading={false}
        sessionsError={false}
      />,
    )
    expect(screen.queryByText(/last changed/i)).not.toBeInTheDocument()
  })

  it('Change password opens the modal', () => {
    renderCard()
    fireEvent.click(screen.getByTestId('change-password-open'))
    expect(screen.getByTestId('change-password-modal')).toBeInTheDocument()
  })
})

describe('LoginSecurityCard login verification (display-only)', () => {
  it('shows an "On" badge and never renders a toggle for it', () => {
    renderCard()
    expect(screen.getByText('On')).toBeInTheDocument()
    // No switch/checkbox control anywhere associated with login verification -
    // it is always-on and not user-editable in this build.
    expect(screen.queryByRole('switch', { name: /login verification/i })).not.toBeInTheDocument()
  })
})

describe('LoginSecurityCard sign out everywhere (FULL sign-out, prototype intent)', () => {
  it('requires confirmation before doing anything', () => {
    renderCard()
    fireEvent.click(screen.getByTestId('sign-out-everywhere-open'))
    expect(logoutAllMutateAsync).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
    expect(screen.getByTestId('sign-out-everywhere-confirm')).toBeInTheDocument()
  })

  it("the copy states it ends THIS device too (not a keep-current action)", () => {
    renderCard()
    expect(screen.getByText(/ends every session, including this one/i)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('sign-out-everywhere-open'))
    expect(
      within(screen.getByTestId('sign-out-everywhere-confirm')).getByText(/including this one/i),
    ).toBeInTheDocument()
  })

  it('confirming fires logout-all THEN the normal signOut (current session ended + redirect)', async () => {
    renderCard()
    fireEvent.click(screen.getByTestId('sign-out-everywhere-open'))
    const confirmDialog = screen.getByTestId('sign-out-everywhere-confirm')
    fireEvent.click(within(confirmDialog).getByRole('button', { name: /^sign out everywhere$/i }))

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    expect(logoutAllMutateAsync).toHaveBeenCalledTimes(1)
    // Ordering: logout-all (revoke others) must resolve/attempt before the
    // current-session signOut runs.
    expect(logoutAllMutateAsync.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0])
  })

  it('still ends the current session (signOut) even if logout-all rejects (best-effort revoke-others)', async () => {
    logoutAllMutateAsync.mockRejectedValueOnce(new Error('revoke-others failed'))
    renderCard()
    fireEvent.click(screen.getByTestId('sign-out-everywhere-open'))
    const confirmDialog = screen.getByTestId('sign-out-everywhere-confirm')
    fireEvent.click(within(confirmDialog).getByRole('button', { name: /^sign out everywhere$/i }))

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    expect(logoutAllMutateAsync).toHaveBeenCalledTimes(1)
  })

  it('Cancel closes the confirm without calling logout-all or signOut', () => {
    renderCard()
    fireEvent.click(screen.getByTestId('sign-out-everywhere-open'))
    fireEvent.click(within(screen.getByTestId('sign-out-everywhere-confirm')).getByRole('button', { name: /cancel/i }))
    expect(logoutAllMutateAsync).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
    expect(screen.queryByTestId('sign-out-everywhere-confirm')).not.toBeInTheDocument()
  })
})

describe('LoginSecurityCard sessions list', () => {
  it('renders both sessions with the current one tagged, and no fabricated location', () => {
    renderCard()
    const rows = screen.getAllByTestId('session-row')
    expect(rows).toHaveLength(2)
    expect(screen.getByText('This device')).toBeInTheDocument()
    expect(screen.queryByText(/bristol|london|united kingdom/i)).not.toBeInTheDocument()
  })

  it('shows a loading state while sessions are in flight', () => {
    render(<LoginSecurityCard account={account()} sessions={undefined} sessionsLoading sessionsError={false} />)
    expect(screen.getByText(/loading your sign-ins/i)).toBeInTheDocument()
  })

  it('shows an error state when sessions failed to load', () => {
    render(<LoginSecurityCard account={account()} sessions={undefined} sessionsLoading={false} sessionsError />)
    expect(screen.getByText(/could not load your recent sign-ins/i)).toBeInTheDocument()
  })
})
