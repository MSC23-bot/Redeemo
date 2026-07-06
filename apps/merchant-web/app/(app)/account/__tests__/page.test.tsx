/**
 * My Account (§BP-ACC): the page-level orchestrator. Mirrors the Business
 * Profile page test - loading / error (with Try again) / success states,
 * delegating the resolved account + sessions to <MyAccountScreen>. No role
 * gate: My Account is available to ANY authenticated merchant admin.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import MyAccountPage from '@/app/(app)/account/page'
import { ToastProvider } from '@/components/ui/toast'

const getMerchantAccount = jest.fn()
jest.mock('@/lib/api/account', () => {
  const actual = jest.requireActual('@/lib/api/account')
  return {
    ...actual,
    getMerchantAccount: () => getMerchantAccount(),
    getMerchantSessions: () => Promise.resolve([]),
  }
})

jest.mock('@/lib/auth/session', () => ({
  useSession: () => ({ isAuthenticated: true, businessName: 'The Old Foundry Kitchen' }),
}))

function account(over: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    firstName: 'James',
    lastName: 'Whitfield',
    jobTitle: 'Owner',
    email: 'james@oldfoundrykitchen.co.uk',
    phone: '+44 7700 900145',
    phoneCountryCode: '+44',
    emailVerified: true,
    passwordChangedAt: null,
    ...over,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MyAccountPage />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getMerchantAccount.mockReset()
})

describe('MyAccountPage', () => {
  it('renders a loading state while the account is in flight', () => {
    getMerchantAccount.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders an error state with a Try again control', async () => {
    getMerchantAccount.mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('refetches when Try again is pressed', async () => {
    getMerchantAccount.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(account())
    renderPage()
    await screen.findByRole('alert')
    getMerchantAccount.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(getMerchantAccount).toHaveBeenCalled())
  })

  it('renders the real MyAccountScreen once the account resolves, for ANY authenticated admin (no role gate)', async () => {
    getMerchantAccount.mockResolvedValue(account())
    renderPage()
    expect(await screen.findByTestId('my-account-screen')).toBeInTheDocument()
  })

  it('renders the page header copy', async () => {
    getMerchantAccount.mockResolvedValue(account())
    renderPage()
    expect(screen.getByRole('heading', { name: 'My account' })).toBeInTheDocument()
    await screen.findByTestId('my-account-screen')
  })
})
