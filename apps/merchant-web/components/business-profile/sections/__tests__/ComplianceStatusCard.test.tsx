import { render, screen, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ComplianceStatusCard } from '@/components/business-profile/sections/ComplianceStatusCard'
import type { MerchantProfile } from '@/lib/api/profile'

const getContract = jest.fn()
jest.mock('@/lib/api/onboarding', () => ({
  getContract: () => getContract(),
}))

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

  it('closes the agreement modal', async () => {
    getContract.mockResolvedValue({ version: '1.2', text: 'Body' })
    renderCard(profile())
    fireEvent.click(screen.getByTestId('view-signed-agreement'))
    await screen.findByTestId('agreement-text')
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByTestId('agreement-modal')).not.toBeInTheDocument()
  })

  it('renders only the honest Documents placeholder line', () => {
    renderCard(profile())
    expect(screen.getByTestId('documents-placeholder')).toHaveTextContent(
      /redeemo holds your documents\. we will ask here if we need something specific/i,
    )
  })
})
