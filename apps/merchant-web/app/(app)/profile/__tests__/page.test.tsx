/**
 * Business Profile M2: the page-level orchestrator. Mirrors the Branches page
 * pattern - loading / error (with Try again) / success states, delegating the
 * resolved profile to <BusinessProfileScreen>.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import BusinessProfilePage from '@/app/(app)/profile/page'

const getMerchantProfile = jest.fn()
jest.mock('@/lib/api/profile', () => {
  const actual = jest.requireActual('@/lib/api/profile')
  return { ...actual, getMerchantProfile: () => getMerchantProfile() }
})

jest.mock('@/lib/auth/session', () => ({
  useSession: () => ({ isAuthenticated: true }),
}))

jest.mock('@/lib/api/taxonomy', () => ({
  getOnboardingTaxonomy: () => Promise.resolve({ categories: [] }),
}))

function profile(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    businessName: 'The Old Foundry Kitchen Ltd',
    status: 'ACTIVE',
    onboardingStep: 'LIVE',
    primaryCategoryId: null,
    primaryDescriptorTagId: null,
    description: null,
    tradingName: null,
    logoUrl: null,
    bannerUrl: null,
    websiteUrl: null,
    vatNumber: null,
    companyNumber: null,
    ownerContact: null,
    agreement: null,
    pendingEdits: [],
    ...over,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BusinessProfilePage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getMerchantProfile.mockReset()
})

describe('BusinessProfilePage', () => {
  it('renders a loading state while the profile is in flight', () => {
    getMerchantProfile.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders an error state with a Try again control', async () => {
    getMerchantProfile.mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('refetches when Try again is pressed', async () => {
    getMerchantProfile.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(profile())
    renderPage()
    await screen.findByRole('alert')
    getMerchantProfile.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(getMerchantProfile).toHaveBeenCalled())
  })

  it('renders the real BusinessProfileScreen once the profile resolves', async () => {
    getMerchantProfile.mockResolvedValue(profile())
    renderPage()
    expect(await screen.findByTestId('business-profile-screen')).toBeInTheDocument()
  })

  it('renders the page header copy', async () => {
    getMerchantProfile.mockResolvedValue(profile())
    renderPage()
    expect(screen.getByRole('heading', { name: 'Business profile' })).toBeInTheDocument()
    await screen.findByTestId('business-profile-screen')
  })
})
