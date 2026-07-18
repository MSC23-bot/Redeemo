/**
 * AgreementEvidenceCard (D65 Slice 4 summary + lane-2 evidence read). Covers:
 *   - signed / unsigned / missing-agreement summary rendering (unchanged)
 *   - the "View signing evidence" action is CAP-GATED (absent without contract:view-evidence)
 *     and only offered for a SIGNED contract
 *   - the evidence detail is loaded ON EXPLICIT CLICK ONLY (enabled:false until clicked)
 *   - the loaded detail shows the ordinary tier and NEVER the withheld fields
 *   - "Download signed PDF" hits the server-proxied download (agreementApi.downloadEvidencePdf)
 *   - an evidence read error surfaces via NamedGateBanner
 *
 * The evidence hook is mocked (controllable state); the download runs through a real
 * QueryClientProvider with agreementApi.downloadEvidencePdf mocked.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AgreementEvidenceCard } from '../AgreementEvidenceCard'
import { ApiError } from '@/lib/api/client'
import type { Agreement } from '@/lib/api/merchants'
import type { AgreementEvidenceResponse } from '@/lib/api/agreement'

// ── Mocks ─────────────────────────────────────────────────────────────────────

let mockEvidence: {
  data: AgreementEvidenceResponse | undefined
  isFetching: boolean
  isError: boolean
  error: unknown
  refetch: jest.Mock
}
const mockUseAgreementEvidence = jest.fn()
jest.mock('@/lib/agreement/useAgreementEvidence', () => ({
  useAgreementEvidence: (merchantId: string, enabled: boolean) => {
    mockUseAgreementEvidence(merchantId, enabled)
    return mockEvidence
  },
}))

jest.mock('@/lib/api/agreement', () => ({
  agreementApi: { downloadEvidencePdf: jest.fn() },
}))
import { agreementApi } from '@/lib/api/agreement'
const mockDownload = agreementApi.downloadEvidencePdf as jest.Mock

// The dormant release gate. Default it ON for the ACTIVATED-behaviour tests below (they assert the
// feature once enabled); the fail-closed suite overrides it to OFF.
jest.mock('@/lib/flags', () => ({ isEvidenceUiEnabled: jest.fn() }))
import { isEvidenceUiEnabled } from '@/lib/flags'
const mockIsEvidenceUiEnabled = isEvidenceUiEnabled as jest.Mock

// ── Fixtures / helpers ──────────────────────────────────────────────────────────

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

const EVIDENCE: AgreementEvidenceResponse = {
  agreementVersion: '2.1-draft',
  isDraft: true,
  gated: true,
  contentHash: 'canonicalhash1234',
  reviewedContentHash: 'reviewedhash5678',
  signerName: 'Priya Nair',
  signerRoleConfirmation: 'Owner',
  method: 'IN_PERSON_ASSISTED',
  signedAt: '2026-07-16T10:00:00.000Z',
  witnessName: 'Sam Rep',
}

function renderCard(props: { agreement: Agreement | undefined; merchantId?: string; canViewEvidence?: boolean }) {
  // No QueryClientProvider: the evidence hook is mocked and the download is a plain handler, so the
  // card carries no react-query dependency of its own.
  return render(
    <AgreementEvidenceCard
      agreement={props.agreement}
      merchantId={props.merchantId ?? 'm-1'}
      canViewEvidence={props.canViewEvidence ?? false}
    />,
  )
}

beforeEach(() => {
  mockEvidence = { data: undefined, isFetching: false, isError: false, error: undefined, refetch: jest.fn() }
  mockUseAgreementEvidence.mockClear()
  mockDownload.mockReset()
  mockIsEvidenceUiEnabled.mockReturnValue(true) // activated by default; fail-closed suite overrides
  ;(global.URL.createObjectURL as unknown) = jest.fn(() => 'blob:mock')
  ;(global.URL.revokeObjectURL as unknown) = jest.fn()
  // Stub the anchor click so jsdom does not attempt (unimplemented) navigation on the download.
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

// ── Summary (unchanged) ─────────────────────────────────────────────────────────

describe('AgreementEvidenceCard summary', () => {
  it('renders the signed contract facts from the agreement block', () => {
    renderCard({ agreement: signed() })
    const facts = screen.getByTestId('agreement-evidence-facts')
    expect(facts).toHaveTextContent(/Click to agree/i)
    expect(facts).toHaveTextContent('2026')
    expect(screen.queryByTestId('agreement-evidence-unsigned')).not.toBeInTheDocument()
  })

  it('renders the honest not-signed state when the contract is unsigned', () => {
    renderCard({ agreement: signed({ contractStatus: 'NOT_SIGNED', signedAt: null }) })
    expect(screen.getByTestId('agreement-evidence-unsigned')).toHaveTextContent(/not signed the 12-month agreement/i)
    expect(screen.queryByTestId('agreement-evidence-facts')).not.toBeInTheDocument()
  })

  it('handles a missing agreement block without crashing', () => {
    renderCard({ agreement: undefined })
    expect(screen.getByTestId('agreement-evidence-card')).toBeInTheDocument()
    expect(screen.getByTestId('agreement-evidence-unsigned')).toBeInTheDocument()
  })
})

// ── Lane-2 evidence read ─────────────────────────────────────────────────────────

describe('AgreementEvidenceCard signing-evidence read', () => {
  it('CAP-GATED: no "View signing evidence" action without contract:view-evidence', () => {
    renderCard({ agreement: signed(), canViewEvidence: false })
    expect(screen.queryByTestId('agreement-view-evidence')).not.toBeInTheDocument()
  })

  it('no evidence action for an unsigned contract even with the capability', () => {
    renderCard({ agreement: signed({ contractStatus: 'NOT_SIGNED', signedAt: null }), canViewEvidence: true })
    expect(screen.queryByTestId('agreement-view-evidence')).not.toBeInTheDocument()
  })

  it('offers the action but does NOT auto-load the evidence (enabled:false until clicked)', () => {
    renderCard({ agreement: signed(), canViewEvidence: true })
    expect(screen.getByTestId('agreement-view-evidence')).toBeInTheDocument()
    expect(screen.queryByTestId('agreement-evidence-detail')).not.toBeInTheDocument()
    // The hook was mounted disabled: no request fires on M360 open.
    expect(mockUseAgreementEvidence).toHaveBeenCalledWith('m-1', false)
    expect(mockUseAgreementEvidence).not.toHaveBeenCalledWith('m-1', true)
  })

  it('loads ON CLICK: enables the read and renders the ordinary tier, NEVER the withheld fields', () => {
    mockEvidence.data = EVIDENCE
    renderCard({ agreement: signed(), canViewEvidence: true })

    fireEvent.click(screen.getByTestId('agreement-view-evidence'))

    // The read is now enabled (load-on-click).
    expect(mockUseAgreementEvidence).toHaveBeenLastCalledWith('m-1', true)
    const detail = screen.getByTestId('agreement-evidence-detail')
    expect(detail).toHaveTextContent('2.1-draft')
    expect(detail).toHaveTextContent('Priya Nair')
    expect(detail).toHaveTextContent('Owner')
    expect(detail).toHaveTextContent('Sam Rep')
    expect(detail).toHaveTextContent('canonicalhash1234')
    expect(detail).toHaveTextContent('reviewedhash5678')
    // The draft version is flagged (never claims solicitor approval).
    expect(screen.getByTestId('agreement-evidence-draft')).toBeInTheDocument()
    // WITHHELD tier is never present in the DOM (there are no fields for it).
    expect(detail).not.toHaveTextContent(/@/) // no witness email
    expect(detail).not.toHaveTextContent('203.0.113') // no IP
    expect(detail).not.toHaveTextContent(/mozilla|tablet/i) // no user-agent
  })

  it('"Download signed PDF" hits the server-proxied download route', async () => {
    mockEvidence.data = EVIDENCE
    mockDownload.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }))
    renderCard({ agreement: signed(), merchantId: 'm-42', canViewEvidence: true })

    fireEvent.click(screen.getByTestId('agreement-view-evidence'))
    fireEvent.click(screen.getByTestId('agreement-evidence-download'))

    await waitFor(() => expect(mockDownload).toHaveBeenCalledWith('m-42'))
  })

  it('surfaces an evidence read error via NamedGateBanner', () => {
    mockEvidence.isError = true
    mockEvidence.error = new ApiError(404, { error: { code: 'EVIDENCE_NOT_FOUND' } })
    renderCard({ agreement: signed(), canViewEvidence: true })

    fireEvent.click(screen.getByTestId('agreement-view-evidence'))
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(/no signing-evidence record/i)
    expect(screen.queryByTestId('agreement-evidence-detail')).not.toBeInTheDocument()
  })
})

// ── Dormant release gate (fail closed) ───────────────────────────────────────────
// When NEXT_PUBLIC_EVIDENCE_UI_ENABLED is not exactly 'true', the whole feature is OFF even for an
// authorized admin on a SIGNED contract: no controls render and zero evidence/PDF requests fire.
describe('AgreementEvidenceCard release gate OFF (fail closed)', () => {
  beforeEach(() => {
    mockIsEvidenceUiEnabled.mockReturnValue(false)
  })

  it('renders NO evidence action even with the capability on a signed contract', () => {
    renderCard({ agreement: signed(), canViewEvidence: true })
    // The summary still renders (existing M360 behaviour unchanged)...
    expect(screen.getByTestId('agreement-evidence-facts')).toBeInTheDocument()
    // ...but the gated controls do not.
    expect(screen.queryByTestId('agreement-view-evidence')).not.toBeInTheDocument()
    expect(screen.queryByTestId('agreement-evidence-detail')).not.toBeInTheDocument()
    expect(screen.queryByTestId('agreement-evidence-download')).not.toBeInTheDocument()
  })

  it('issues ZERO evidence requests when OFF (hook never enabled true, no download)', () => {
    renderCard({ agreement: signed(), canViewEvidence: true })
    // The on-click read is never enabled (the button that would set it does not exist)...
    expect(mockUseAgreementEvidence).not.toHaveBeenCalledWith('m-1', true)
    // ...and the server-proxied PDF route is never hit.
    expect(mockDownload).not.toHaveBeenCalled()
  })
})
