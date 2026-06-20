import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HomePage from '@/app/(app)/page'

jest.mock('@/lib/auth/session', () => ({ useSession: () => ({ isAuthenticated: true }) }))

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn() }) }))

interface ProfileData {
  status: string
  onboardingStep: string
  businessName: string
  primaryCategoryId: string | null
  description: string | null
}
interface ProfileQuery {
  data?: ProfileData
  isLoading: boolean
  isError?: boolean
  refetch?: () => void
}
let mockProfile: ProfileQuery
jest.mock('@/lib/auth/useMerchantProfile', () => ({ useMerchantProfile: () => mockProfile }))

// The onboarding reads (checklist + status + rmv count) the hub derives from.
let mockChecklist = { branch_created: false, contract_signed: false, rmv_configured: false, all_complete: false }
let mockStatus: { status: string | null; comment: string | null; actionedAt: string | null } = {
  status: null,
  comment: null,
  actionedAt: null,
}
let mockRmvCount = 0
const submitOnboarding = jest.fn()
jest.mock('@/lib/api/onboarding', () => ({
  getOnboardingChecklist: () => Promise.resolve(mockChecklist),
  getOnboardingStatus: () => Promise.resolve(mockStatus),
  countActiveRmvVouchers: () => Promise.resolve(mockRmvCount),
  submitOnboarding: () => submitOnboarding(),
}))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <HomePage />
    </QueryClientProvider>,
  )
}

const FRESH_PROFILE: ProfileData = {
  status: 'REGISTERED',
  onboardingStep: 'REGISTERED',
  businessName: 'Roe Cafe',
  primaryCategoryId: null,
  description: null,
}

beforeEach(() => {
  push.mockReset()
  submitOnboarding.mockReset()
  mockChecklist = { branch_created: false, contract_signed: false, rmv_configured: false, all_complete: false }
  mockStatus = { status: null, comment: null, actionedAt: null }
  mockRmvCount = 0
})

describe('HomePage (M2 F1 staircase hub + lifecycle homes)', () => {
  it('renders the loading state while the profile is loading', () => {
    mockProfile = { data: undefined, isLoading: true }
    renderPage()
    expect(screen.getByText(/loading your account/i)).toBeInTheDocument()
  })

  it('renders the error state with a working Retry', () => {
    const refetch = jest.fn()
    mockProfile = { data: undefined, isLoading: false, isError: true, refetch }
    renderPage()
    expect(screen.getByText(/we could not load your account/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('renders the setup staircase hub for a fresh registered merchant', async () => {
    mockProfile = { data: FRESH_PROFILE, isLoading: false }
    renderPage()
    expect(await screen.findByText(/get your business live/i)).toBeInTheDocument()
    expect(screen.getByText(/choose your category/i)).toBeInTheDocument()
  })

  it('navigates to a step sub-route when its action is clicked', async () => {
    mockProfile = { data: FRESH_PROFILE, isLoading: false }
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /choose a category/i }))
    expect(push).toHaveBeenCalledWith('/onboarding/category')
  })

  it('renders the changes hub with the dynamic admin comment for NEEDS_CHANGES', async () => {
    mockProfile = {
      data: { ...FRESH_PROFILE, onboardingStep: 'NEEDS_CHANGES' },
      isLoading: false,
    }
    mockStatus = { status: 'CHANGES_REQUESTED', comment: 'Please confirm the branch location.', actionedAt: null }
    renderPage()
    expect(await screen.findByText(/please confirm the branch location/i)).toBeInTheDocument()
  })

  it('renders the submitted read-only home (no comment shown)', async () => {
    mockProfile = {
      data: { ...FRESH_PROFILE, status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED' },
      isLoading: false,
    }
    mockStatus = { status: 'PENDING', comment: 'Merchant submitted for onboarding approval', actionedAt: null }
    renderPage()
    expect(await screen.findByText(/we are reviewing/i)).toBeInTheDocument()
    expect(screen.queryByText(/merchant submitted for onboarding approval/i)).not.toBeInTheDocument()
  })

  it('renders the rejected read-only home with the reason', async () => {
    mockProfile = {
      data: { ...FRESH_PROFILE, status: 'INACTIVE', onboardingStep: 'REJECTED' },
      isLoading: false,
    }
    mockStatus = { status: 'REJECTED', comment: 'We could not verify the business.', actionedAt: null }
    renderPage()
    expect(await screen.findByText(/not approved/i)).toBeInTheDocument()
    // the reason arrives from the async onboarding-status read
    expect(await screen.findByText(/could not verify the business/i)).toBeInTheDocument()
  })

  it('renders the suspended read-only home', async () => {
    mockProfile = {
      data: { ...FRESH_PROFILE, status: 'SUSPENDED', onboardingStep: 'LIVE' },
      isLoading: false,
    }
    renderPage()
    expect(await screen.findByText(/your account is suspended/i)).toBeInTheDocument()
  })

  it('renders the live celebratory home for an active merchant', async () => {
    mockProfile = { data: { ...FRESH_PROFILE, status: 'ACTIVE', onboardingStep: 'LIVE' }, isLoading: false }
    renderPage()
    expect(await screen.findByText(/your business is live/i)).toBeInTheDocument()
  })

  it('submits onboarding from the confirm modal when all steps are done', async () => {
    mockProfile = {
      data: { ...FRESH_PROFILE, primaryCategoryId: 'c1', description: 'Tasty.' },
      isLoading: false,
    }
    mockChecklist = { branch_created: true, contract_signed: true, rmv_configured: true, all_complete: true }
    mockRmvCount = 2
    submitOnboarding.mockResolvedValueOnce({ updated: { id: 'm1' } })
    renderPage()
    // Wait for the onboarding reads to resolve so submit becomes enabled.
    const submitBtn = await screen.findByRole('button', { name: /submit for review/i })
    await waitFor(() => expect(submitBtn).toBeEnabled())
    fireEvent.click(submitBtn)
    const panel = await screen.findByTestId('submit-confirm-panel')
    fireEvent.click(panel.querySelector('input[type="checkbox"]')!)
    fireEvent.click(panel.querySelector('button:last-of-type')!)
    await waitFor(() => expect(submitOnboarding).toHaveBeenCalledTimes(1))
  })
})
