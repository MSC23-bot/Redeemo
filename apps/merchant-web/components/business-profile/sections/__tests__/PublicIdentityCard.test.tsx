import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PublicIdentityCard } from '@/components/business-profile/sections/PublicIdentityCard'
import type { MerchantProfile } from '@/lib/api/profile'

// Business Profile M4: the "Public identity" card. OWNER-only Edit button opens
// the reviewed-edit modal (mocked here so this card test stays focused on
// gating + pending/withdraw); a PENDING identity edit swaps the Edit button for
// an in-review notice + Withdraw (owner only); a non-owner is read-only with
// neither control regardless of pending state.

// --- the modal (mocked so this card test stays focused) ---------------------
const onModalClose = jest.fn()
jest.mock('@/components/business-profile/sections/PublicIdentityEditModal', () => ({
  PublicIdentityEditModal: ({ onClose }: { onClose: () => void }) => {
    onModalClose.mockImplementation(onClose)
    return (
      <div data-testid="edit-modal">
        <button type="button" onClick={onClose}>
          close-modal
        </button>
      </div>
    )
  },
}))

// --- the withdraw mutation hook ---------------------------------------------
const withdrawMutateAsync = jest.fn()
let withdrawPending = false
jest.mock('@/lib/business-profile/useMerchantEditRequest', () => ({
  useWithdrawMerchantEditRequest: () => ({ mutateAsync: withdrawMutateAsync, isPending: withdrawPending }),
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
    tradingName: 'Old Foundry',
    description: 'A cosy neighbourhood kitchen.',
    logoUrl: null,
    bannerUrl: null,
    viewerCapabilities: { canViewInsights: true, role: 'OWNER' },
    pendingEdits: [],
    ...over,
  } as MerchantProfile
}

beforeEach(() => {
  withdrawMutateAsync.mockReset().mockResolvedValue({ id: 'pe1', status: 'WITHDRAWN' })
  toast.mockReset()
  onModalClose.mockReset()
  withdrawPending = false
})

describe('PublicIdentityCard view (read-only content)', () => {
  it('renders the current identity values', () => {
    render(<PublicIdentityCard profile={profile()} />)
    expect(screen.getByText('The Old Foundry Kitchen Ltd')).toBeInTheDocument()
    expect(screen.getByText('Old Foundry')).toBeInTheDocument()
    expect(screen.getByText('A cosy neighbourhood kitchen.')).toBeInTheDocument()
    expect(screen.getByText(/reviewed by redeemo/i)).toBeInTheDocument()
  })
})

describe('PublicIdentityCard owner gating', () => {
  it('shows a live Edit control for an OWNER viewer', () => {
    render(<PublicIdentityCard profile={profile()} />)
    expect(screen.getByTestId('public-identity-edit')).toBeEnabled()
  })

  it('shows no Edit control for a non-owner viewer (BRANCH_MANAGER)', () => {
    render(<PublicIdentityCard profile={profile({ viewerCapabilities: { canViewInsights: true, role: 'BRANCH_MANAGER' } })} />)
    expect(screen.queryByTestId('public-identity-edit')).not.toBeInTheDocument()
  })

  it('shows no Edit control when viewerCapabilities is absent (fail closed)', () => {
    render(<PublicIdentityCard profile={profile({ viewerCapabilities: undefined })} />)
    expect(screen.queryByTestId('public-identity-edit')).not.toBeInTheDocument()
  })
})

describe('PublicIdentityCard owner edit modal', () => {
  it('opens the edit modal when the owner taps Edit', () => {
    render(<PublicIdentityCard profile={profile()} />)
    expect(screen.queryByTestId('edit-modal')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('public-identity-edit'))
    expect(screen.getByTestId('edit-modal')).toBeInTheDocument()
  })

  it('closes the modal via its onClose', () => {
    render(<PublicIdentityCard profile={profile()} />)
    fireEvent.click(screen.getByTestId('public-identity-edit'))
    fireEvent.click(screen.getByRole('button', { name: /close-modal/i }))
    expect(screen.queryByTestId('edit-modal')).not.toBeInTheDocument()
  })
})

describe('PublicIdentityCard pending edit + withdraw', () => {
  const pending = [{ id: 'pe1', status: 'PENDING', createdAt: '2026-07-06T10:00:00.000Z' }]

  it('shows the in-review notice and hides the Edit button while PENDING', () => {
    render(<PublicIdentityCard profile={profile({ pendingEdits: pending as MerchantProfile['pendingEdits'] })} />)
    expect(screen.getByTestId('public-identity-pending-edit')).toBeInTheDocument()
    expect(screen.getByText(/change is already in review/i)).toBeInTheDocument()
    expect(screen.queryByTestId('public-identity-edit')).not.toBeInTheDocument()
  })

  it('offers Withdraw to the owner and withdraws the correct editId', async () => {
    render(<PublicIdentityCard profile={profile({ pendingEdits: pending as MerchantProfile['pendingEdits'] })} />)
    fireEvent.click(screen.getByTestId('public-identity-withdraw'))
    await waitFor(() => expect(withdrawMutateAsync).toHaveBeenCalledWith('pe1'))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' })))
  })

  it('does not show Withdraw for a non-owner even with a pending edit', () => {
    render(
      <PublicIdentityCard
        profile={profile({
          pendingEdits: pending as MerchantProfile['pendingEdits'],
          viewerCapabilities: { canViewInsights: true, role: 'BRANCH_MANAGER' },
        })}
      />,
    )
    expect(screen.getByTestId('public-identity-pending-edit')).toBeInTheDocument()
    expect(screen.queryByTestId('public-identity-withdraw')).not.toBeInTheDocument()
  })

  it('ignores non-PENDING rows (e.g. WITHDRAWN) - Edit stays live', () => {
    const withdrawn = [{ id: 'old', status: 'WITHDRAWN', createdAt: '2026-07-05T10:00:00.000Z' }]
    render(<PublicIdentityCard profile={profile({ pendingEdits: withdrawn as MerchantProfile['pendingEdits'] })} />)
    expect(screen.queryByTestId('public-identity-pending-edit')).not.toBeInTheDocument()
    expect(screen.getByTestId('public-identity-edit')).toBeEnabled()
  })

  it('surfaces a withdraw failure without crashing', async () => {
    withdrawMutateAsync.mockRejectedValue(new Error('boom'))
    render(<PublicIdentityCard profile={profile({ pendingEdits: pending as MerchantProfile['pendingEdits'] })} />)
    fireEvent.click(screen.getByTestId('public-identity-withdraw'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})
