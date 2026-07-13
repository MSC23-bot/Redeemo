/**
 * AgreementEvidenceCard (D65 Slice 4): the Merchant 360 contract evidence block.
 *
 * Covers: the signed state renders the current-contract facts from the existing
 * merchant-detail `agreement` block (method label, term window, signed date); the
 * unsigned state renders the honest not-signed copy; and the download / richer
 * evidence affordance is disabled while the Slice 4 evidence read is pending
 * (never fabricated).
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { AgreementEvidenceCard } from '../AgreementEvidenceCard'
import type { Agreement } from '@/lib/api/merchants'

function signed(overrides: Partial<Agreement> = {}): Agreement {
  return {
    contractStatus: 'SIGNED',
    contractStartDate: '2026-07-13T00:00:00.000Z',
    contractEndDate: '2027-07-13T00:00:00.000Z',
    signatureMethod: 'CLICK_TO_AGREE',
    signedAt: '2026-07-13T13:32:00.000Z',
    ...overrides,
  }
}

describe('AgreementEvidenceCard', () => {
  it('renders the signed contract facts from the agreement block', () => {
    render(<AgreementEvidenceCard agreement={signed()} />)
    expect(screen.getByTestId('agreement-evidence-card')).toBeInTheDocument()
    const facts = screen.getByTestId('agreement-evidence-facts')
    expect(facts).toHaveTextContent(/Click to agree/i)
    expect(facts).toHaveTextContent('2026') // signed + term dates
    expect(screen.queryByTestId('agreement-evidence-unsigned')).not.toBeInTheDocument()
  })

  it('renders the honest not-signed state when the contract is unsigned', () => {
    render(<AgreementEvidenceCard agreement={signed({ contractStatus: 'NOT_SIGNED', signedAt: null })} />)
    expect(screen.getByTestId('agreement-evidence-unsigned')).toHaveTextContent(/not signed the 12-month agreement/i)
    expect(screen.queryByTestId('agreement-evidence-facts')).not.toBeInTheDocument()
  })

  it('handles a missing agreement block without crashing', () => {
    render(<AgreementEvidenceCard agreement={undefined} />)
    expect(screen.getByTestId('agreement-evidence-card')).toBeInTheDocument()
    expect(screen.getByTestId('agreement-evidence-unsigned')).toBeInTheDocument()
  })

  it('keeps the signed-document download disabled until the evidence read ships', () => {
    render(<AgreementEvidenceCard agreement={signed()} />)
    expect(screen.getByTestId('agreement-download')).toBeDisabled()
  })
})
