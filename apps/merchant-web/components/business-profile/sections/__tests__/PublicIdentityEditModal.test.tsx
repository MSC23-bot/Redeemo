import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PublicIdentityEditModal, isDraftWindowProfile } from '@/components/business-profile/sections/PublicIdentityEditModal'
import type { MerchantProfile } from '@/lib/api/profile'
import { ApiError } from '@/lib/api/client'

// Business Profile M4: the "Public identity" edit modal. Fields: Business name
// (businessName), Trading name (tradingName), Description (description), plus
// logo/banner via the shared file-upload control. The CRITICAL contract this
// modal owns is the draft-vs-live LANE SELECTION:
//   - draft window (status REGISTERED, or onboardingStep NEEDS_CHANGES) -> the
//     DIRECT PATCH mutation (useUpdateMerchantProfile).
//   - live (anything else) -> the GOVERNED edit-request mutation
//     (useCreateMerchantEditRequest).
// Only ONE of the two mutations may fire per submit - the tests below assert the
// unused mutation is NEVER called, which is what a lifecycle-predicate mutation
// (e.g. flipping `||` to `&&`, or inverting the boolean) would break.

// --- the two mutation hooks --------------------------------------------------
const updateMutateAsync = jest.fn()
let updatePending = false
jest.mock('@/lib/business-profile/useUpdateMerchantProfile', () => ({
  useUpdateMerchantProfile: () => ({ mutateAsync: updateMutateAsync, isPending: updatePending }),
}))

const createMutateAsync = jest.fn()
let createPending = false
jest.mock('@/lib/business-profile/useMerchantEditRequest', () => ({
  useCreateMerchantEditRequest: () => ({ mutateAsync: createMutateAsync, isPending: createPending }),
}))

// --- the file-upload control: capture submitted urls without a network call --
jest.mock('@/components/ui/file-upload', () => ({
  FileUpload: ({ kind, label, onUploaded }: { kind: string; label: string; onUploaded?: (u: string) => void }) => (
    <button type="button" aria-label={label} onClick={() => onUploaded?.(`https://cdn/${kind}.png`)}>
      {label}
    </button>
  ),
}))

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
    ...over,
  } as MerchantProfile
}

const onClose = jest.fn()

beforeEach(() => {
  updateMutateAsync.mockReset().mockResolvedValue({ id: 'm1' })
  createMutateAsync.mockReset().mockResolvedValue({ id: 'pe1', status: 'PENDING' })
  onClose.mockReset()
  updatePending = false
  createPending = false
})

describe('isDraftWindowProfile (D1 predicate parity with backend isDraftWindow)', () => {
  it('is true when status is REGISTERED', () => {
    expect(isDraftWindowProfile({ status: 'REGISTERED', onboardingStep: 'PROFILE' })).toBe(true)
  })
  it('is true when onboardingStep is NEEDS_CHANGES, regardless of status', () => {
    expect(isDraftWindowProfile({ status: 'ACTIVE', onboardingStep: 'NEEDS_CHANGES' })).toBe(true)
  })
  it('is false for a live merchant (ACTIVE + LIVE)', () => {
    expect(isDraftWindowProfile({ status: 'ACTIVE', onboardingStep: 'LIVE' })).toBe(false)
  })
  it('is false for SUBMITTED / UNDER_REVIEW (not the draft window)', () => {
    expect(isDraftWindowProfile({ status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED' })).toBe(false)
    expect(isDraftWindowProfile({ status: 'PENDING_APPROVAL', onboardingStep: 'UNDER_REVIEW' })).toBe(false)
  })
})

describe('PublicIdentityEditModal fields', () => {
  it('renders the three text fields prefilled from the profile', () => {
    render(<PublicIdentityEditModal profile={profile()} onClose={onClose} />)
    expect(screen.getByLabelText(/business name/i)).toHaveValue('The Old Foundry Kitchen Ltd')
    expect(screen.getByLabelText(/trading name/i)).toHaveValue('Old Foundry')
    expect(screen.getByLabelText(/description/i)).toHaveValue('A cosy neighbourhood kitchen.')
  })
})

describe('PublicIdentityEditModal lane selection - LIVE merchant (edit-request lane)', () => {
  it('calls createMerchantEditRequest with ONLY the changed fields, and NEVER calls updateMerchantProfile', async () => {
    render(<PublicIdentityEditModal profile={profile({ status: 'ACTIVE', onboardingStep: 'LIVE' })} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: /send for review/i }))

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled())
    expect(createMutateAsync).toHaveBeenCalledWith({ businessName: 'New Name' })
    expect(updateMutateAsync).not.toHaveBeenCalled()
  })

  it('includes an uploaded logo/banner url in the submitted body', async () => {
    render(<PublicIdentityEditModal profile={profile({ status: 'ACTIVE', onboardingStep: 'LIVE' })} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /upload a new logo/i }))
    fireEvent.click(screen.getByRole('button', { name: /upload a new banner/i }))
    fireEvent.click(screen.getByRole('button', { name: /send for review/i }))
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled())
    expect(createMutateAsync).toHaveBeenCalledWith({
      logoUrl: 'https://cdn/logo.png',
      bannerUrl: 'https://cdn/banner.png',
    })
  })

  it('closes the modal on a successful submit', async () => {
    render(<PublicIdentityEditModal profile={profile({ status: 'ACTIVE', onboardingStep: 'LIVE' })} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: /send for review/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows the reviewed-by-Redeemo notice', () => {
    render(<PublicIdentityEditModal profile={profile({ status: 'ACTIVE', onboardingStep: 'LIVE' })} onClose={onClose} />)
    expect(screen.getByTestId('public-identity-modal-reviewed-notice')).toBeInTheDocument()
  })

  it('PENDING_EDIT_EXISTS (409): inline notice, modal stays open, submit disabled', async () => {
    createMutateAsync.mockRejectedValue(new ApiError(409, { error: { code: 'PENDING_EDIT_EXISTS' } }))
    render(<PublicIdentityEditModal profile={profile({ status: 'ACTIVE', onboardingStep: 'LIVE' })} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: /send for review/i }))
    await waitFor(() => expect(screen.getByTestId('public-identity-pending-exists-notice')).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /send for review/i })).toBeDisabled()
  })

  it('generic failure: modal-level alert, modal stays open, submit re-enabled', async () => {
    createMutateAsync.mockRejectedValue(new Error('network down'))
    render(<PublicIdentityEditModal profile={profile({ status: 'ACTIVE', onboardingStep: 'LIVE' })} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: /send for review/i }))
    await waitFor(() =>
      expect(screen.getByTestId('public-identity-modal-error')).toHaveTextContent(/could not send your change for review/i),
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /send for review/i })).toBeEnabled()
  })

  // Codex nullable-clear fix: the LIVE (edit-request) lane sends the SAME
  // `tradingName: null` clear body as the draft/direct lane (see the
  // 'clears tradingName to null when emptied' pin below, in the DRAFT WINDOW
  // describe block). Before the fix, this body round-tripped through
  // createMerchantEditRequest's real merchantProposedChangesSchema.parse() (the
  // hook is mocked here, so this component-level test does not itself exercise
  // that parse - see lib/api/__tests__/profile.test.ts for the schema-level
  // regression pin) and would have thrown on the mocked resolution's shape;
  // this test pins that the LIVE lane submits the identical null-clear body so
  // both lanes stay in parity.
  it('clears tradingName to null when emptied (LIVE edit-request lane)', async () => {
    render(<PublicIdentityEditModal profile={profile({ status: 'ACTIVE', onboardingStep: 'LIVE' })} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/trading name/i), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /send for review/i }))
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledWith({ tradingName: null }))
    expect(updateMutateAsync).not.toHaveBeenCalled()
  })
})

describe('PublicIdentityEditModal lane selection - DRAFT WINDOW merchant (direct-edit lane)', () => {
  it('calls updateMerchantProfile with ONLY the changed fields, and NEVER calls createMerchantEditRequest (status REGISTERED)', async () => {
    render(<PublicIdentityEditModal profile={profile({ status: 'REGISTERED', onboardingStep: 'PROFILE' })} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled())
    expect(updateMutateAsync).toHaveBeenCalledWith({ businessName: 'New Name' })
    expect(createMutateAsync).not.toHaveBeenCalled()
  })

  it('calls updateMerchantProfile (not the edit-request lane) when onboardingStep is NEEDS_CHANGES on an otherwise-live status', async () => {
    render(
      <PublicIdentityEditModal
        profile={profile({ status: 'ACTIVE', onboardingStep: 'NEEDS_CHANGES' })}
        onClose={onClose}
      />,
    )
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'An updated description.' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled())
    expect(updateMutateAsync).toHaveBeenCalledWith({ description: 'An updated description.' })
    expect(createMutateAsync).not.toHaveBeenCalled()
  })

  it('does not show the reviewed-by-Redeemo notice in the draft window', () => {
    render(<PublicIdentityEditModal profile={profile({ status: 'REGISTERED', onboardingStep: 'PROFILE' })} onClose={onClose} />)
    expect(screen.queryByTestId('public-identity-modal-reviewed-notice')).not.toBeInTheDocument()
  })

  it('clears tradingName to null when emptied', async () => {
    render(<PublicIdentityEditModal profile={profile({ status: 'REGISTERED', onboardingStep: 'PROFILE' })} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/trading name/i), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledWith({ tradingName: null }))
  })

  it('closes the modal on a successful direct save', async () => {
    render(<PublicIdentityEditModal profile={profile({ status: 'REGISTERED', onboardingStep: 'PROFILE' })} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('generic direct-save failure: modal-level alert, modal stays open', async () => {
    updateMutateAsync.mockRejectedValue(new Error('boom'))
    render(<PublicIdentityEditModal profile={profile({ status: 'REGISTERED', onboardingStep: 'PROFILE' })} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() =>
      expect(screen.getByTestId('public-identity-modal-error')).toHaveTextContent(/could not save your changes/i),
    )
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('PublicIdentityEditModal validation', () => {
  it('rejects an empty business name and never calls either mutation', async () => {
    render(<PublicIdentityEditModal profile={profile({ status: 'ACTIVE', onboardingStep: 'LIVE' })} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /send for review/i }))
    expect(await screen.findByText(/registered business name is required/i)).toBeInTheDocument()
    expect(createMutateAsync).not.toHaveBeenCalled()
    expect(updateMutateAsync).not.toHaveBeenCalled()
  })

  it('rejects a description over 600 characters', async () => {
    render(<PublicIdentityEditModal profile={profile({ status: 'ACTIVE', onboardingStep: 'LIVE' })} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'a'.repeat(601) } })
    fireEvent.click(screen.getByRole('button', { name: /send for review/i }))
    expect(await screen.findByText(/keep it under 600 characters/i)).toBeInTheDocument()
    expect(createMutateAsync).not.toHaveBeenCalled()
  })

  it('rejects an empty submit (nothing changed) without calling either mutation', async () => {
    render(<PublicIdentityEditModal profile={profile({ status: 'ACTIVE', onboardingStep: 'LIVE' })} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /send for review/i }))
    expect(await screen.findByTestId('public-identity-modal-error')).toHaveTextContent(/change at least one detail/i)
    expect(createMutateAsync).not.toHaveBeenCalled()
    expect(updateMutateAsync).not.toHaveBeenCalled()
  })
})

describe('PublicIdentityEditModal cancel', () => {
  it('closes without submitting', () => {
    render(<PublicIdentityEditModal profile={profile()} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: 'CHANGED' } })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(createMutateAsync).not.toHaveBeenCalled()
    expect(updateMutateAsync).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
