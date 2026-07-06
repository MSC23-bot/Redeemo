import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RegisteredDetailsCard } from '@/components/business-profile/sections/RegisteredDetailsCard'
import type { MerchantProfile } from '@/lib/api/profile'

// Business Profile M3: the "Registered details" direct-edit card (website / company
// number / VAT number). OWNER-only Edit affordance; save PATCHes ONLY the changed
// simple-direct fields via useUpdateMerchantProfile. A non-owner sees the values
// read-only with no Edit control at all.

// --- the M3 mutation hook ----------------------------------------------------
const mutateAsync = jest.fn()
let isPending = false
jest.mock('@/lib/business-profile/useUpdateMerchantProfile', () => ({
  useUpdateMerchantProfile: () => ({ mutateAsync, isPending }),
}))

// --- toast --------------------------------------------------------------------
const toast = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast }) }))

function profile(over: Partial<MerchantProfile> = {}): MerchantProfile {
  return {
    id: 'm1',
    businessName: 'The Old Foundry Kitchen Ltd',
    status: 'ACTIVE',
    onboardingStep: 'LIVE',
    websiteUrl: 'oldfoundrykitchen.co.uk',
    companyNumber: '09872341',
    vatNumber: 'GB213987422',
    viewerCapabilities: { canViewInsights: true, role: 'OWNER' },
    ...over,
  } as MerchantProfile
}

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue({ id: 'm1' })
  toast.mockReset()
  isPending = false
})

describe('RegisteredDetailsCard owner gating', () => {
  it('shows the values read-only for a non-owner viewer (no Edit control)', () => {
    render(<RegisteredDetailsCard profile={profile({ viewerCapabilities: { canViewInsights: true, role: 'BRANCH_MANAGER' } })} />)
    expect(screen.getByText('oldfoundrykitchen.co.uk')).toBeInTheDocument()
    expect(screen.queryByTestId('registered-details-edit')).not.toBeInTheDocument()
  })

  it('shows the values read-only when viewerCapabilities is absent (fail closed)', () => {
    render(<RegisteredDetailsCard profile={profile({ viewerCapabilities: undefined })} />)
    expect(screen.queryByTestId('registered-details-edit')).not.toBeInTheDocument()
  })

  it('shows a live Edit control for an OWNER viewer', () => {
    render(<RegisteredDetailsCard profile={profile()} />)
    expect(screen.getByTestId('registered-details-edit')).toBeEnabled()
  })

  it('renders the "Saves instantly" hint', () => {
    render(<RegisteredDetailsCard profile={profile()} />)
    expect(screen.getByText(/saves instantly/i)).toBeInTheDocument()
  })
})

describe('RegisteredDetailsCard edit + save', () => {
  it('owner edit PATCHes with exactly the changed fields', async () => {
    render(<RegisteredDetailsCard profile={profile()} />)
    fireEvent.click(screen.getByTestId('registered-details-edit'))

    fireEvent.change(screen.getByLabelText(/website/i), { target: { value: 'newsite.co.uk' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync).toHaveBeenCalledWith({ websiteUrl: 'newsite.co.uk' })
  })

  it('sends all three fields when all three changed, and refetches via the shared hook', async () => {
    render(<RegisteredDetailsCard profile={profile()} />)
    fireEvent.click(screen.getByTestId('registered-details-edit'))

    fireEvent.change(screen.getByLabelText(/website/i), { target: { value: 'newsite.co.uk' } })
    fireEvent.change(screen.getByLabelText(/company number/i), { target: { value: '12345678' } })
    fireEvent.change(screen.getByLabelText(/vat number/i), { target: { value: 'GB999999999' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync).toHaveBeenCalledWith({
      websiteUrl: 'newsite.co.uk',
      companyNumber: '12345678',
      vatNumber: 'GB999999999',
    })
  })

  it('clears a field to null when the input is emptied', async () => {
    render(<RegisteredDetailsCard profile={profile()} />)
    fireEvent.click(screen.getByTestId('registered-details-edit'))
    fireEvent.change(screen.getByLabelText(/vat number/i), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync).toHaveBeenCalledWith({ vatNumber: null })
  })

  it('shows a success toast and returns to view after a save', async () => {
    render(<RegisteredDetailsCard profile={profile()} />)
    fireEvent.click(screen.getByTestId('registered-details-edit'))
    fireEvent.change(screen.getByLabelText(/website/i), { target: { value: 'newsite.co.uk' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' })))
    expect(screen.queryByLabelText(/website/i)).not.toBeInTheDocument()
  })

  it('does not call the API when nothing changed (save is a no-op back to view)', async () => {
    render(<RegisteredDetailsCard profile={profile()} />)
    fireEvent.click(screen.getByTestId('registered-details-edit'))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByText('oldfoundrykitchen.co.uk')).toBeInTheDocument())
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('Cancel discards edits and returns to view', () => {
    render(<RegisteredDetailsCard profile={profile()} />)
    fireEvent.click(screen.getByTestId('registered-details-edit'))
    fireEvent.change(screen.getByLabelText(/website/i), { target: { value: 'CHANGED' } })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.getByText('oldfoundrykitchen.co.uk')).toBeInTheDocument()
    expect(screen.queryByLabelText(/website/i)).not.toBeInTheDocument()
  })
})

describe('RegisteredDetailsCard validation rejects bad input', () => {
  it('rejects a malformed company number and never calls the API', async () => {
    render(<RegisteredDetailsCard profile={profile()} />)
    fireEvent.click(screen.getByTestId('registered-details-edit'))
    fireEvent.change(screen.getByLabelText(/company number/i), { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(await screen.findByText(/enter 8 digits, or 2 letters then 6 digits/i)).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('rejects a malformed VAT number and never calls the API', async () => {
    render(<RegisteredDetailsCard profile={profile()} />)
    fireEvent.click(screen.getByTestId('registered-details-edit'))
    fireEvent.change(screen.getByLabelText(/vat number/i), { target: { value: 'NOTVALID' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(await screen.findByText(/enter gb followed by 9 digits/i)).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('rejects a malformed website and never calls the API', async () => {
    render(<RegisteredDetailsCard profile={profile()} />)
    fireEvent.click(screen.getByTestId('registered-details-edit'))
    fireEvent.change(screen.getByLabelText(/website/i), { target: { value: 'not a url' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(await screen.findByText(/enter a valid website/i)).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })
})

describe('RegisteredDetailsCard error', () => {
  it('surfaces a save failure via role=alert and keeps the form open', async () => {
    mutateAsync.mockRejectedValue(new Error('boom'))
    render(<RegisteredDetailsCard profile={profile()} />)
    fireEvent.click(screen.getByTestId('registered-details-edit'))
    fireEvent.change(screen.getByLabelText(/website/i), { target: { value: 'newsite.co.uk' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByLabelText(/website/i)).toBeInTheDocument()
  })
})
