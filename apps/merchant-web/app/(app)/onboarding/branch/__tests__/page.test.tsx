import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BranchPage from '@/app/(app)/onboarding/branch/page'
import { ApiError } from '@/lib/api/client'

jest.mock('@/lib/auth/session', () => ({ useSession: () => ({ isAuthenticated: true }) }))

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

// Lifecycle source: drives the merchant's primaryCategoryId (the amenity catalog key)
// + the business description (the about prefill) + a head-office address prefill.
interface ProfileData {
  status: string
  onboardingStep: string
  primaryCategoryId: string | null
  description: string | null
}
let mockProfile: { data?: ProfileData; isLoading: boolean; isError?: boolean; refetch?: () => void }
jest.mock('@/lib/auth/useMerchantProfile', () => ({ useMerchantProfile: () => mockProfile }))

// B5 upload stubbed at the page level. The stub fires onUploaded with a kind-keyed
// URL so the branch banner + photo flows can be exercised through the page.
jest.mock('@/components/ui/file-upload', () => ({
  FileUpload: ({
    kind,
    label,
    onUploaded,
  }: {
    kind: string
    label: string
    onUploaded?: (url: string) => void
  }) => (
    <button type="button" aria-label={label} onClick={() => onUploaded?.(`https://cdn.test/${kind}.png`)}>
      {label}
    </button>
  ),
}))

const listBranches = jest.fn()
const createBranch = jest.fn()
const setBranchHours = jest.fn()
const getBranchAmenities = jest.fn()
const setBranchAmenities = jest.fn()
const getBranchPin = jest.fn()
const setBranchPin = jest.fn()
const requestBranchPhotoEdit = jest.fn()
jest.mock('@/lib/api/branch', () => ({
  listBranches: () => listBranches(),
  createBranch: (body: unknown) => createBranch(body),
  setBranchHours: (id: string, hours: unknown) => setBranchHours(id, hours),
  getBranchAmenities: (catId: string) => getBranchAmenities(catId),
  setBranchAmenities: (id: string, ids: unknown) => setBranchAmenities(id, ids),
  getBranchPin: (id: string) => getBranchPin(id),
  setBranchPin: (id: string, pin: string) => setBranchPin(id, pin),
  requestBranchPhotoEdit: (id: string, urls: unknown) => requestBranchPhotoEdit(id, urls),
}))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '@/components/ui/toast'

let invalidateSpy: jest.SpyInstance
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  invalidateSpy = jest.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined)
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <BranchPage />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

const refetch = jest.fn().mockResolvedValue(undefined)
const FRESH_PROFILE: ProfileData = {
  status: 'REGISTERED',
  onboardingStep: 'REGISTERED',
  primaryCategoryId: 'cat-restaurant',
  description: 'A lovely family kitchen.',
}

function fillCreateMinimum() {
  fireEvent.change(screen.getByLabelText(/branch name/i), { target: { value: 'Old Foundry' } })
  fireEvent.change(screen.getByLabelText(/address line 1/i), { target: { value: '12 Mill Lane' } })
  fireEvent.change(screen.getByLabelText(/^town or city/i), { target: { value: 'Huddersfield' } })
  fireEvent.change(screen.getByLabelText(/postcode/i), { target: { value: 'HD1 1AA' } })
}

beforeEach(() => {
  push.mockReset()
  refetch.mockClear()
  listBranches.mockReset().mockResolvedValue([])
  createBranch.mockReset().mockResolvedValue({ id: 'b1', name: 'Old Foundry' })
  setBranchHours.mockReset().mockResolvedValue({ ok: true })
  getBranchAmenities.mockReset().mockResolvedValue([
    { id: 'a1', name: 'Free wifi', iconUrl: null, isActive: true },
  ])
  setBranchAmenities.mockReset().mockResolvedValue({ ok: true })
  getBranchPin.mockReset().mockResolvedValue({ pin: null })
  setBranchPin.mockReset().mockResolvedValue({ message: 'PIN updated' })
  requestBranchPhotoEdit.mockReset().mockResolvedValue({ id: 'pe1' })
  mockProfile = { data: FRESH_PROFILE, isLoading: false, refetch }
})

describe('BranchPage (M2 F4 route)', () => {
  it('shows a loading state while the profile is loading', () => {
    mockProfile = { data: undefined, isLoading: true }
    renderPage()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('loads the amenity catalog keyed by the merchant primaryCategoryId', async () => {
    renderPage()
    await waitFor(() => expect(getBranchAmenities).toHaveBeenCalledWith('cat-restaurant'))
    expect(await screen.findByRole('button', { name: /free wifi/i })).toBeInTheDocument()
  })

  it('Save and continue creates the branch then sets hours, amenities and pin, then routes to the hub', async () => {
    renderPage()
    await screen.findByLabelText(/branch name/i)
    fillCreateMinimum()
    fireEvent.change(screen.getByLabelText(/redemption pin/i), { target: { value: '4821' } })
    fireEvent.click(screen.getByRole('button', { name: /free wifi/i }))
    // Close Sunday so the payload genuinely carries a closed day (verifies the
    // omit-not-null serialization). The form defaults every day open.
    fireEvent.click(screen.getByRole('switch', { name: /open on sunday/i }))

    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))

    await waitFor(() => expect(createBranch).toHaveBeenCalledTimes(1))
    // The create body carries name + the address fields (the create-minimum).
    expect(createBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Old Foundry',
        addressLine1: '12 Mill Lane',
        city: 'Huddersfield',
        postcode: 'HD1 1AA',
      }),
    )
    await waitFor(() => expect(setBranchHours).toHaveBeenCalledWith('b1', expect.any(Array)))
    // Critical: closed Sunday omits time keys (no null).
    const hoursArg = setBranchHours.mock.calls[0][1] as Array<Record<string, unknown>>
    const sunday = hoursArg.find((r) => r.dayOfWeek === 0)!
    expect(sunday.isClosed).toBe(true)
    expect('openTime' in sunday).toBe(false)
    expect('closeTime' in sunday).toBe(false)

    await waitFor(() => expect(setBranchAmenities).toHaveBeenCalledWith('b1', ['a1']))
    await waitFor(() => expect(setBranchPin).toHaveBeenCalledWith('b1', '4821'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['onboardingChecklist'] })
  })

  it('routes the branch photos through the governed photo edit-request lane', async () => {
    renderPage()
    await screen.findByLabelText(/branch name/i)
    fillCreateMinimum()
    fireEvent.click(screen.getByRole('button', { name: /add a branch photo/i }))
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))

    await waitFor(() => expect(requestBranchPhotoEdit).toHaveBeenCalledWith('b1', expect.any(Array)))
    expect(requestBranchPhotoEdit.mock.calls[0][1]).toHaveLength(1)
  })

  it('does NOT call the photo edit-request lane when no photos were added', async () => {
    renderPage()
    await screen.findByLabelText(/branch name/i)
    fillCreateMinimum()
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    await waitFor(() => expect(createBranch).toHaveBeenCalled())
    expect(requestBranchPhotoEdit).not.toHaveBeenCalled()
  })

  it('Save and finish later creates the branch once the minimum exists, persists what is filled, then routes to the hub', async () => {
    renderPage()
    await screen.findByLabelText(/branch name/i)
    fillCreateMinimum()
    fireEvent.click(screen.getByRole('button', { name: /save and finish later/i }))

    await waitFor(() => expect(createBranch).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'))
  })

  it('Save and finish later WITHOUT the create-minimum does not call createBranch and surfaces a note', async () => {
    renderPage()
    await screen.findByLabelText(/branch name/i)
    // Only a phone filled; name/address missing.
    fireEvent.change(screen.getByLabelText(/branch phone/i), { target: { value: '+441484000000' } })
    fireEvent.click(screen.getByRole('button', { name: /save and finish later/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/add a branch name and address/i)
    })
    expect(createBranch).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('updates an EXISTING branch instead of creating a second one when one already exists', async () => {
    listBranches.mockResolvedValueOnce([
      {
        id: 'b1',
        name: 'Old Foundry',
        isMainBranch: true,
        addressLine1: '12 Mill Lane',
        addressLine2: null,
        city: 'Huddersfield',
        postcode: 'HD1 1AA',
        phone: '+441484000000',
        email: null,
        websiteUrl: null,
        about: null,
        bannerUrl: null,
        openingHours: [],
        amenities: [],
        photos: [],
      },
    ])
    renderPage()
    await waitFor(() => expect(screen.getByLabelText(/branch name/i)).toHaveValue('Old Foundry'))
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    // Branch already exists -> no second create; still sets hours/amenities/pin on b1.
    await waitFor(() => expect(setBranchHours).toHaveBeenCalledWith('b1', expect.any(Array)))
    expect(createBranch).not.toHaveBeenCalled()
  })

  it('surfaces a backend opening-hours error from the hours POST', async () => {
    setBranchHours.mockRejectedValueOnce(new ApiError(400, { error: { code: 'OPENING_HOURS_INVALID' } }))
    renderPage()
    await screen.findByLabelText(/branch name/i)
    fillCreateMinimum()
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/opening hours/i)
    expect(push).not.toHaveBeenCalledWith('/')
  })

  it('surfaces a generic error on an unknown create failure', async () => {
    createBranch.mockRejectedValueOnce(new ApiError(500, { error: { code: 'INTERNAL' } }))
    renderPage()
    await screen.findByLabelText(/branch name/i)
    fillCreateMinimum()
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save your branch/i)
  })

  it('prefills the PIN from the existing branch', async () => {
    listBranches.mockResolvedValueOnce([
      {
        id: 'b1', name: 'Old Foundry', isMainBranch: true, addressLine1: '12 Mill Lane',
        addressLine2: null, city: 'Huddersfield', postcode: 'HD1 1AA', phone: null, email: null,
        websiteUrl: null, about: null, bannerUrl: null, openingHours: [], amenities: [], photos: [],
      },
    ])
    getBranchPin.mockResolvedValueOnce({ pin: '5566' })
    renderPage()
    await waitFor(() => expect(getBranchPin).toHaveBeenCalledWith('b1'))
    await waitFor(() => expect(screen.getByLabelText(/redemption pin/i)).toHaveValue('5566'))
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
    expect(await screen.findByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})
