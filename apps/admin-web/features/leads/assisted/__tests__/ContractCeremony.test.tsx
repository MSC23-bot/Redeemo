/**
 * ContractCeremony (D65 personalised-agreement): the assisted contract-signing flow reworked
 * to the POST-preview lifecycle (decision doc 2026-07-15-d65-legal-object).
 *
 * Covers the load-bearing ceremony contract:
 *   - step 1-2 rep pre-check + the explicit "operator cannot accept" hand-to-owner;
 *   - the owner enters name + role FIRST, then GENERATES the personalised body (POST preview);
 *   - the FULL personalised body is rendered with a scroll-to-end gate over it;
 *   - the pending-legal-review banner is DRIVEN BY the preview's gated status; never claims approval;
 *   - authority + key-terms gate the accept control; the sign POST ECHOES the reviewed version AND
 *     the server-authoritative reviewedContentHash;
 *   - a separate pre-sign NOTICE lists what evidence WILL be recorded (not completed facts);
 *   - changing a contractual input (name/role) invalidates the previewed body + resets the gates;
 *   - a stale sign (AGREEMENT_REVIEW_HASH_MISMATCH or AGREEMENT_VERSION_MISMATCH) forces a
 *     regenerate + re-review and does NOT silently sign;
 *   - step 7 success: the signed evidence + the gated watermark note + Continue.
 *
 * The React Query hooks are mocked (house idiom), so no QueryClientProvider.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ContractCeremony } from '../ContractCeremony'
import { ApiError } from '@/lib/api/client'
import type { SignAgreementResponse, AgreementPreviewResponse } from '@/lib/api/agreement'

let mockSignMutation: { mutateAsync: jest.Mock; isPending: boolean; error: unknown }
let mockPreviewMutation: { mutateAsync: jest.Mock; isPending: boolean; error: unknown }

jest.mock('@/lib/agreement/useSignAgreement', () => ({
  useSignAgreement: () => mockSignMutation,
}))
jest.mock('@/lib/agreement/useAgreementPreview', () => ({
  useAgreementPreview: () => mockPreviewMutation,
}))

const PERSONALISED_TEXT =
  'Redeemo Merchant Agreement v2.1-draft\n\nParty: Southville Sourdough Ltd.\nSigned by Marta Owner (Owner).\n(full legal wording continues for the length of the agreement)'

function previewResponse(overrides: Partial<AgreementPreviewResponse> = {}): AgreementPreviewResponse {
  return {
    version: '2.1-draft',
    personalisedText: PERSONALISED_TEXT,
    reviewedContentHash: 'reviewed-hash-abc',
    canonicalContentHash: 'canonical-hash-1',
    isDraft: true,
    gated: true,
    ...overrides,
  }
}

function okResponse(overrides: Partial<SignAgreementResponse> = {}): SignAgreementResponse {
  return {
    recordId: 'rec-1',
    agreementVersion: '2.1-draft',
    contentHash: 'abc123def456',
    signedAt: '2026-07-13T13:32:00.000Z',
    contractStatus: 'SIGNED',
    gated: true,
    ...overrides,
  }
}

beforeEach(() => {
  mockSignMutation = { mutateAsync: jest.fn().mockResolvedValue(okResponse()), isPending: false, error: null }
  mockPreviewMutation = { mutateAsync: jest.fn().mockResolvedValue(previewResponse()), isPending: false, error: null }
  // jsdom has no layout: force the agreement container to overflow so the scroll-to-end gate
  // does NOT auto-open.
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, value: 1000 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 180 })
})

afterEach(() => jest.clearAllMocks())

function renderCeremony(onDone = jest.fn()) {
  render(<ContractCeremony merchantId="m-1" businessLegalName="Southville Sourdough Ltd" onDone={onDone} />)
  return { onDone }
}

function handToOwner() {
  fireEvent.click(screen.getByTestId('ceremony-hand-to-owner'))
}
function enterIdentity(name = 'Marta Owner', role = 'Owner') {
  fireEvent.change(screen.getByTestId('ceremony-name'), { target: { value: name } })
  fireEvent.change(screen.getByTestId('ceremony-role'), { target: { value: role } })
}
async function generate() {
  fireEvent.click(screen.getByTestId('ceremony-generate'))
  await screen.findByTestId('ceremony-agreement-fulltext')
}
function scrollToEnd() {
  const el = screen.getByTestId('ceremony-agreement-scroll')
  Object.defineProperty(el, 'scrollTop', { configurable: true, value: 900 })
  fireEvent.scroll(el)
}
function acceptTerms() {
  fireEvent.click(screen.getByTestId('ceremony-authority'))
  fireEvent.click(screen.getByTestId('ceremony-key-terms'))
}

describe('ContractCeremony pre-check + hand to owner', () => {
  it('states the operator cannot accept and hands the device to the owner', () => {
    renderCeremony()
    expect(screen.getByTestId('ceremony-business-name')).toHaveTextContent('Southville Sourdough Ltd')
    expect(screen.getByTestId('ceremony-operator-note')).toHaveTextContent(/cannot accept this agreement/i)
    expect(screen.getByTestId('ceremony-operator-note')).toHaveTextContent(/recorded as the witness/i)
    expect(screen.queryByTestId('ceremony-accept')).not.toBeInTheDocument()
    handToOwner()
    expect(screen.getByTestId('ceremony-owner-panel')).toBeInTheDocument()
  })
})

describe('ContractCeremony generate + review', () => {
  it('requires a name and role before the personalised agreement can be generated', () => {
    renderCeremony()
    handToOwner()
    expect(screen.getByTestId('ceremony-generate')).toBeDisabled()
    enterIdentity()
    expect(screen.getByTestId('ceremony-generate')).toBeEnabled()
  })

  it('generates the personalised body (POST with name + role) and renders the FULL body + version', async () => {
    renderCeremony()
    handToOwner()
    enterIdentity()
    await generate()
    expect(mockPreviewMutation.mutateAsync).toHaveBeenCalledWith({
      signerName: 'Marta Owner',
      signerRoleConfirmation: 'Owner',
    })
    const fullText = screen.getByTestId('ceremony-agreement-fulltext')
    expect(fullText).toHaveTextContent('Redeemo Merchant Agreement v2.1-draft')
    expect(fullText).toHaveTextContent('full legal wording continues')
    expect(screen.getByTestId('ceremony-agreement-scroll')).toHaveTextContent(/Your agreement \(version 2\.1-draft\)/i)
  })

  it('shows the pending-legal-review banner for a gated preview and never claims approval', async () => {
    renderCeremony()
    handToOwner()
    enterIdentity()
    await generate()
    const banner = screen.getByTestId('ceremony-legal-banner')
    expect(banner).toHaveTextContent(/pending legal review/i)
    expect(banner).not.toHaveTextContent(/solicitor/i)
    expect(banner).not.toHaveTextContent(/approved/i)
  })

  it('does NOT show the pending-legal-review banner for a non-gated preview', async () => {
    mockPreviewMutation.mutateAsync = jest.fn().mockResolvedValue(previewResponse({ isDraft: false, gated: false }))
    renderCeremony()
    handToOwner()
    enterIdentity()
    await generate()
    expect(screen.queryByTestId('ceremony-legal-banner')).not.toBeInTheDocument()
  })

  it('surfaces a preview error (e.g. rate limit) via NamedGateBanner', async () => {
    mockPreviewMutation.error = new ApiError(429, { error: { code: 'AGREEMENT_PREVIEW_RATE_LIMITED', message: 'slow down' } })
    renderCeremony()
    handToOwner()
    enterIdentity()
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(/too many preview requests/i)
  })
})

describe('ContractCeremony invalidation', () => {
  it('changing the name after generating clears the reviewed body + resets gates (must regenerate)', async () => {
    renderCeremony()
    handToOwner()
    enterIdentity()
    await generate()
    scrollToEnd()
    acceptTerms()
    expect(screen.getByTestId('ceremony-accept')).toBeEnabled()

    // Editing a contractual input invalidates the reviewed body.
    fireEvent.change(screen.getByTestId('ceremony-name'), { target: { value: 'Marta O. Owner' } })
    expect(screen.queryByTestId('ceremony-agreement-fulltext')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ceremony-accept')).not.toBeInTheDocument()
    expect(screen.getByTestId('ceremony-generate')).toBeInTheDocument()
  })
})

describe('ContractCeremony acceptance gates', () => {
  it('keeps accept disabled until the full personalised body is scrolled to the end', async () => {
    renderCeremony()
    handToOwner()
    enterIdentity()
    await generate()
    acceptTerms()
    expect(screen.getByTestId('ceremony-scroll-hint')).toBeInTheDocument()
    expect(screen.getByTestId('ceremony-accept')).toBeDisabled()
    scrollToEnd()
    expect(screen.queryByTestId('ceremony-scroll-hint')).not.toBeInTheDocument()
    expect(screen.getByTestId('ceremony-accept')).toBeEnabled()
  })

  it('requires authority + key-terms before enabling accept', async () => {
    renderCeremony()
    handToOwner()
    enterIdentity()
    await generate()
    scrollToEnd()
    const accept = screen.getByTestId('ceremony-accept')
    expect(accept).toBeDisabled()
    fireEvent.click(screen.getByTestId('ceremony-authority'))
    expect(accept).toBeDisabled()
    fireEvent.click(screen.getByTestId('ceremony-key-terms'))
    expect(accept).toBeEnabled()
  })

  it('shows the pre-sign evidence NOTICE of what WILL be recorded (not completed facts)', async () => {
    renderCeremony()
    handToOwner()
    enterIdentity()
    await generate()
    const notice = screen.getByTestId('ceremony-presign-notice')
    expect(notice).toHaveTextContent(/when you sign, we will record/i)
    expect(notice).toHaveTextContent(/IP address/i)
    expect(notice).toHaveTextContent(/witnessing Redeemo representative/i)
  })
})

describe('ContractCeremony sign (version + reviewedContentHash echo)', () => {
  it('echoes the reviewed version AND reviewedContentHash, then shows the signed evidence', async () => {
    const onDone = jest.fn()
    renderCeremony(onDone)
    handToOwner()
    enterIdentity()
    await generate()
    scrollToEnd()
    acceptTerms()
    fireEvent.click(screen.getByTestId('ceremony-accept'))

    await waitFor(() => expect(mockSignMutation.mutateAsync).toHaveBeenCalledTimes(1))
    expect(mockSignMutation.mutateAsync).toHaveBeenCalledWith({
      signerName: 'Marta Owner',
      signerRoleConfirmation: 'Owner',
      agreementVersion: '2.1-draft',
      reviewedContentHash: 'reviewed-hash-abc',
    })

    const signed = await screen.findByTestId('ceremony-signed')
    expect(signed).toHaveTextContent('Marta Owner')
    expect(signed).toHaveTextContent('2.1-draft')
    expect(screen.getByTestId('ceremony-signed-gated')).toBeInTheDocument()
    expect(signed).toHaveTextContent(/Merchant 360/i)

    fireEvent.click(screen.getByTestId('ceremony-continue'))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('does not show the gated note when the sign response reports gated:false', async () => {
    mockSignMutation.mutateAsync = jest.fn().mockResolvedValue(okResponse({ gated: false }))
    renderCeremony()
    handToOwner()
    enterIdentity()
    await generate()
    scrollToEnd()
    acceptTerms()
    fireEvent.click(screen.getByTestId('ceremony-accept'))
    await screen.findByTestId('ceremony-signed')
    expect(screen.queryByTestId('ceremony-signed-gated')).not.toBeInTheDocument()
  })
})

describe('ContractCeremony stale handling', () => {
  it('on AGREEMENT_REVIEW_HASH_MISMATCH clears the body, shows the re-review notice, resets gates, and does NOT sign', async () => {
    mockSignMutation.mutateAsync = jest.fn().mockRejectedValue(
      new ApiError(409, { error: { code: 'AGREEMENT_REVIEW_HASH_MISMATCH', message: 'stale' } })
    )
    renderCeremony()
    handToOwner()
    enterIdentity()
    await generate()
    scrollToEnd()
    acceptTerms()
    fireEvent.click(screen.getByTestId('ceremony-accept'))

    await waitFor(() => expect(screen.getByTestId('ceremony-review-stale')).toBeInTheDocument())
    expect(screen.getByTestId('ceremony-review-stale')).toHaveTextContent(/agreement details changed/i)
    // The reviewed body was cleared + the generate step reappears; nothing was signed.
    expect(screen.queryByTestId('ceremony-agreement-fulltext')).not.toBeInTheDocument()
    expect(screen.getByTestId('ceremony-generate')).toBeInTheDocument()
    expect(screen.queryByTestId('ceremony-signed')).not.toBeInTheDocument()
    expect(mockSignMutation.mutateAsync).toHaveBeenCalledTimes(1)
  })

  it('on AGREEMENT_VERSION_MISMATCH shows the version-specific re-review notice and does NOT sign', async () => {
    mockSignMutation.mutateAsync = jest.fn().mockRejectedValue(
      new ApiError(409, { error: { code: 'AGREEMENT_VERSION_MISMATCH', message: 'stale' } })
    )
    renderCeremony()
    handToOwner()
    enterIdentity()
    await generate()
    scrollToEnd()
    acceptTerms()
    fireEvent.click(screen.getByTestId('ceremony-accept'))

    await waitFor(() => expect(screen.getByTestId('ceremony-review-stale')).toBeInTheDocument())
    expect(screen.getByTestId('ceremony-review-stale')).toHaveTextContent(/agreement was updated/i)
    expect(screen.queryByTestId('ceremony-signed')).not.toBeInTheDocument()
  })
})

describe('ContractCeremony error surfacing', () => {
  it('surfaces AGREEMENT_LEGAL_REVIEW_REQUIRED via NamedGateBanner without claiming approval', async () => {
    mockSignMutation.error = new ApiError(403, { error: { code: 'AGREEMENT_LEGAL_REVIEW_REQUIRED', message: 'pending' } })
    renderCeremony()
    handToOwner()
    enterIdentity()
    await generate()
    const banner = screen.getByTestId('named-gate-banner')
    expect(banner).toHaveTextContent(/pending legal review/i)
    expect(banner).not.toHaveTextContent(/solicitor/i)
    expect(banner).not.toHaveTextContent(/approved by/i)
  })

  it('overrides STORAGE_NOT_ENABLED with signing-context copy, not the document-upload copy', async () => {
    mockSignMutation.error = new ApiError(503, { error: { code: 'STORAGE_NOT_ENABLED', message: 'storage off' } })
    renderCeremony()
    handToOwner()
    enterIdentity()
    await generate()
    const banner = screen.getByTestId('named-gate-banner')
    expect(banner).toHaveTextContent(/signature could not be recorded/i)
    expect(banner).toHaveTextContent(/storage is not enabled in this environment/i)
    expect(banner).not.toHaveTextContent(/could not be uploaded/i)
  })

  it('routes a version mismatch (as a static sign error) away from the generic error banner', async () => {
    mockSignMutation.error = new ApiError(409, { error: { code: 'AGREEMENT_VERSION_MISMATCH', message: 'stale' } })
    renderCeremony()
    handToOwner()
    enterIdentity()
    await generate()
    expect(screen.queryByTestId('named-gate-banner')).not.toBeInTheDocument()
  })
})

describe('ContractCeremony back re-arms freshness', () => {
  it('Back clears the identity + previewed body so a second owner starts fresh', async () => {
    renderCeremony()
    handToOwner()
    enterIdentity()
    await generate()
    scrollToEnd()
    acceptTerms()
    expect(screen.getByTestId('ceremony-accept')).toBeEnabled()

    fireEvent.click(screen.getByTestId('ceremony-back'))
    expect(screen.getByTestId('ceremony-precheck')).toBeInTheDocument()
    handToOwner()

    expect(screen.getByTestId('ceremony-name')).toHaveValue('')
    expect(screen.getByTestId('ceremony-role')).toHaveValue('')
    expect(screen.queryByTestId('ceremony-agreement-fulltext')).not.toBeInTheDocument()
    expect(screen.getByTestId('ceremony-generate')).toBeDisabled()
  })
})
