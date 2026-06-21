import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ContractPage from '@/app/(app)/onboarding/contract/page'
import { ApiError } from '@/lib/api/client'

jest.mock('@/lib/auth/session', () => ({ useSession: () => ({ isAuthenticated: true }) }))

const push = jest.fn()
const replace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }))

interface ProfileData {
  status: string
  onboardingStep: string
  businessName: string
  contactName?: string | null
}
let mockProfile: { data?: ProfileData; isLoading: boolean; isError?: boolean; refetch?: () => void }
jest.mock('@/lib/auth/useMerchantProfile', () => ({ useMerchantProfile: () => mockProfile }))

const getContract = jest.fn()
const acceptContract = jest.fn()
const submitOnboarding = jest.fn()
jest.mock('@/lib/api/onboarding', () => ({
  getContract: () => getContract(),
  acceptContract: (version: string) => acceptContract(version),
  submitOnboarding: () => submitOnboarding(),
}))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let invalidateSpy: jest.SpyInstance
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  invalidateSpy = jest.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined)
  return render(
    <QueryClientProvider client={qc}>
      <ContractPage />
    </QueryClientProvider>,
  )
}

const refetch = jest.fn().mockResolvedValue(undefined)

const FRESH_PROFILE: ProfileData = {
  status: 'REGISTERED',
  onboardingStep: 'REGISTERED',
  businessName: 'Old Foundry Kitchen Ltd',
}

const CONTRACT = {
  version: '1.0',
  text: 'Redeemo Merchant Agreement v1.0\n\nBacked text from the server.',
}

function signTheForm() {
  fireEvent.click(screen.getByRole('checkbox', { name: /i have read and agree/i }))
  fireEvent.change(screen.getByLabelText(/type your full name to sign/i), {
    target: { value: 'James Whitfield' },
  })
  fireEvent.click(screen.getByRole('button', { name: /agree and continue/i }))
}

beforeEach(() => {
  push.mockReset()
  replace.mockReset()
  refetch.mockClear()
  getContract.mockReset().mockResolvedValue(CONTRACT)
  acceptContract.mockReset().mockResolvedValue({ accepted: true })
  submitOnboarding.mockReset().mockResolvedValue({})
  mockProfile = { data: FRESH_PROFILE, isLoading: false, refetch }
})

describe('ContractPage (M2 F6 route)', () => {
  it('shows the loading state while the contract is loading', () => {
    getContract.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('fetches and renders the agreement step once the contract loads', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: /sign the merchant agreement/i })).toBeInTheDocument()
    expect(getContract).toHaveBeenCalledTimes(1)
  })

  it('accepts the contract with the fetched version, then shows the signed state', async () => {
    renderPage()
    await screen.findByRole('heading', { name: /sign the merchant agreement/i })
    signTheForm()

    await waitFor(() => expect(acceptContract).toHaveBeenCalledWith('1.0'))
    expect(await screen.findByRole('heading', { name: /your agreement is signed/i })).toBeInTheDocument()
  })

  it('does NOT auto-submit the business on accept (the F1 hub Submit is the final action)', async () => {
    renderPage()
    await screen.findByRole('heading', { name: /sign the merchant agreement/i })
    signTheForm()

    await waitFor(() => expect(acceptContract).toHaveBeenCalledTimes(1))
    // The crucial invariant: signing the agreement step never calls submit.
    expect(submitOnboarding).not.toHaveBeenCalled()
  })

  it('invalidates the onboarding reads and routes back to the hub after signing', async () => {
    renderPage()
    await screen.findByRole('heading', { name: /sign the merchant agreement/i })
    signTheForm()

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['onboardingChecklist'] }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'))
  })

  it('handles CONTRACT_ALREADY_SIGNED defensively by showing the signed state', async () => {
    acceptContract.mockRejectedValueOnce(new ApiError(409, { error: { code: 'CONTRACT_ALREADY_SIGNED' } }))
    renderPage()
    await screen.findByRole('heading', { name: /sign the merchant agreement/i })
    signTheForm()

    expect(await screen.findByRole('heading', { name: /your agreement is signed/i })).toBeInTheDocument()
    expect(submitOnboarding).not.toHaveBeenCalled()
  })

  it('surfaces a generic error on an unknown accept failure and stays on the form', async () => {
    acceptContract.mockRejectedValueOnce(new ApiError(500, { error: { code: 'INTERNAL' } }))
    renderPage()
    await screen.findByRole('heading', { name: /sign the merchant agreement/i })
    signTheForm()

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not record your agreement/i)
    expect(push).not.toHaveBeenCalledWith('/')
  })

  it('navigates back to the hub from the Back button', async () => {
    renderPage()
    await screen.findByRole('button', { name: /back to dashboard/i })
    fireEvent.click(screen.getByRole('button', { name: /back to dashboard/i }))
    expect(push).toHaveBeenCalledWith('/')
  })

  it('shows the contract error state with a retry when the fetch fails', async () => {
    getContract.mockRejectedValue(new ApiError(500, { error: { code: 'INTERNAL' } }))
    renderPage()
    expect(await screen.findByText(/could not load/i)).toBeInTheDocument()
  })
})
