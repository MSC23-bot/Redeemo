import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MerchantPortalShell } from '../MerchantPortalShell'

// M1 Slice 5: the shell now gates on the session + drives the StatusPill from the
// merchant profile. Mock both, plus the router (the guard redirects when not authed).
const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  // Shell wave: the Sidebar + MobileTabBar read the current route for highlighting.
  usePathname: () => '/',
}))

// The Topbar in the authenticated shell now mounts <NotificationBell>; stub its
// API client so the bell mounts without firing real requests.
jest.mock('@/lib/api/notifications', () => ({
  getUnreadCount: jest.fn(() => Promise.resolve({ count: 0 })),
  listNotifications: jest.fn(() => Promise.resolve({ notifications: [], page: 1, pageSize: 8, total: 0 })),
  markNotificationRead: jest.fn(() => Promise.resolve({ updated: 0 })),
  markAllNotificationsRead: jest.fn(() => Promise.resolve({ updated: 0 })),
}))

function renderShell(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

interface SessionShape {
  ready: boolean
  isAuthenticated: boolean
  businessName: string | null
  signOut: () => void
}
let mockSession: SessionShape
jest.mock('@/lib/auth/session', () => ({ useSession: () => mockSession }))
jest.mock('@/lib/auth/useMerchantProfile', () => ({
  useMerchantProfile: () => ({
    data: {
      status: 'REGISTERED',
      onboardingStep: 'REGISTERED',
      businessName: 'Test Co',
      // Codex correction 3: the nav is a positive-allowlist on role, so the
      // shell tests exercise a resolved OWNER (the fail-closed states are
      // pinned in sidebar/mobile-tab-bar/navItems tests).
      viewerCapabilities: { canViewInsights: false, canManageVouchers: true, role: 'OWNER', displayName: 'Priya Shah' },
    },
    isLoading: false,
  }),
}))

describe('MerchantPortalShell (M1 Slice 5 guard)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSession = { ready: true, isAuthenticated: true, businessName: 'Test Co', signOut: jest.fn() }
  })

  it('renders the sidebar nav, the top bar, and its children when authenticated', () => {
    renderShell(
      <MerchantPortalShell>
        <p>page content</p>
      </MerchantPortalShell>,
    )
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /validate a code/i })).toBeInTheDocument()
    expect(screen.getByText('page content')).toBeInTheDocument()
  })

  it('holds a loading gate (no portal chrome, no children) while the session is not ready', () => {
    mockSession = { ready: false, isAuthenticated: false, businessName: null, signOut: jest.fn() }
    renderShell(
      <MerchantPortalShell>
        <p>page content</p>
      </MerchantPortalShell>,
    )
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument()
    expect(screen.queryByText('page content')).not.toBeInTheDocument()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  // Shell wave: on wide viewports the hamburger toggles the 72px icon rail.
  it('the hamburger collapses the sidebar to the icon-only rail on wide viewports', () => {
    renderShell(
      <MerchantPortalShell>
        <p>page content</p>
      </MerchantPortalShell>,
    )
    expect(screen.getByText('Vouchers')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /toggle navigation/i }))
    // Labels gone, icon links (with a11y names) remain.
    expect(screen.queryByText('Vouchers')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Vouchers' })).toBeInTheDocument()
    // Toggle back.
    fireEvent.click(screen.getByRole('button', { name: /toggle navigation/i }))
    expect(screen.getByText('Vouchers')).toBeInTheDocument()
  })

  it('does not render the mobile tab bar on wide viewports', () => {
    renderShell(
      <MerchantPortalShell>
        <p>page content</p>
      </MerchantPortalShell>,
    )
    expect(screen.queryByRole('navigation', { name: 'Quick navigation' })).not.toBeInTheDocument()
  })

  it('redirects to /sign-in when ready but not authenticated (dead/absent session)', () => {
    mockSession = { ready: true, isAuthenticated: false, businessName: null, signOut: jest.fn() }
    renderShell(
      <MerchantPortalShell>
        <p>page content</p>
      </MerchantPortalShell>,
    )
    expect(mockReplace).toHaveBeenCalledWith('/sign-in')
    expect(screen.queryByText('page content')).not.toBeInTheDocument()
  })
})
