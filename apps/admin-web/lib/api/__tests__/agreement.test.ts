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

// ── agreementApi.sign: request body ─────────────────────────────────────────────

describe('agreementApi.sign request body', () => {
  it('POSTs the correct URL with auth:true', async () => {
    mockedApiFetch.mockResolvedValueOnce(okResponse())
    await agreementApi.sign('m-1', { signerName: 'Marta Owner', signerRoleConfirmation: 'Owner' })
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/merchants/m-1/agreement/sign',
      expect.objectContaining({ method: 'POST', auth: true })
    )
  })

  it('sends ONLY signerName + signerRoleConfirmation when agreementVersion is absent', async () => {
    mockedApiFetch.mockResolvedValueOnce(okResponse())
    await agreementApi.sign('m-1', { signerName: 'Marta Owner', signerRoleConfirmation: 'Owner' })
    const [, init] = mockedApiFetch.mock.calls[0]
    const body = JSON.parse((init as { body: string }).body)
    // A regression that always sends agreementVersion (even as undefined/empty)
    // would silently override the backend's current-version pin; a spurious key
    // (e.g. a client-supplied witness label) would be rejected by the strict
    // route. This must fail if either regresses.
    expect(body).toEqual({ signerName: 'Marta Owner', signerRoleConfirmation: 'Owner' })
    expect(Object.keys(body).sort()).toEqual(['signerName', 'signerRoleConfirmation'])
  })

  it('includes agreementVersion when explicitly provided', async () => {
    mockedApiFetch.mockResolvedValueOnce(okResponse())
    await agreementApi.sign('m-1', {
      signerName: 'Marta Owner',
      signerRoleConfirmation: 'Owner',
      agreementVersion: '2.0-draft',
    })
    const [, init] = mockedApiFetch.mock.calls[0]
    const body = JSON.parse((init as { body: string }).body)
    expect(body).toEqual({
      signerName: 'Marta Owner',
      signerRoleConfirmation: 'Owner',
      agreementVersion: '2.0-draft',
    })
  })

})

// ── agreementApi.sign: response parsing ─────────────────────────────────────────

describe('agreementApi.sign response parsing', () => {
  it('returns the parsed SignAgreementResponse', async () => {
    mockedApiFetch.mockResolvedValueOnce(okResponse({ gated: false }))
    const result = await agreementApi.sign('m-1', { signerName: 'Marta Owner', signerRoleConfirmation: 'Owner' })
    expect(result.recordId).toBe('rec-1')
    expect(result.agreementVersion).toBe('2.0-draft')
    expect(result.contentHash).toBe('abc123def456')
    expect(result.signedAt).toBe('2026-07-13T13:32:00.000Z')
    expect(result.contractStatus).toBe('SIGNED')
    expect(result.gated).toBe(false)
  })

  it('propagates apiFetch errors', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('Network error'))
    await expect(
      agreementApi.sign('m-1', { signerName: 'Marta Owner', signerRoleConfirmation: 'Owner' })
    ).rejects.toThrow('Network error')
  })

  it('throws when the response is missing a required field', async () => {
    const missingRecordId = okResponse()
    delete (missingRecordId as { recordId?: string }).recordId
    mockedApiFetch.mockResolvedValueOnce(missingRecordId)
    await expect(
      agreementApi.sign('m-1', { signerName: 'Marta Owner', signerRoleConfirmation: 'Owner' })
    ).rejects.toThrow()
  })

  it('throws when gated is not a boolean', async () => {
    mockedApiFetch.mockResolvedValueOnce(okResponse({ gated: 'yes' }))
    await expect(
      agreementApi.sign('m-1', { signerName: 'Marta Owner', signerRoleConfirmation: 'Owner' })
    ).rejects.toThrow()
  })
})
