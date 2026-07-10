import { render, screen, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ComplianceStatusCard } from '@/components/business-profile/sections/ComplianceStatusCard'
import type { MerchantProfile } from '@/lib/api/profile'

const getContract = jest.fn()
jest.mock('@/lib/api/onboarding', () => ({
  getContract: () => getContract(),
}))

// B3: DocumentsCard (inside ComplianceStatusCard) reads via documentsApi.list.
// Mocked here the same way getContract is above, so THIS file's tests can pin
// the card's role-gated rendering without re-testing the list/upload internals
// (covered by DocumentsCard.test.tsx).
const listDocuments = jest.fn()
jest.mock('@/lib/api/documents', () => {
  const actual = jest.requireActual('@/lib/api/documents')
  return { ...actual, documentsApi: { ...actual.documentsApi, list: () => listDocuments() } }
})

function profile(over: Partial<MerchantProfile> = {}): MerchantProfile {
  return {
    id: 'm1',
    businessName: 'The Old Foundry Kitchen Ltd',
    status: 'ACTIVE',
    onboardingStep: 'LIVE',
    agreement: { acceptedVersion: '1.2', acceptedAt: '2026-05-14T10:00:00.000Z', signatureMethod: 'CLICK_TO_AGREE' },
    ...over,
  } as MerchantProfile
}

function renderCard(p: MerchantProfile) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ComplianceStatusCard profile={p} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getContract.mockReset()
  listDocuments.mockReset().mockResolvedValue({ documents: [] })
})

describe('ComplianceStatusCard', () => {
  it('shows the success verification block for a live merchant', () => {
    renderCard(profile({ status: 'ACTIVE', onboardingStep: 'LIVE' }))
    const block = screen.getByTestId('business-profile-verification-block')
    expect(within(block).getByText(/verified by redeemo/i)).toBeInTheDocument()
    expect(within(block).getByText(/passed verification and is live/i)).toBeInTheDocument()
  })

  it('shows the amber verification block while setting up', () => {
    renderCard(profile({ status: 'REGISTERED', onboardingStep: 'BRANCH_ADDED' }))
    const block = screen.getByTestId('business-profile-verification-block')
    expect(within(block).getByText(/verification in progress/i)).toBeInTheDocument()
    expect(within(block).getByText(/checking your documents/i)).toBeInTheDocument()
  })

  it('opens the agreement modal and shows the fetched contract text', async () => {
    getContract.mockResolvedValue({ version: '1.2', text: 'The full draft agreement text.' })
    renderCard(profile())
    fireEvent.click(screen.getByTestId('view-signed-agreement'))
    expect(await screen.findByTestId('agreement-text')).toHaveTextContent('The full draft agreement text.')
    expect(screen.getByTestId('agreement-modal')).toHaveTextContent(/accepted version 1\.2 on 14 May 2026/i)
  })

  // WF3 (staging acceptance walk): a signed merchant must show the signed copy
  // AND the View button together - never the unsigned copy alongside a working
  // button, which is what the walk caught on a live merchant.
  it('shows the signed copy and the View signed agreement button together when signed', () => {
    renderCard(profile())
    const card = screen.getByTestId('business-profile-compliance-card')
    expect(within(card).getByText(/accepted version 1\.2 on 14 May 2026/i)).toBeInTheDocument()
    expect(within(card).queryByText(/have not signed the merchant agreement yet/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('view-signed-agreement')).toBeInTheDocument()
  })

  // WF3: the flip side - a genuinely unsigned merchant shows the unsigned copy
  // and NEVER the View button (there is nothing signed to view).
  it('shows the unsigned copy and NO View signed agreement button when unsigned', () => {
    renderCard(profile({ agreement: null }))
    const card = screen.getByTestId('business-profile-compliance-card')
    expect(within(card).getByText(/have not signed the merchant agreement yet/i)).toBeInTheDocument()
    expect(within(card).queryByText(/accepted version/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('view-signed-agreement')).not.toBeInTheDocument()
  })

  it('closes the agreement modal', async () => {
    getContract.mockResolvedValue({ version: '1.2', text: 'Body' })
    renderCard(profile())
    fireEvent.click(screen.getByTestId('view-signed-agreement'))
    await screen.findByTestId('agreement-text')
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByTestId('agreement-modal')).not.toBeInTheDocument()
  })

  it('renders the Documents card and lists real documents (B3)', async () => {
    listDocuments.mockResolvedValue({
      documents: [
        { id: 'doc-1', documentType: 'PRICE_LIST', uploadedAt: '2026-06-10T00:00:00.000Z', url: 'https://r2.example/signed', available: true },
      ],
    })
    renderCard(profile())
    expect(await screen.findByTestId('documents-row-doc-1')).toHaveTextContent(/price list/i)
    expect(screen.getByTestId('documents-open-doc-1')).toHaveAttribute('href', 'https://r2.example/signed')
  })

  it('shows an empty state when there are no documents', async () => {
    renderCard(profile())
    expect(await screen.findByTestId('documents-empty')).toHaveTextContent(/no documents uploaded yet/i)
  })

  it('shows the upload affordance for OWNER (D1)', async () => {
    renderCard(profile({ viewerCapabilities: { canViewInsights: true, role: 'OWNER' } } as Partial<MerchantProfile>))
    await screen.findByTestId('documents-empty')
    expect(screen.getByTestId('documents-upload-trigger')).toBeInTheDocument()
  })

  it('hides the upload affordance for BRANCH_MANAGER (D1: view only)', async () => {
    renderCard(profile({ viewerCapabilities: { canViewInsights: true, role: 'BRANCH_MANAGER' } } as Partial<MerchantProfile>))
    await screen.findByTestId('documents-empty')
    expect(screen.queryByTestId('documents-upload-trigger')).not.toBeInTheDocument()
  })
})
