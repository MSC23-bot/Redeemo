/**
 * merchants.ts — typed client for the M6 merchant lifecycle endpoints.
 *
 * apiFetch is mocked to verify URL, method, auth option, body, and Zod parsing.
 * Errors propagate as ApiError with .code.
 */
import { merchantsApi } from '../merchants'
import { apiFetch, ApiError } from '../client'

jest.mock('../client', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {
    status: number
    statusCode: number
    code: string | undefined
    body: unknown
    constructor(status: number, body: unknown) {
      const b = body as { error?: { code?: string; message?: string }; code?: string; message?: string } | null
      const nested = b?.error != null && typeof b.error === 'object' ? (b.error as { code?: string; message?: string }) : null
      super(nested?.message ?? b?.message ?? `API error ${status}`)
      this.name = 'ApiError'
      this.status = status
      this.statusCode = status
      this.code = nested?.code ?? b?.code
      this.body = body
    }
  },
}))

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>

afterEach(() => {
  jest.clearAllMocks()
})

// ── createDraft ─────────────────────────────────────────────────────────────────

describe('merchantsApi.createDraft', () => {
  const FIELDS = {
    businessName: 'Acme Coffee',
    tradingName: 'Acme',
    ownerEmail: 'owner@acme.test',
    ownerFirstName: 'Olivia',
    ownerLastName: 'Owner',
    jobTitle: 'Director',
  }

  const SUCCESS = {
    merchantId: 'm-1',
    ownerAdminId: 'adm-1',
    ownerEmail: 'owner@acme.test',
    passwordSetupRequired: true,
  }

  it('POST /api/v1/admin/merchants with auth:true and the field body', async () => {
    mockedApiFetch.mockResolvedValueOnce(SUCCESS)
    const result = await merchantsApi.createDraft(FIELDS)
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/merchants', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(FIELDS),
    })
    expect(result.merchantId).toBe('m-1')
    expect(result.passwordSetupRequired).toBe(true)
  })

  it('Zod-parses the success response', async () => {
    mockedApiFetch.mockResolvedValueOnce(SUCCESS)
    const result = await merchantsApi.createDraft(FIELDS)
    expect(result).toEqual(SUCCESS)
  })

  it('propagates ApiError with .code on EMAIL_ALREADY_EXISTS', async () => {
    const err = new ApiError(409, { error: { code: 'EMAIL_ALREADY_EXISTS', message: 'Exists' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(merchantsApi.createDraft(FIELDS)).rejects.toMatchObject({
      code: 'EMAIL_ALREADY_EXISTS',
    })
  })

  it('throws on a malformed response (Zod validation)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ bad: 'shape' })
    await expect(merchantsApi.createDraft(FIELDS)).rejects.toThrow()
  })
})

// ── suspend ─────────────────────────────────────────────────────────────────────

describe('merchantsApi.suspend', () => {
  it('POST /api/v1/admin/merchants/:id/suspend with auth:true and reason body', async () => {
    mockedApiFetch.mockResolvedValueOnce({ suspended: true, alreadySuspended: false })
    const result = await merchantsApi.suspend('m-1', 'Fraudulent activity.')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/merchants/m-1/suspend', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ reason: 'Fraudulent activity.' }),
    })
    expect(result.suspended).toBe(true)
    expect(result.alreadySuspended).toBe(false)
  })

  it('propagates ApiError with .code on MERCHANT_NOT_FOUND', async () => {
    const err = new ApiError(404, { error: { code: 'MERCHANT_NOT_FOUND', message: 'Not found' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(merchantsApi.suspend('m-1', 'reason')).rejects.toMatchObject({
      code: 'MERCHANT_NOT_FOUND',
    })
  })

  it('throws on a malformed response (Zod validation)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ suspended: true })
    await expect(merchantsApi.suspend('m-1', 'reason')).rejects.toThrow()
  })
})

// ── reactivate ───────────────────────────────────────────────────────────────────

describe('merchantsApi.reactivate', () => {
  it('POST /api/v1/admin/merchants/:id/reactivate with auth:true and no body', async () => {
    mockedApiFetch.mockResolvedValueOnce({ reactivated: true, alreadyActive: false })
    const result = await merchantsApi.reactivate('m-1')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/merchants/m-1/reactivate', {
      method: 'POST',
      auth: true,
    })
    expect(result.reactivated).toBe(true)
    expect(result.alreadyActive).toBe(false)
  })

  it('propagates ApiError with .code on MERCHANT_NOT_SUSPENDED', async () => {
    const err = new ApiError(409, { error: { code: 'MERCHANT_NOT_SUSPENDED', message: 'Not suspended' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(merchantsApi.reactivate('m-1')).rejects.toMatchObject({
      code: 'MERCHANT_NOT_SUSPENDED',
    })
  })

  it('throws on a malformed response (Zod validation)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ bad: 'shape' })
    await expect(merchantsApi.reactivate('m-1')).rejects.toThrow()
  })
})
