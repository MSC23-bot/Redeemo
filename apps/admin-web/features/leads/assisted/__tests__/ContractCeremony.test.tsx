/**
 * ContractCeremony (D65 in-person signing): the assisted contract-signing flow.
 *
 * Covers the load-bearing ceremony contract (spec §2 steps 1-7):
 *   - the persistent pending-legal-review banner (never claims solicitor approval);
 *   - step 1-2 rep pre-check + the explicit "operator cannot accept" hand-to-owner;
 *   - step 3 scroll-to-end gate: accept stays disabled until the owner scrolls
 *     the agreement to the end, even with every other field complete;
 *   - steps 4-6: authority attestation + role + key-terms + typed name gate the
 *     accept control; the POST carries { signerName, signerRoleConfirmation };
 *   - step 7 success: the signed evidence + the gated watermark note + Continue;
 *   - the AGREEMENT_LEGAL_REVIEW_REQUIRED error surfaces via NamedGateBanner with
 *     copy that never implies solicitor approval.
 *
 * The React Query mutation hook is mocked (house idiom), so no QueryClientProvider.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ContractCeremony } from '../ContractCeremony'
import { ApiError } from '@/lib/api/client'
import type { SignAgreementResponse } from '@/lib/api/agreement'

// Mutable mutation stub; the jest.mock factory may reference `mock`-prefixed vars.
let mockSignMutation: { mutateAsync: jest.Mock; isPending: boolean; error: unknown }

jest.mock('@/lib/agreement/useSignAgreement', () => ({
  useSignAgreement: () => mockSignMutation,
}))

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

describe('ContractCeremony pre-check + hand to owner', () => {
  it('shows the pending-legal-review banner and never claims solicitor approval', () => {
    renderCeremony()
    const banner = screen.getByTestId('ceremony-legal-banner')
    expect(banner).toHaveTextContent(/pending legal review/i)
    expect(banner).not.toHaveTextContent(/solicitor/i)
    expect(banner).not.toHaveTextContent(/approved/i)
  })

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

describe('ContractCeremony acceptance gates', () => {
  it('keeps accept disabled until the agreement is scrolled to the end', () => {
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

describe('ContractCeremony sign', () => {
  it('posts the typed name + role and shows the signed evidence + gated note', async () => {
    const onDone = jest.fn()
    renderCeremony(onDone)
    handToOwner()
    scrollToEnd()
    fillAcceptanceFields()
    fireEvent.click(screen.getByTestId('ceremony-accept'))

    await waitFor(() => expect(mockSignMutation.mutateAsync).toHaveBeenCalledTimes(1))
    expect(mockSignMutation.mutateAsync).toHaveBeenCalledWith({
      signerName: 'Marta Owner',
      signerRoleConfirmation: 'Owner',
    })

    const signed = await screen.findByTestId('ceremony-signed')
    expect(signed).toHaveTextContent('Marta Owner')
    expect(signed).toHaveTextContent('Owner')
    expect(signed).toHaveTextContent('2.0-draft')
    // gated: true -> the draft/pending-review watermark note.
    expect(screen.getByTestId('ceremony-signed-gated')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('ceremony-continue'))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('does not show the gated note when the backend reports gated:false', async () => {
    mockSignMutation.mutateAsync = jest.fn().mockResolvedValue(okResponse({ gated: false }))
    renderCeremony()
    handToOwner()
    scrollToEnd()
    fillAcceptanceFields()
    fireEvent.click(screen.getByTestId('ceremony-accept'))
    await screen.findByTestId('ceremony-signed')
    expect(screen.queryByTestId('ceremony-signed-gated')).not.toBeInTheDocument()
  })

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
})
