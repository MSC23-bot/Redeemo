/**
 * redemptions.ts: typed client for the D67 admin redemptions list endpoint.
 *
 * apiFetch is mocked to verify URL, query-string building, auth option, and
 * Zod parsing. Mirrors lib/api/__tests__/merchants.test.ts's style.
 */
import { redemptionsApi, redemptionRowSchema, listRedemptionsResponseSchema } from '../redemptions'
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

const ROW = {
  id: 'r1',
  redemptionCode: 'A7K2P9X4',
  voucher: { id: 'v1', title: 'Half-price pizza', type: 'BOGO' },
  branch: { id: 'b1', name: 'Main Branch' },
  merchant: { id: 'm1', businessName: 'Acme Coffee' },
  customerName: 'Sarah K.',
  redeemedAt: '2026-07-01T10:00:00.000Z',
  status: 'AWAITING_VALIDATION',
  validatedAt: null,
  validationMethod: null,
  validatedByLabel: null,
  estimatedSaving: 5,
  isTestData: true,
}

describe('redemptionsApi.list', () => {
  it('GET /api/v1/admin/redemptions with auth:true and no query string when no params given', async () => {
    mockedApiFetch.mockResolvedValueOnce({ items: [ROW], total: 1, limit: 25, offset: 0 })
    const result = await redemptionsApi.list()
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/redemptions', { auth: true })
    expect(result.total).toBe(1)
    expect(result.items[0].merchant.businessName).toBe('Acme Coffee')
  })

  it('builds the query string from the supplied filters', async () => {
    mockedApiFetch.mockResolvedValueOnce({ items: [], total: 0, limit: 25, offset: 0 })
    await redemptionsApi.list({
      merchantId: 'm1',
      branchId: 'b1',
      status: 'validated',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-09T00:00:00.000Z',
      voucherType: 'FREEBIE',
      code: 'coffee',
      sort: 'saving',
      includeTest: false,
      limit: 50,
      offset: 25,
    })
    const url = mockedApiFetch.mock.calls[0][0] as string
    expect(url).toContain('/api/v1/admin/redemptions?')
    expect(url).toContain('merchantId=m1')
    expect(url).toContain('branchId=b1')
    expect(url).toContain('status=validated')
    expect(url).toContain('voucherType=FREEBIE')
    expect(url).toContain('code=coffee')
    expect(url).toContain('sort=saving')
    expect(url).toContain('includeTest=false')
    expect(url).toContain('limit=50')
    expect(url).toContain('offset=25')
  })

  it('Zod-parses the success response', async () => {
    mockedApiFetch.mockResolvedValueOnce({ items: [ROW], total: 1, limit: 25, offset: 0 })
    const result = await redemptionsApi.list()
    expect(result).toEqual({ items: [ROW], total: 1, limit: 25, offset: 0 })
  })

  it('tolerates an unknown status string (drift resilience)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ items: [{ ...ROW, status: 'SOMETHING_NEW' }], total: 1, limit: 25, offset: 0 })
    const result = await redemptionsApi.list()
    expect(result.items[0].status).toBe('SOMETHING_NEW')
  })

  it('propagates ApiError with .code on a 403', async () => {
    const err = new ApiError(403, { error: { code: 'ADMIN_CAPABILITY_DENIED', message: 'Denied' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(redemptionsApi.list()).rejects.toMatchObject({ code: 'ADMIN_CAPABILITY_DENIED' })
  })

  it('throws on a malformed response (Zod validation)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ bad: 'shape' })
    await expect(redemptionsApi.list()).rejects.toThrow()
  })
})

describe('redemptionRowSchema / listRedemptionsResponseSchema', () => {
  it('parses a single row', () => {
    expect(redemptionRowSchema.parse(ROW)).toEqual(ROW)
  })

  it('parses the paginated envelope', () => {
    const payload = { items: [ROW], total: 1, limit: 25, offset: 0 }
    expect(listRedemptionsResponseSchema.parse(payload)).toEqual(payload)
  })

  it('never carries a redemptionPin or customer email/phone field', () => {
    const json = JSON.stringify(ROW)
    expect(json).not.toContain('redemptionPin')
    expect(json).not.toContain('email')
    expect(json).not.toContain('phone')
  })
})
