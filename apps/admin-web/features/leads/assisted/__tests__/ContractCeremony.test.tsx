/**
 * ContractCeremony (D65 in-person signing): the assisted contract-signing flow,
 * with the signing-integrity correction (full-text review + version echo + stale
 * handling + status-driven banner).
 *
 * Covers the load-bearing ceremony contract (spec §2 steps 1-7):
 *   - the FULL agreement text is fetched and rendered; the scroll-to-end gate runs
 *     over the full text (accept stays disabled until scrolled to the end);
 *   - the pending-legal-review banner is DRIVEN BY the read's gated status (shown for a
 *     draft, absent for a non-draft), never hardcoded; never claims solicitor approval;
 *   - step 1-2 rep pre-check + the explicit "operator cannot accept" hand-to-owner;
 *   - steps 4-6: authority attestation + role + key-terms + typed name gate the accept
 *     control; the POST ECHOES the exact displayed agreementVersion;
 *   - a stale version (AGREEMENT_VERSION_MISMATCH) forces a reload + re-review (re-arms
 *     the scroll/key-terms gates, shows the mismatch notice) and does NOT silently sign;
 *   - step 7 success: the signed evidence + the gated watermark note + Continue;
 *   - AGREEMENT_LEGAL_REVIEW_REQUIRED surfaces via NamedGateBanner without claiming approval;
 *   - loading / read-error states gate the ceremony (no text = no signing).
 *
 * The React Query hooks are mocked (house idiom), so no QueryClientProvider.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ContractCeremony } from '../ContractCeremony'
import { ApiError } from '@/lib/api/client'
import type { SignAgreementResponse, AgreementTextResponse } from '@/lib/api/agreement'

// Mutable hook stubs; the jest.mock factories may reference `mock`-prefixed vars.
let mockSignMutation: { mutateAsync: jest.Mock; isPending: boolean; error: unknown }
let mockAgreementQuery: {
  data: AgreementTextResponse | undefined
  isLoading: boolean
  isError: boolean
  refetch: jest.Mock
}

jest.mock('@/lib/agreement/useSignAgreement', () => ({
  useSignAgreement: () => mockSignMutation,
}))
jest.mock('@/lib/agreement/useAgreementText', () => ({
  useAgreementText: () => mockAgreementQuery,
}))

const FULL_TEXT =
  'Redeemo Merchant Agreement v2.0-draft\n\nDRAFT - PENDING LEGAL REVIEW\n\n1. Term. This is a 12 month agreement...\n\n2. Fees. Listing is free...\n\n(full legal wording continues for the length of the agreement)'

function agreementResponse(overrides: Partial<AgreementTextResponse> = {}): AgreementTextResponse {
  return {
    version: '2.0-draft',
    text: FULL_TEXT,
    contentHash: 'abc123def456',
    isDraft: true,
    gated: true,
    ...overrides,
  }
}

function okResponse(overrides: Partial<SignAgreementResponse> = {}): SignAgreementResponse {
  return {
    recordId: 'rec-1',
    agreementVersion: '2.0-draft',
    contentHash: 'abc123def456',
    signedAt: '2026-07-13T13:32:00.000Z',
    contractStatus: 'SIGNED',
    gated: true,
    ...overrides,
  }
}

beforeEach(() => {
  mockSignMutation = {
    mutateAsync: jest.fn().mockResolvedValue(okResponse()),
    isPending: false,
    error: null,
  }
  mockAgreementQuery = {
    data: agreementResponse(),
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }
  // jsdom has no layout: force the agreement container to overflow so the
  // scroll-to-end gate does NOT auto-open on mount.
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, value: 1000 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 180 })
})

afterEach(() => jest.clearAllMocks())

function renderCeremony(onDone = jest.fn()) {
  render(
    <ContractCeremony merchantId="m-1" businessLegalName="Southville Sourdough Ltd" onDone={onDone} />
  )
  return { onDone }
}

// Advance from the pre-check into the owner panel.
function handToOwner() {
  fireEvent.click(screen.getByTestId('ceremony-hand-to-owner'))
}

// Scroll the agreement container to its end (clears the step-3 gate).
function scrollToEnd() {
  const el = screen.getByTestId('ceremony-agreement-scroll')
  Object.defineProperty(el, 'scrollTop', { configurable: true, value: 900 })
  fireEvent.scroll(el)
}

// Fill authority + role + key-terms + typed name (steps 4-6).
function fillAcceptanceFields() {
  fireEvent.click(screen.getByTestId('ceremony-authority'))
  fireEvent.change(screen.getByTestId('ceremony-role'), { target: { value: 'Owner' } })
  fireEvent.click(screen.getByTestId('ceremony-key-terms'))
  fireEvent.change(screen.getByTestId('ceremony-name'), { target: { value: 'Marta Owner' } })
}

describe('ContractCeremony read gating', () => {
  it('shows a loading state until the agreement text is available (no text = no signing)', () => {
    mockAgreementQuery = { data: undefined, isLoading: true, isError: false, refetch: jest.fn() }
    renderCeremony()
    expect(screen.getByTestId('ceremony-agreement-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('ceremony-precheck')).not.toBeInTheDocument()
  })

  it('shows a retryable error state when the agreement read fails', () => {
    const refetch = jest.fn()
    mockAgreementQuery = { data: undefined, isLoading: false, isError: true, refetch }
    renderCeremony()
    expect(screen.getByTestId('ceremony-agreement-error')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('ceremony-agreement-retry'))
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})

describe('ContractCeremony status-driven legal banner', () => {
  it('shows the pending-legal-review banner for a draft (gated) version and never claims approval', () => {
    renderCeremony()
    const banner = screen.getByTestId('ceremony-legal-banner')
    expect(banner).toHaveTextContent(/pending legal review/i)
    expect(banner).not.toHaveTextContent(/solicitor/i)
    expect(banner).not.toHaveTextContent(/approved/i)
  })

  it('does NOT show the pending-legal-review banner for a non-draft (non-gated) version', () => {
    mockAgreementQuery.data = agreementResponse({ version: '2.0', isDraft: false, gated: false })
    renderCeremony()
    expect(screen.queryByTestId('ceremony-legal-banner')).not.toBeInTheDocument()
  })
})

describe('ContractCeremony pre-check + hand to owner', () => {
  it('states the operator cannot accept and hands the device to the owner', () => {
    renderCeremony()
    expect(screen.getByTestId('ceremony-business-name')).toHaveTextContent('Southville Sourdough Ltd')
    expect(screen.getByTestId('ceremony-operator-note')).toHaveTextContent(/cannot accept this agreement/i)
    expect(screen.getByTestId('ceremony-operator-note')).toHaveTextContent(/recorded as the witness/i)
    // The owner panel + accept control are not present until the handover.
    expect(screen.queryByTestId('ceremony-accept')).not.toBeInTheDocument()
    handToOwner()
    expect(screen.getByTestId('ceremony-owner-panel')).toBeInTheDocument()
  })
})

describe('ContractCeremony full-text review', () => {
  it('renders the FULL agreement text (not just the key-terms summary)', () => {
    renderCeremony()
    handToOwner()
    const fullText = screen.getByTestId('ceremony-agreement-fulltext')
    expect(fullText).toHaveTextContent('Redeemo Merchant Agreement v2.0-draft')
    expect(fullText).toHaveTextContent('full legal wording continues')
    // The version is labelled on the full-agreement block.
    expect(screen.getByTestId('ceremony-agreement-scroll')).toHaveTextContent(/Full agreement \(version 2\.0-draft\)/i)
  })
})

describe('ContractCeremony re-handover freshness (S1)', () => {
  it('re-arms the scroll gate and clears authority/key-terms/name/role on Back, then re-entering the owner panel', () => {
    renderCeremony()
    handToOwner()
    scrollToEnd()
    fillAcceptanceFields()
    expect(screen.getByTestId('ceremony-accept')).toBeEnabled()

    fireEvent.click(screen.getByTestId('ceremony-back'))
    expect(screen.getByTestId('ceremony-precheck')).toBeInTheDocument()
    handToOwner()

    expect(screen.getByTestId('ceremony-scroll-hint')).toBeInTheDocument()
    expect(screen.getByTestId('ceremony-authority')).not.toBeChecked()
    expect(screen.getByTestId('ceremony-key-terms')).not.toBeChecked()
    expect(screen.getByTestId('ceremony-role')).toHaveValue('')
    expect(screen.getByTestId('ceremony-name')).toHaveValue('')
    expect(screen.getByTestId('ceremony-accept')).toBeDisabled()
  })
})

describe('ContractCeremony acceptance gates', () => {
  it('keeps accept disabled until the full agreement is scrolled to the end', () => {
    renderCeremony()
    handToOwner()
    fillAcceptanceFields() // every field complete EXCEPT the scroll gate
    expect(screen.getByTestId('ceremony-scroll-hint')).toBeInTheDocument()
    expect(screen.getByTestId('ceremony-accept')).toBeDisabled()

    scrollToEnd()
    expect(screen.queryByTestId('ceremony-scroll-hint')).not.toBeInTheDocument()
    expect(screen.getByTestId('ceremony-accept')).toBeEnabled()
  })

  it('requires authority + role + key-terms + typed name before enabling accept', () => {
    renderCeremony()
    handToOwner()
    scrollToEnd()
    const accept = screen.getByTestId('ceremony-accept')

    fireEvent.click(screen.getByTestId('ceremony-authority'))
    expect(accept).toBeDisabled()
    fireEvent.change(screen.getByTestId('ceremony-role'), { target: { value: 'Director' } })
    expect(accept).toBeDisabled()
    fireEvent.click(screen.getByTestId('ceremony-key-terms'))
    expect(accept).toBeDisabled()
    fireEvent.change(screen.getByTestId('ceremony-name'), { target: { value: 'Marta Owner' } })
    expect(accept).toBeEnabled()
  })
})

describe('ContractCeremony sign (version echo)', () => {
  it('echoes the EXACT displayed agreementVersion in the sign POST and shows the signed evidence', async () => {
    const onDone = jest.fn()
    renderCeremony(onDone)
    handToOwner()
    scrollToEnd()
    fillAcceptanceFields()
    fireEvent.click(screen.getByTestId('ceremony-accept'))

    await waitFor(() => expect(mockSignMutation.mutateAsync).toHaveBeenCalledTimes(1))
    // The precise value matters: the sign is bound to the version the owner reviewed.
    expect(mockSignMutation.mutateAsync).toHaveBeenCalledWith({
      signerName: 'Marta Owner',
      signerRoleConfirmation: 'Owner',
      agreementVersion: '2.0-draft',
    })

    const signed = await screen.findByTestId('ceremony-signed')
    expect(signed).toHaveTextContent('Marta Owner')
    expect(signed).toHaveTextContent('Owner')
    expect(signed).toHaveTextContent('2.0-draft')
    expect(screen.getByTestId('ceremony-signed-gated')).toBeInTheDocument()
    // Signed-state copy points to the Merchant 360 summary, not a full evidence surface.
    expect(signed).toHaveTextContent(/Merchant 360/i)

    fireEvent.click(screen.getByTestId('ceremony-continue'))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('echoes a DIFFERENT displayed version verbatim (proves the echo is not a constant)', async () => {
    mockAgreementQuery.data = agreementResponse({ version: '2.1-draft' })
    renderCeremony()
    handToOwner()
    scrollToEnd()
    fillAcceptanceFields()
    fireEvent.click(screen.getByTestId('ceremony-accept'))
    await waitFor(() => expect(mockSignMutation.mutateAsync).toHaveBeenCalledTimes(1))
    expect(mockSignMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ agreementVersion: '2.1-draft' })
    )
  })

  it('does not show the gated note when the sign response reports gated:false', async () => {
    mockSignMutation.mutateAsync = jest.fn().mockResolvedValue(okResponse({ gated: false }))
    renderCeremony()
    handToOwner()
    scrollToEnd()
    fillAcceptanceFields()
    fireEvent.click(screen.getByTestId('ceremony-accept'))
    await screen.findByTestId('ceremony-signed')
    expect(screen.queryByTestId('ceremony-signed-gated')).not.toBeInTheDocument()
  })
})

describe('ContractCeremony stale-version handling', () => {
  it('on AGREEMENT_VERSION_MISMATCH forces a FULL owner-state reset (FIX C) and only claims "reloaded" once the refetch settles (FIX B), and does NOT silently sign', async () => {
    const refetch = jest.fn() // resolves to `undefined`: treated as a successful reload
    mockAgreementQuery.refetch = refetch
    mockSignMutation.mutateAsync = jest.fn().mockRejectedValue(
      new ApiError(409, { error: { code: 'AGREEMENT_VERSION_MISMATCH', message: 'stale' } })
    )
    renderCeremony()
    handToOwner()
    scrollToEnd()
    fillAcceptanceFields()
    fireEvent.click(screen.getByTestId('ceremony-accept'))

    // FIX C: the reset is FULL, not just scroll/key-terms: authority, role, and the
    // typed name are cleared too, so the owner re-attests everything.
    await waitFor(() => expect(screen.getByTestId('ceremony-scroll-hint')).toBeInTheDocument())
    expect(screen.getByTestId('ceremony-authority')).not.toBeChecked()
    expect(screen.getByTestId('ceremony-key-terms')).not.toBeChecked()
    expect(screen.getByTestId('ceremony-role')).toHaveValue('')
    expect(screen.getByTestId('ceremony-name')).toHaveValue('')
    expect(screen.getByTestId('ceremony-accept')).toBeDisabled()
    expect(refetch).toHaveBeenCalledTimes(1)

    // FIX B: the notice only claims "reloaded below" once the refetch has actually
    // settled without an error (not unconditionally on the mismatch itself).
    await waitFor(() =>
      expect(screen.getByTestId('ceremony-version-mismatch')).toHaveTextContent(/agreement was updated/i)
    )
    expect(screen.getByTestId('ceremony-version-mismatch')).toHaveTextContent(/reloaded below/i)

    // No silent sign: the ceremony did NOT reach the signed state, and there was no
    // auto-retry (mutateAsync fired exactly once, from the single user click).
    expect(screen.queryByTestId('ceremony-signed')).not.toBeInTheDocument()
    expect(mockSignMutation.mutateAsync).toHaveBeenCalledTimes(1)
  })

  it('shows an honest failure notice (not "reloaded") and keeps signing blocked when the refetch itself fails (FIX B)', async () => {
    const refetch = jest.fn().mockResolvedValue({ isError: true })
    mockAgreementQuery.refetch = refetch
    mockSignMutation.mutateAsync = jest.fn().mockRejectedValue(
      new ApiError(409, { error: { code: 'AGREEMENT_VERSION_MISMATCH', message: 'stale' } })
    )
    renderCeremony()
    handToOwner()
    scrollToEnd()
    fillAcceptanceFields()
    fireEvent.click(screen.getByTestId('ceremony-accept'))

    await waitFor(() =>
      expect(screen.getByTestId('ceremony-version-mismatch')).toHaveTextContent(/could not be reloaded/i)
    )
    const notice = screen.getByTestId('ceremony-version-mismatch')
    expect(notice).not.toHaveTextContent(/reloaded below/i)
    expect(screen.getByTestId('ceremony-reload-retry')).toBeInTheDocument()

    // Signing stays blocked: even after redoing the (reset) acceptance fields, accept
    // is disabled because the reload failed.
    scrollToEnd()
    fillAcceptanceFields()
    expect(screen.getByTestId('ceremony-accept')).toBeDisabled()
  })
})

describe('ContractCeremony full-text presence gate (FIX A)', () => {
  it('does not allow the review gate to arm and blocks the owner panel when the agreement text is empty', () => {
    mockAgreementQuery.data = agreementResponse({ text: '' })
    renderCeremony()
    expect(screen.getByTestId('ceremony-agreement-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('ceremony-precheck')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ceremony-owner-panel')).not.toBeInTheDocument()
  })

  it('does not allow the review gate to arm when the agreement text is whitespace-only', () => {
    mockAgreementQuery.data = agreementResponse({ text: '   \n\t  ' })
    renderCeremony()
    expect(screen.getByTestId('ceremony-agreement-empty')).toBeInTheDocument()
  })

  it('lets the owner retry the read from the empty-text blocking state', () => {
    const refetch = jest.fn()
    mockAgreementQuery = { data: agreementResponse({ text: '' }), isLoading: false, isError: false, refetch }
    renderCeremony()
    fireEvent.click(screen.getByTestId('ceremony-agreement-retry'))
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})

describe('ContractCeremony error surfacing', () => {
  it('surfaces AGREEMENT_LEGAL_REVIEW_REQUIRED via NamedGateBanner without claiming approval', () => {
    mockSignMutation.error = new ApiError(403, {
      error: { code: 'AGREEMENT_LEGAL_REVIEW_REQUIRED', message: 'pending' },
    })
    renderCeremony()
    handToOwner()
    const banner = screen.getByTestId('named-gate-banner')
    expect(banner).toHaveTextContent(/pending legal review/i)
    expect(banner).not.toHaveTextContent(/solicitor/i)
    expect(banner).not.toHaveTextContent(/approved by/i)
  })

  it('overrides STORAGE_NOT_ENABLED with signing-context copy, not the document-upload copy', () => {
    mockSignMutation.error = new ApiError(500, {
      error: { code: 'STORAGE_NOT_ENABLED', message: 'storage off' },
    })
    renderCeremony()
    handToOwner()
    const banner = screen.getByTestId('named-gate-banner')
    expect(banner).toHaveTextContent(/signed pdf could not be stored/i)
    expect(banner).toHaveTextContent(/storage is not enabled in this environment/i)
    expect(banner).not.toHaveTextContent(/could not be uploaded/i)
  })

  it('routes a version mismatch to the re-review notice, not the generic error banner', () => {
    mockSignMutation.error = new ApiError(409, {
      error: { code: 'AGREEMENT_VERSION_MISMATCH', message: 'stale' },
    })
    renderCeremony()
    handToOwner()
    // The generic NamedGateBanner must NOT render for a mismatch (the dedicated notice
    // is shown via the stale-reload path instead), so the two never double up.
    expect(screen.queryByTestId('named-gate-banner')).not.toBeInTheDocument()
  })
})
