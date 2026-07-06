/**
 * Business Profile M2: the read-shell orchestrator. Pins:
 *   - all 5 section cards + the hero render from a mocked profile
 *   - the hero verification badge is status-aware (derives off
 *     deriveStatusPill, same source as the sidebar StatusPill)
 *   - the pending-edit banner shows only when a PENDING row exists
 *   - ownerContact + agreement render on the Business contact / Compliance cards
 *   - the Documents section is the HONEST placeholder line only - no invented
 *     document list, no upload/replace/view affordances (§BP-DOC deferred)
 */
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BusinessProfileScreen } from '@/components/business-profile/BusinessProfileScreen'
import type { MerchantProfile } from '@/lib/api/profile'

const getOnboardingTaxonomy = jest.fn()
jest.mock('@/lib/api/taxonomy', () => ({
  getOnboardingTaxonomy: () => getOnboardingTaxonomy(),
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
          {
            id: 'sub-restaurant',
            name: 'Restaurant',
            parentId: 'cat-food',
            tags: [{ id: 'tag-modern-british', label: 'Modern British', type: 'CUISINE', isPrimaryEligible: true }],
          },
        ],
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
    primaryDescriptorTagId: 'tag-modern-british',
    description: 'A neighbourhood restaurant on High Street.',
    tradingName: 'The Old Foundry Kitchen',
    logoUrl: null,
    bannerUrl: null,
    websiteUrl: 'oldfoundrykitchen.co.uk',
    vatNumber: 'GB 213 9874 22',
    companyNumber: '09872341',
    ownerContact: {
      firstName: 'James',
      lastName: 'Whitfield',
      email: 'hello@oldfoundrykitchen.co.uk',
      phone: '1223 456 789',
      phoneCountryCode: '+44',
      jobTitle: 'Owner',
    },
    agreement: {
      acceptedVersion: '1.2',
      acceptedAt: '2026-05-14T10:00:00.000Z',
      signatureMethod: 'CLICK_TO_AGREE',
    },
    pendingEdits: [],
    ...over,
  } as MerchantProfile
}

function renderScreen(p: MerchantProfile) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BusinessProfileScreen profile={p} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getOnboardingTaxonomy.mockReset().mockResolvedValue(taxonomy())
})

describe('BusinessProfileScreen', () => {
  it('renders the hero + all 5 section cards', async () => {
    renderScreen(profile())
    expect(screen.getByTestId('business-profile-hero')).toBeInTheDocument()
    expect(screen.getByTestId('business-profile-public-identity-card')).toBeInTheDocument()
    expect(screen.getByTestId('business-profile-registered-details-card')).toBeInTheDocument()
    expect(screen.getByTestId('business-profile-contact-card')).toBeInTheDocument()
    expect(screen.getByTestId('business-profile-category-card')).toBeInTheDocument()
    expect(screen.getByTestId('business-profile-compliance-card')).toBeInTheDocument()
  })

  it('shows the "Verification in progress" badge for a setting-up merchant', () => {
    renderScreen(profile({ status: 'REGISTERED', onboardingStep: 'BRANCH_ADDED' }))
    expect(within(screen.getByTestId('business-profile-verification-badge')).getByText(/verification in progress/i)).toBeInTheDocument()
  })

  it('shows the "Verified by Redeemo" badge for a live merchant', () => {
    renderScreen(profile({ status: 'ACTIVE', onboardingStep: 'LIVE' }))
    expect(within(screen.getByTestId('business-profile-verification-badge')).getByText(/verified by redeemo/i)).toBeInTheDocument()
  })

  it('renders the category chip once the taxonomy resolves', async () => {
    renderScreen(profile())
    expect(await screen.findByTestId('business-profile-category-chip')).toHaveTextContent('Food & Drink')
    expect(screen.getByTestId('business-profile-category-chip')).toHaveTextContent('Modern British Restaurant')
  })

  it('shows the pending-edit banner when a PENDING edit exists', () => {
    renderScreen(profile({ pendingEdits: [{ id: 'e1', status: 'PENDING', createdAt: '2026-05-01T00:00:00.000Z' }] }))
    expect(screen.getByTestId('business-profile-pending-edit-banner')).toHaveTextContent(
      /awaiting redeemo review/i,
    )
  })

  it('does NOT show the pending-edit banner when there is no PENDING row', () => {
    renderScreen(profile({ pendingEdits: [] }))
    expect(screen.queryByTestId('business-profile-pending-edit-banner')).not.toBeInTheDocument()
  })

  it('renders the owner contact on the Business contact card', () => {
    renderScreen(profile())
    const card = screen.getByTestId('business-profile-contact-card')
    expect(within(card).getByText('James Whitfield')).toBeInTheDocument()
    expect(within(card).getByText('hello@oldfoundrykitchen.co.uk')).toBeInTheDocument()
    expect(within(card).getByText('+44 1223 456 789')).toBeInTheDocument()
    expect(within(card).getByText(/my account/i)).toBeInTheDocument()
  })

  it('renders the accepted agreement summary on the Compliance card', () => {
    renderScreen(profile())
    const card = screen.getByTestId('business-profile-compliance-card')
    expect(within(card).getByText(/accepted version 1\.2 on 14 May 2026/i)).toBeInTheDocument()
  })

  it('renders an honest fallback when the agreement has not been signed', () => {
    renderScreen(profile({ agreement: null }))
    const card = screen.getByTestId('business-profile-compliance-card')
    expect(within(card).getByText(/have not signed the merchant agreement yet/i)).toBeInTheDocument()
  })

  it('renders ONLY the honest Documents placeholder line - no invented document list or upload UI', () => {
    renderScreen(profile())
    const placeholder = screen.getByTestId('documents-placeholder')
    expect(placeholder).toHaveTextContent(/redeemo holds your documents/i)
    // No document rows, no upload/replace/view affordances anywhere on the screen.
    expect(screen.queryByText(/add a document/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/certificate of incorporation/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /replace/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^view$/i })).not.toBeInTheDocument()
  })

  it('never wires the Edit / Change category affordances (all disabled, no live edit lane in M2)', () => {
    renderScreen(profile())
    expect(screen.getByTestId('public-identity-edit')).toBeDisabled()
    expect(screen.getByTestId('registered-details-edit')).toBeDisabled()
    expect(screen.getByTestId('business-category-change')).toBeDisabled()
  })
})
