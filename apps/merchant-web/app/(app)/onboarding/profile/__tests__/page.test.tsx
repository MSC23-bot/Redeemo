import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ProfilePage from '@/app/(app)/onboarding/profile/page'
import { ApiError } from '@/lib/api/client'

jest.mock('@/lib/auth/session', () => ({ useSession: () => ({ isAuthenticated: true }) }))

const push = jest.fn()
const replace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }))

interface ProfileData {
  status: string
  onboardingStep: string
  businessName: string
  tradingName: string | null
  description: string | null
  websiteUrl: string | null
  companyNumber: string | null
  vatNumber: string | null
  logoUrl: string | null
  bannerUrl: string | null
}
let mockProfile: { data?: ProfileData; isLoading: boolean; isError?: boolean; refetch?: () => void }
jest.mock('@/lib/auth/useMerchantProfile', () => ({ useMerchantProfile: () => mockProfile }))

// The B5 upload is exercised by the form-level test; here we stub it so the page test
// is focused on prefill + the dual-CTA PATCH + routing.
jest.mock('@/components/ui/file-upload', () => ({
  FileUpload: ({ label }: { label: string }) => <button type="button" aria-label={label}>{label}</button>,
}))

const updateProfile = jest.fn()
jest.mock('@/lib/api/profile', () => ({
  updateMerchantProfile: (body: unknown) => updateProfile(body),
}))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let invalidateSpy: jest.SpyInstance
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  invalidateSpy = jest.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined)
  return render(
    <QueryClientProvider client={qc}>
      <ProfilePage />
    </QueryClientProvider>,
  )
}

const refetch = jest.fn().mockResolvedValue(undefined)

const FRESH_PROFILE: ProfileData = {
  status: 'REGISTERED',
  onboardingStep: 'REGISTERED',
  businessName: 'Old Foundry Kitchen Ltd',
  tradingName: null,
  description: null,
  websiteUrl: null,
  companyNumber: null,
  vatNumber: null,
  logoUrl: null,
  bannerUrl: null,
}

beforeEach(() => {
  push.mockReset()
  replace.mockReset()
  refetch.mockClear()
  updateProfile.mockReset().mockResolvedValue({ id: 'm1' })
  mockProfile = { data: FRESH_PROFILE, isLoading: false, refetch }
})

describe('ProfilePage (M2 F3 route)', () => {
  it('shows the loading state while the profile is loading', () => {
    mockProfile = { data: undefined, isLoading: true }
    renderPage()
    expect(screen.getByText(/loading your profile/i)).toBeInTheDocument()
  })

  it('prefills the registered business name from the profile read', async () => {
    renderPage()
    expect(await screen.findByLabelText(/registered business name/i)).toHaveValue('Old Foundry Kitchen Ltd')
  })

  it('Save and continue PATCHes the Tier-1 body then invalidates caches and routes to the hub', async () => {
    renderPage()
    const desc = await screen.findByLabelText(/business description/i)
    fireEvent.change(desc, { target: { value: 'We serve great food.' } })
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          businessName: 'Old Foundry Kitchen Ltd',
          description: 'We serve great food.',
        }),
      ),
    )
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['merchantProfile'] })
  })

  it('Save and finish later PATCHes the partial values and routes to the hub even with description empty', async () => {
    renderPage()
    await screen.findByLabelText(/registered business name/i)
    fireEvent.change(screen.getByLabelText(/trading name/i), { target: { value: 'Old Foundry' } })
    fireEvent.click(screen.getByRole('button', { name: /save and finish later/i }))

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1))
    expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ tradingName: 'Old Foundry' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'))
  })

  it('handles the SENSITIVE_FIELDS_REQUIRE_EDIT_REQUEST error defensively', async () => {
    updateProfile.mockRejectedValueOnce(
      new ApiError(403, { error: { code: 'SENSITIVE_FIELDS_REQUIRE_EDIT_REQUEST' } }),
    )
    renderPage()
    const desc = await screen.findByLabelText(/business description/i)
    fireEvent.change(desc, { target: { value: 'We serve great food.' } })
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/while your application is in draft/i)
    expect(push).not.toHaveBeenCalledWith('/')
  })

  it('surfaces a generic error on an unknown failure', async () => {
    updateProfile.mockRejectedValueOnce(new ApiError(500, { error: { code: 'INTERNAL' } }))
    renderPage()
    const desc = await screen.findByLabelText(/business description/i)
    fireEvent.change(desc, { target: { value: 'We serve great food.' } })
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save your profile/i)
  })

  it('navigates back to the hub from the Back button', async () => {
    renderPage()
    await screen.findByRole('button', { name: /back to dashboard/i })
    fireEvent.click(screen.getByRole('button', { name: /back to dashboard/i }))
    expect(push).toHaveBeenCalledWith('/')
  })

  it('shows the profile error state with a retry', async () => {
    mockProfile = { data: undefined, isLoading: false, isError: true, refetch }
    renderPage()
    expect(await screen.findByText(/could not load your profile/i)).toBeInTheDocument()
  })
})
