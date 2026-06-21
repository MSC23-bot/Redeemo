import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CategoryPage from '@/app/(app)/onboarding/category/page'
import { ApiError } from '@/lib/api/client'
import type { OnboardingTaxonomy } from '@/lib/api/taxonomy'

jest.mock('@/lib/auth/session', () => ({ useSession: () => ({ isAuthenticated: true }) }))

const push = jest.fn()
const replace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }))

interface ProfileData {
  status: string
  onboardingStep: string
  businessName: string
  primaryCategoryId: string | null
  primaryDescriptorTagId: string | null
  description: string | null
}
let mockProfile: { data?: ProfileData; isLoading: boolean; isError?: boolean; refetch?: () => void }
jest.mock('@/lib/auth/useMerchantProfile', () => ({ useMerchantProfile: () => mockProfile }))

const TAXONOMY: OnboardingTaxonomy = {
  categories: [
    {
      id: 'cat-food',
      name: 'Food & Drink',
      parentId: null,
      eligible: true,
      subcategories: [
        {
          id: 'sub-restaurant',
          name: 'Restaurant',
          parentId: 'cat-food',
          tags: [
            { id: 'cui-italian', label: 'Italian', type: 'CUISINE', isPrimaryEligible: true },
            { id: 'spec-brunch', label: 'Brunch', type: 'SPECIALTY', isPrimaryEligible: false },
          ],
        },
      ],
    },
    {
      id: 'cat-beauty',
      name: 'Beauty & Wellness',
      parentId: null,
      eligible: true,
      subcategories: [
        {
          id: 'sub-barber',
          name: 'Barber',
          parentId: 'cat-beauty',
          tags: [{ id: 'spec-skin-fade', label: 'Skin Fade', type: 'SPECIALTY', isPrimaryEligible: false }],
        },
      ],
    },
  ],
}

const getTaxonomy = jest.fn()
const setIdentity = jest.fn()
jest.mock('@/lib/api/taxonomy', () => ({
  getOnboardingTaxonomy: () => getTaxonomy(),
  setMerchantIdentity: (body: unknown) => setIdentity(body),
}))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let invalidateSpy: jest.SpyInstance
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  invalidateSpy = jest.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined)
  return render(
    <QueryClientProvider client={qc}>
      <CategoryPage />
    </QueryClientProvider>,
  )
}

const FRESH_PROFILE: ProfileData = {
  status: 'REGISTERED',
  onboardingStep: 'REGISTERED',
  businessName: 'Roe Cafe',
  primaryCategoryId: null,
  primaryDescriptorTagId: null,
  description: null,
}

const refetch = jest.fn().mockResolvedValue(undefined)

beforeEach(() => {
  push.mockReset()
  replace.mockReset()
  refetch.mockClear()
  getTaxonomy.mockReset().mockResolvedValue(TAXONOMY)
  setIdentity.mockReset().mockResolvedValue({ id: 'm1' })
  mockProfile = { data: FRESH_PROFILE, isLoading: false, refetch }
})

describe('CategoryPage (M2 F2 route)', () => {
  it('shows the loading state while the taxonomy is loading', () => {
    mockProfile = { data: FRESH_PROFILE, isLoading: false }
    getTaxonomy.mockReturnValue(new Promise(() => {})) // never resolves
    renderPage()
    expect(screen.getByText(/loading your categories/i)).toBeInTheDocument()
  })

  it('renders the form once the taxonomy resolves', async () => {
    renderPage()
    expect(await screen.findByText(/choose your category/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /food & drink/i })).toBeInTheDocument()
  })

  it('saves the identity then invalidates caches and routes back to the hub', async () => {
    renderPage()
    await screen.findByRole('button', { name: /food & drink/i })
    fireEvent.click(screen.getByRole('button', { name: /food & drink/i }))
    fireEvent.click(screen.getByRole('button', { name: /^restaurant$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^italian$/i }))
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))

    await waitFor(() =>
      expect(setIdentity).toHaveBeenCalledWith({
        subcategoryId: 'sub-restaurant',
        primaryDescriptorTagId: 'cui-italian',
        specialtyTagIds: [],
      }),
    )
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['merchantProfile'] })
  })

  it('navigates back to the hub from the Back button', async () => {
    renderPage()
    await screen.findByRole('button', { name: /back to dashboard/i })
    fireEvent.click(screen.getByRole('button', { name: /back to dashboard/i }))
    expect(push).toHaveBeenCalledWith('/')
  })

  it('surfaces the draft-window 409 (IDENTITY_EDIT_REQUIRES_DRAFT) with a clear message', async () => {
    setIdentity.mockRejectedValueOnce(new ApiError(409, { error: { code: 'IDENTITY_EDIT_REQUIRES_DRAFT' } }))
    renderPage()
    await screen.findByRole('button', { name: /food & drink/i })
    fireEvent.click(screen.getByRole('button', { name: /food & drink/i }))
    fireEvent.click(screen.getByRole('button', { name: /^restaurant$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^italian$/i }))
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/can only be changed while your application is in draft/i)
    expect(push).not.toHaveBeenCalledWith('/')
  })

  it('surfaces TAG_NOT_ELIGIBLE defensively', async () => {
    setIdentity.mockRejectedValueOnce(new ApiError(400, { error: { code: 'TAG_NOT_ELIGIBLE' } }))
    renderPage()
    await screen.findByRole('button', { name: /food & drink/i })
    fireEvent.click(screen.getByRole('button', { name: /food & drink/i }))
    fireEvent.click(screen.getByRole('button', { name: /^restaurant$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^italian$/i }))
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/not available for this subcategory/i)
  })

  it('shows the change-confirm when an existing identity changes top-level category, then saves on confirm', async () => {
    mockProfile = {
      data: {
        ...FRESH_PROFILE,
        primaryCategoryId: 'sub-restaurant',
        primaryDescriptorTagId: 'cui-italian',
        description: 'Tasty.',
      },
      isLoading: false,
      refetch,
    }
    renderPage()
    await screen.findByRole('button', { name: /beauty & wellness/i })
    fireEvent.click(screen.getByRole('button', { name: /beauty & wellness/i }))
    fireEvent.click(screen.getByRole('button', { name: /^barber$/i }))
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    // confirm dialog up; not saved yet
    expect(setIdentity).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /choose a new category/i }))
    await waitFor(() =>
      expect(setIdentity).toHaveBeenCalledWith({
        subcategoryId: 'sub-barber',
        primaryDescriptorTagId: null,
        specialtyTagIds: [],
      }),
    )
  })

  it('shows the taxonomy error state with a retry', async () => {
    getTaxonomy.mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByText(/could not load your categories/i)).toBeInTheDocument()
  })
})
