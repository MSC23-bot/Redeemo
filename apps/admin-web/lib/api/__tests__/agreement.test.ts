/**
 * lib/api/agreement: Zod schema parsing + apiFetch wiring for the D65
 * in-person signing ceremony (POST .../agreement/sign).
 *
 * Mirrors lib/api/__tests__/voucherReview.test.ts. Pins the request body shape
 * (a prior regression always sent agreementVersion even when the caller omitted
 * it, which would silently override the backend's current registry version pin;
 * the strict route also rejects any extra key, so the body must carry ONLY the
 * three accepted fields) and the response Zod parse.
 */
import { agreementApi } from '../agreement'

// ── Mock apiFetch ─────────────────────────────────────────────────────────────

jest.mock('../client', () => ({
  apiFetch: jest.fn(),
}))

import { apiFetch } from '../client'

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>

afterEach(() => jest.clearAllMocks())

// ── Fixtures ──────────────────────────────────────────────────────────────────

function okResponse(overrides: Partial<Record<string, unknown>> = {}) {
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

// FIX 1: agreementVersion + reviewedContentHash are now REQUIRED on SignAgreementInput and always
// sent (the strict backend route rejects a body missing either). The ceremony echoes the preview's
// version + server-authoritative hash.
const SIGN_INPUT = {
  signerName: 'Marta Owner',
  signerRoleConfirmation: 'Owner',
  agreementVersion: '2.1-draft',
  reviewedContentHash: 'reviewed-hash-abc',
} as const

// ── agreementApi.sign: request body ─────────────────────────────────────────────

describe('agreementApi.sign request body', () => {
  it('POSTs the correct URL with auth:true', async () => {
    mockedApiFetch.mockResolvedValueOnce(okResponse())
    await agreementApi.sign('m-1', SIGN_INPUT)
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/merchants/m-1/agreement/sign',
      expect.objectContaining({ method: 'POST', auth: true })
    )
  })

  it('FIX 1: ALWAYS sends exactly the four required fields incl. the version + review echo', async () => {
    mockedApiFetch.mockResolvedValueOnce(okResponse())
    await agreementApi.sign('m-1', SIGN_INPUT)
    const [, init] = mockedApiFetch.mock.calls[0]
    const body = JSON.parse((init as { body: string }).body)
    // The strict route rejects a body missing agreementVersion or reviewedContentHash, so the
    // client must always send exactly these four (the review-binding echo) - no more, no less.
    expect(body).toEqual({
      signerName: 'Marta Owner',
      signerRoleConfirmation: 'Owner',
      agreementVersion: '2.1-draft',
      reviewedContentHash: 'reviewed-hash-abc',
    })
    expect(Object.keys(body).sort()).toEqual([
      'agreementVersion', 'reviewedContentHash', 'signerName', 'signerRoleConfirmation',
    ])
  })

  it('passes through the exact echoed version + hash the ceremony reviewed', async () => {
    mockedApiFetch.mockResolvedValueOnce(okResponse())
    await agreementApi.sign('m-1', { ...SIGN_INPUT, agreementVersion: '2.2-draft', reviewedContentHash: 'other-hash' })
    const [, init] = mockedApiFetch.mock.calls[0]
    const body = JSON.parse((init as { body: string }).body)
    expect(body).toEqual({
      signerName: 'Marta Owner',
      signerRoleConfirmation: 'Owner',
      agreementVersion: '2.2-draft',
      reviewedContentHash: 'other-hash',
    })
  })
})

// ── agreementApi.preview: the ceremony personalised-body render ───────────────────

function previewResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    version: '2.1-draft',
    personalisedText: 'Personalised body for Southville Sourdough Ltd, signed by Marta Owner (Owner).',
    reviewedContentHash: 'reviewed-hash-abc',
    canonicalContentHash: 'canonical-hash-1',
    isDraft: true,
    gated: true,
    ...overrides,
  }
}

describe('agreementApi.preview', () => {
  it('POSTs the merchant-scoped preview URL with auth:true and ONLY signer name + role', async () => {
    mockedApiFetch.mockResolvedValueOnce(previewResponse())
    await agreementApi.preview('m-1', { signerName: 'Marta Owner', signerRoleConfirmation: 'Owner' })
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/merchants/m-1/agreement/preview',
      expect.objectContaining({ method: 'POST', auth: true })
    )
    const [, init] = mockedApiFetch.mock.calls[0]
    const body = JSON.parse((init as { body: string }).body)
    expect(body).toEqual({ signerName: 'Marta Owner', signerRoleConfirmation: 'Owner' })
  })

  it('returns the parsed { version, personalisedText, reviewedContentHash, canonicalContentHash, isDraft, gated }', async () => {
    mockedApiFetch.mockResolvedValueOnce(previewResponse({ isDraft: false, gated: false }))
    const result = await agreementApi.preview('m-1', { signerName: 'Marta Owner', signerRoleConfirmation: 'Owner' })
    expect(result.version).toBe('2.1-draft')
    expect(result.personalisedText).toContain('Southville Sourdough Ltd')
    expect(result.reviewedContentHash).toBe('reviewed-hash-abc')
    expect(result.canonicalContentHash).toBe('canonical-hash-1')
    expect(result.isDraft).toBe(false)
    expect(result.gated).toBe(false)
  })

  it('throws when a required field is missing (contract drift surfaces clearly)', async () => {
    const missing = previewResponse()
    delete (missing as { reviewedContentHash?: string }).reviewedContentHash
    mockedApiFetch.mockResolvedValueOnce(missing)
    await expect(
      agreementApi.preview('m-1', { signerName: 'Marta Owner', signerRoleConfirmation: 'Owner' })
    ).rejects.toThrow()
  })
})

// ── agreementApi.getCurrent: the ceremony agreement-text read ────────────────────

function agreementTextResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    version: '2.0-draft',
    text: 'Redeemo Merchant Agreement v2.0-draft\n\nDRAFT - PENDING LEGAL REVIEW\n\nFull wording...',
    contentHash: 'abc123def456',
    isDraft: true,
    gated: true,
    ...overrides,
  }
}

describe('agreementApi.getCurrent', () => {
  it('GETs the platform-global agreement-current URL with auth:true (no merchant id)', async () => {
    mockedApiFetch.mockResolvedValueOnce(agreementTextResponse())
    await agreementApi.getCurrent()
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/agreement/current',
      expect.objectContaining({ method: 'GET', auth: true })
    )
  })

  it('returns the parsed { version, text, contentHash, isDraft, gated }', async () => {
    mockedApiFetch.mockResolvedValueOnce(agreementTextResponse({ isDraft: false, gated: false }))
    const result = await agreementApi.getCurrent()
    expect(result.version).toBe('2.0-draft')
    expect(result.text).toContain('Redeemo Merchant Agreement')
    expect(result.contentHash).toBe('abc123def456')
    expect(result.isDraft).toBe(false)
    expect(result.gated).toBe(false)
  })

  it('throws when a required field is missing (contract drift surfaces clearly)', async () => {
    const missingText = agreementTextResponse()
    delete (missingText as { text?: string }).text
    mockedApiFetch.mockResolvedValueOnce(missingText)
    await expect(agreementApi.getCurrent()).rejects.toThrow()
  })

  it('throws when gated is not a boolean', async () => {
    mockedApiFetch.mockResolvedValueOnce(agreementTextResponse({ gated: 'yes' }))
    await expect(agreementApi.getCurrent()).rejects.toThrow()
  })
})

// ── agreementApi.sign: response parsing ─────────────────────────────────────────

describe('agreementApi.sign response parsing', () => {
  it('returns the parsed SignAgreementResponse', async () => {
    mockedApiFetch.mockResolvedValueOnce(okResponse({ gated: false }))
    const result = await agreementApi.sign('m-1', SIGN_INPUT)
    expect(result.recordId).toBe('rec-1')
    expect(result.agreementVersion).toBe('2.0-draft')
    expect(result.contentHash).toBe('abc123def456')
    expect(result.signedAt).toBe('2026-07-13T13:32:00.000Z')
    expect(result.contractStatus).toBe('SIGNED')
    expect(result.gated).toBe(false)
  })

  it('propagates apiFetch errors', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('Network error'))
    await expect(agreementApi.sign('m-1', SIGN_INPUT)).rejects.toThrow('Network error')
  })

  it('throws when the response is missing a required field', async () => {
    const missingRecordId = okResponse()
    delete (missingRecordId as { recordId?: string }).recordId
    mockedApiFetch.mockResolvedValueOnce(missingRecordId)
    await expect(agreementApi.sign('m-1', SIGN_INPUT)).rejects.toThrow()
  })

  it('throws when gated is not a boolean', async () => {
    mockedApiFetch.mockResolvedValueOnce(okResponse({ gated: 'yes' }))
    await expect(agreementApi.sign('m-1', SIGN_INPUT)).rejects.toThrow()
  })
})
