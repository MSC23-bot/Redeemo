/**
 * Business Profile M2 + B3: the read-shell orchestrator. Pins:
 *   - all 5 section cards + the hero render from a mocked profile
 *   - the hero verification badge is status-aware (derives off
 *     deriveStatusPill, same source as the sidebar StatusPill)
 *   - the pending-edit banner shows only when a PENDING row exists
 *   - ownerContact + agreement render on the Business contact / Compliance cards
 *   - the Documents section (B3, SHIPPED) renders the real list/upload card;
 *     without viewerCapabilities the upload trigger fails closed (hidden)
 */
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BusinessProfileScreen } from '@/components/business-profile/BusinessProfileScreen'
import { ToastProvider } from '@/components/ui/toast'
import type { MerchantProfile } from '@/lib/api/profile'

const getOnboardingTaxonomy = jest.fn()
jest.mock('@/lib/api/taxonomy', () => ({
  getOnboardingTaxonomy: () => getOnboardingTaxonomy(),
}))

// B3: DocumentsCard reads via documentsApi.list - mocked here (mirrors the
// getOnboardingTaxonomy mock above) so this shell test never issues a real fetch.
const listDocuments = jest.fn()
jest.mock('@/lib/api/documents', () => {
  const actual = jest.requireActual('@/lib/api/documents')
  return { ...actual, documentsApi: { ...actual.documentsApi, list: () => listDocuments() } }
})

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
      <ToastProvider>
        <BusinessProfileScreen profile={p} />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getOnboardingTaxonomy.mockReset().mockResolvedValue(taxonomy())
  listDocuments.mockReset().mockResolvedValue({ documents: [] })
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
    // WF3: the unsigned copy and the "View signed agreement" button must never
    // render together - there is nothing signed to view.
    expect(within(card).queryByTestId('view-signed-agreement')).not.toBeInTheDocument()
  })

  it('renders the Documents card (B3) with an empty state and no upload trigger for a viewer with no viewerCapabilities (fail closed)', async () => {
    renderScreen(profile())
    expect(await screen.findByTestId('documents-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('documents-upload-trigger')).not.toBeInTheDocument()
  })

  // Business Profile M4: the Public identity Edit affordance is now a LIVE
  // OWNER-only control (was M2's disabled DisabledEditButton stub). A viewer with
  // no viewerCapabilities (the default `profile()` fixture - mirrors an older
  // backend / a loading state) fails closed: the button does not render at all.
  it('does not render the Public identity Edit button for a non-owner viewer (fail closed)', () => {
    renderScreen(profile())
    expect(screen.queryByTestId('public-identity-edit')).not.toBeInTheDocument()
  })

  it('renders a live Public identity Edit button for an OWNER viewer', () => {
    renderScreen(profile({ viewerCapabilities: { canViewInsights: true, role: 'OWNER' } }))
    expect(screen.getByTestId('public-identity-edit')).toBeEnabled()
  })

  // Business Profile M3: Registered details Edit + Business category Change are
  // OWNER-only live affordances. A viewer with no viewerCapabilities (the default
  // `profile()` fixture - mirrors an older backend / a loading state) fails closed:
  // neither button renders at all (not merely disabled).
  it('does not render the Registered details Edit / Change category buttons for a non-owner viewer', async () => {
    renderScreen(profile())
    await screen.findByTestId('business-profile-category-chip')
    expect(screen.queryByTestId('registered-details-edit')).not.toBeInTheDocument()
    expect(screen.queryByTestId('business-category-change')).not.toBeInTheDocument()
  })

  it('renders the Registered details Edit + Change category buttons for an OWNER viewer', async () => {
    renderScreen(profile({ viewerCapabilities: { canViewInsights: true, role: 'OWNER' } }))
    await screen.findByTestId('business-profile-category-chip')
    expect(screen.getByTestId('registered-details-edit')).toBeEnabled()
    expect(screen.getByTestId('business-category-change')).toBeEnabled()
  })

  it('does not render the Registered details Edit / Change category buttons for a BRANCH_MANAGER viewer', async () => {
    renderScreen(profile({ viewerCapabilities: { canViewInsights: true, role: 'BRANCH_MANAGER' } }))
    await screen.findByTestId('business-profile-category-chip')
    expect(screen.queryByTestId('registered-details-edit')).not.toBeInTheDocument()
    expect(screen.queryByTestId('business-category-change')).not.toBeInTheDocument()
  })
})
