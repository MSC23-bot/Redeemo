/**
 * Business Profile M3: the "Business category" card + its "Change category" flow.
 * OWNER-only gating on the button; the change flow round-trips through the shared
 * updateMerchantProfile mutation - unconfirmed change -> confirm dialog (backend
 * message) -> confirmed change; CATEGORY_CHANGE_BLOCKED surfaces a locked state the
 * user cannot proceed past.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BusinessCategoryCard } from '@/components/business-profile/sections/BusinessCategoryCard'
import { ApiError } from '@/lib/api/client'
import type { MerchantProfile } from '@/lib/api/profile'

const getOnboardingTaxonomy = jest.fn()
jest.mock('@/lib/api/taxonomy', () => ({
  getOnboardingTaxonomy: () => getOnboardingTaxonomy(),
}))

// --- the M3 mutation hook ----------------------------------------------------
const mutateAsync = jest.fn()
let isPending = false
jest.mock('@/lib/business-profile/useUpdateMerchantProfile', () => ({
  useUpdateMerchantProfile: () => ({ mutateAsync, isPending }),
}))

function taxonomy() {
  return {
    categories: [
      {
        id: 'cat-food',
        name: 'Food & Drink',
        parentId: null,
        eligible: true,
        subcategories: [
          { id: 'sub-restaurant', name: 'Restaurant', parentId: 'cat-food', tags: [] },
          { id: 'sub-cafe', name: 'Cafe & Coffee', parentId: 'cat-food', tags: [] },
        ],
      },
      {
        id: 'cat-retail',
        name: 'Retail',
        parentId: null,
        eligible: true,
        subcategories: [{ id: 'sub-shop', name: 'Shop', parentId: 'cat-retail', tags: [] }],
      },
    ],
  }
}

function profile(over: Partial<MerchantProfile> = {}): MerchantProfile {
  return {
    id: 'm1',
    businessName: 'The Old Foundry Kitchen Ltd',
    status: 'ACTIVE',
    onboardingStep: 'LIVE',
    primaryCategoryId: 'sub-restaurant',
    primaryDescriptorTagId: null,
    viewerCapabilities: { canViewInsights: true, role: 'OWNER' },
    ...over,
  } as MerchantProfile
}

function renderCard(p: MerchantProfile) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BusinessCategoryCard profile={p} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getOnboardingTaxonomy.mockReset().mockResolvedValue(taxonomy())
  mutateAsync.mockReset()
  isPending = false
})

describe('BusinessCategoryCard owner gating', () => {
  it('does not render the Change category button for a non-owner viewer', async () => {
    renderCard(profile({ viewerCapabilities: { canViewInsights: true, role: 'BRANCH_MANAGER' } }))
    await screen.findByTestId('business-profile-category-card')
    expect(screen.queryByTestId('business-category-change')).not.toBeInTheDocument()
  })

  it('does not render the Change category button when viewerCapabilities is absent (fail closed)', async () => {
    renderCard(profile({ viewerCapabilities: undefined }))
    await screen.findByTestId('business-profile-category-card')
    expect(screen.queryByTestId('business-category-change')).not.toBeInTheDocument()
  })

  it('renders a live Change category button for an OWNER viewer once the taxonomy loads', async () => {
    renderCard(profile())
    await waitFor(() => expect(screen.getByTestId('business-category-change')).toBeEnabled())
  })
})

describe('BusinessCategoryCard change-category flow', () => {
  it('opens the picker, then round-trips through an unconfirmed -> confirm -> confirmed change', async () => {
    mutateAsync
      .mockResolvedValueOnce({
        requiresConfirmation: true,
        message: 'Changing category will discard your existing RMV drafts. Re-send with confirm: true to proceed.',
      })
      .mockResolvedValueOnce({ id: 'm1', primaryCategoryId: 'sub-cafe' })

    renderCard(profile())
    await waitFor(() => expect(screen.getByTestId('business-category-change')).toBeEnabled())
    fireEvent.click(screen.getByTestId('business-category-change'))

    const panel = await screen.findByTestId('category-change-panel')
    // Pick a DIFFERENT subcategory within the same top-level category.
    fireEvent.click(within(panel).getByText('Cafe & Coffee'))
    fireEvent.click(screen.getByTestId('category-change-save'))

    // Unconfirmed response -> the confirm dialog shows the backend's exact message.
    const confirmPanel = await screen.findByTestId('category-change-confirm-panel')
    expect(within(confirmPanel).getByTestId('category-change-confirm-message')).toHaveTextContent(
      /discard your existing rmv drafts/i,
    )
    expect(mutateAsync).toHaveBeenNthCalledWith(1, { primaryCategoryId: 'sub-cafe' })

    fireEvent.click(screen.getByTestId('category-change-confirm-submit'))

    await waitFor(() => expect(mutateAsync).toHaveBeenNthCalledWith(2, { primaryCategoryId: 'sub-cafe', confirm: true }))
    // A successful (non-requiresConfirmation) result closes the modal.
    await waitFor(() => expect(screen.queryByTestId('category-change-panel')).not.toBeInTheDocument())
    expect(screen.queryByTestId('category-change-confirm-panel')).not.toBeInTheDocument()
  })

  it('changing to a category with no confirmation requirement saves and closes directly (e.g. first-time set)', async () => {
    mutateAsync.mockResolvedValueOnce({ id: 'm1', primaryCategoryId: 'sub-shop' })

    renderCard(profile({ primaryCategoryId: null }))
    await waitFor(() => expect(screen.getByTestId('business-category-change')).toBeEnabled())
    fireEvent.click(screen.getByTestId('business-category-change'))

    const panel = await screen.findByTestId('category-change-panel')
    fireEvent.click(within(panel).getByText('Retail'))
    fireEvent.click(within(panel).getByText('Shop'))
    fireEvent.click(screen.getByTestId('category-change-save'))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ primaryCategoryId: 'sub-shop' }))
    await waitFor(() => expect(screen.queryByTestId('category-change-panel')).not.toBeInTheDocument())
  })

  it('disables Save until a DIFFERENT subcategory than the current one is picked', async () => {
    renderCard(profile())
    await waitFor(() => expect(screen.getByTestId('business-category-change')).toBeEnabled())
    fireEvent.click(screen.getByTestId('business-category-change'))

    await screen.findByTestId('category-change-panel')
    // The current subcategory (Restaurant) is pre-selected; Save should be disabled.
    expect(screen.getByTestId('category-change-save')).toBeDisabled()
  })

  it('surfaces CATEGORY_CHANGE_BLOCKED as a locked state the user cannot proceed past', async () => {
    mutateAsync.mockRejectedValueOnce(new ApiError(400, { code: 'CATEGORY_CHANGE_BLOCKED', message: 'blocked' }))

    renderCard(profile())
    await waitFor(() => expect(screen.getByTestId('business-category-change')).toBeEnabled())
    fireEvent.click(screen.getByTestId('business-category-change'))

    const panel = await screen.findByTestId('category-change-panel')
    fireEvent.click(within(panel).getByText('Cafe & Coffee'))
    fireEvent.click(screen.getByTestId('category-change-save'))

    const blockedPanel = await screen.findByTestId('category-change-blocked-panel')
    expect(within(blockedPanel).getByTestId('category-change-blocked-message')).toHaveTextContent(/locked/i)
    // No Save / Confirm affordance remains - only Close.
    expect(screen.queryByTestId('category-change-save')).not.toBeInTheDocument()
    expect(screen.queryByTestId('category-change-confirm-submit')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByTestId('category-change-blocked-panel')).not.toBeInTheDocument()
  })

  it('Cancel from the picker closes the modal without calling the API', async () => {
    renderCard(profile())
    await waitFor(() => expect(screen.getByTestId('business-category-change')).toBeEnabled())
    fireEvent.click(screen.getByTestId('business-category-change'))

    await screen.findByTestId('category-change-panel')
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(screen.queryByTestId('category-change-panel')).not.toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })
})
