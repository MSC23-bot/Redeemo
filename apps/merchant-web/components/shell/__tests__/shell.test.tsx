import { render, screen } from '@testing-library/react'
import { MerchantPortalShell } from '../MerchantPortalShell'

// M1 Slice 5: the shell now gates on the session + drives the StatusPill from the
// merchant profile. Mock both, plus the router (the guard redirects when not authed).
const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: mockReplace }) }))

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
    data: { status: 'REGISTERED', onboardingStep: 'REGISTERED', businessName: 'Test Co' },
    isLoading: false,
  }),
}))

describe('MerchantPortalShell (M1 Slice 5 guard)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSession = { ready: true, isAuthenticated: true, businessName: 'Test Co', signOut: jest.fn() }
  })

  it('renders the sidebar nav, the top bar, and its children when authenticated', () => {
    render(
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
    render(
      <MerchantPortalShell>
        <p>page content</p>
      </MerchantPortalShell>,
    )
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument()
    expect(screen.queryByText('page content')).not.toBeInTheDocument()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('redirects to /sign-in when ready but not authenticated (dead/absent session)', () => {
    mockSession = { ready: true, isAuthenticated: false, businessName: null, signOut: jest.fn() }
    render(
      <MerchantPortalShell>
        <p>page content</p>
      </MerchantPortalShell>,
    )
    expect(mockReplace).toHaveBeenCalledWith('/sign-in')
    expect(screen.queryByText('page content')).not.toBeInTheDocument()
  })
})
