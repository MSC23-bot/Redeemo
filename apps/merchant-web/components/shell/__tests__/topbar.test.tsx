import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Topbar } from '../Topbar'
import { ValidateDialogContext } from '@/components/redemptions/validateDialogContext'

// The Topbar now mounts <NotificationBell>, which uses next/navigation + React
// Query. Mock the router and stub the notification API so the bell mounts without
// firing real requests; wrap renders in a QueryClientProvider.
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/lib/api/notifications', () => ({
  getUnreadCount: jest.fn(() => Promise.resolve({ count: 0 })),
  listNotifications: jest.fn(() => Promise.resolve({ notifications: [], page: 1, pageSize: 8, total: 0 })),
  markNotificationRead: jest.fn(() => Promise.resolve({ updated: 0 })),
  markAllNotificationsRead: jest.fn(() => Promise.resolve({ updated: 0 })),
}))

function renderTopbar(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('Topbar', () => {
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

  it('does NOT render the hamburger toggle on wide viewports (isNarrow default false)', () => {
    renderTopbar(<Topbar onMenu={() => {}} />)
    expect(screen.queryByRole('button', { name: /toggle navigation/i })).not.toBeInTheDocument()
  })

  it('renders the hamburger toggle and centred wordmark on narrow viewports', () => {
    renderTopbar(<Topbar onMenu={() => {}} isNarrow />)
    expect(screen.getByRole('button', { name: /toggle navigation/i })).toBeInTheDocument()
    expect(screen.getByText('Redeemo for Business')).toBeInTheDocument()
  })

  it('opens the account menu and signs out (M1 Slice 5)', () => {
    const onSignOut = jest.fn()
    renderTopbar(<Topbar onMenu={() => {}} businessName="Roe Cafe" onSignOut={onSignOut} />)
    // closed by default
    expect(screen.queryByRole('menuitem', { name: /sign out/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }))
    expect(screen.getByText('Roe Cafe')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /sign out/i }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('closes the account menu on Escape and returns focus to the trigger (M1 Slice 5 a11y)', () => {
    renderTopbar(<Topbar onMenu={() => {}} businessName="Roe Cafe" onSignOut={jest.fn()} />)
    const trigger = screen.getByRole('button', { name: /account menu/i })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    fireEvent.click(trigger)
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menuitem', { name: /sign out/i })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
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
})
