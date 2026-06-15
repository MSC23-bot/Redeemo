/**
 * branches.ts — typed client for POST /admin/branches/:id/confirm-location.
 *
 * apiFetch is mocked to verify URL, method, auth option, body, and Zod parsing.
 * Errors propagate as ApiError with .code.
 */
import { branchesApi } from '../branches'
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

describe('branchesApi.confirmLocation', () => {
  const SUCCESS = {
    branchId: 'br-1',
    latitude: 53.645,
    longitude: -1.783,
    locationConfidence: 'MANUALLY_CONFIRMED',
  }

  it('POST /api/v1/admin/branches/:id/confirm-location with auth:true and lat/lng body', async () => {
    mockedApiFetch.mockResolvedValueOnce(SUCCESS)
    const result = await branchesApi.confirmLocation('br-1', { latitude: 53.645, longitude: -1.783 })
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/branches/br-1/confirm-location', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ latitude: 53.645, longitude: -1.783 }),
    })
    expect(result.branchId).toBe('br-1')
    expect(result.locationConfidence).toBe('MANUALLY_CONFIRMED')
  })

  it('Zod-parses the success response', async () => {
    mockedApiFetch.mockResolvedValueOnce(SUCCESS)
    const result = await branchesApi.confirmLocation('br-1', { latitude: 1, longitude: 2 })
    expect(result).toEqual(SUCCESS)
  })

  it('propagates ApiError with .code on BRANCH_NOT_FOUND', async () => {
    const err = new ApiError(404, { error: { code: 'BRANCH_NOT_FOUND', message: 'Not found' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(
      branchesApi.confirmLocation('br-1', { latitude: 1, longitude: 2 })
    ).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND' })
  })

  it('throws on a malformed response — wrong locationConfidence literal (Zod validation)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ ...SUCCESS, locationConfidence: 'ADDRESS_GEOCODED' })
    await expect(
      branchesApi.confirmLocation('br-1', { latitude: 1, longitude: 2 })
    ).rejects.toThrow()
  })

  it('throws on a malformed response — missing fields (Zod validation)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ bad: 'shape' })
    await expect(
      branchesApi.confirmLocation('br-1', { latitude: 1, longitude: 2 })
    ).rejects.toThrow()
  })
})

// ── edit (B2.1 edit-on-behalf) ────────────────────────────────────────────────

describe('branchesApi.edit', () => {
  it('PATCH /api/v1/admin/branches/:branchId with auth:true and the field body', async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: 'br-1' })
    const result = await branchesApi.edit('br-1', {
      phone: '+447700900000',
      email: 'new@branch.test',
      websiteUrl: 'https://branch.test',
      isActive: false,
      reason: 'Owner asked to close this branch.',
    })
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/branches/br-1', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({
        phone: '+447700900000',
        email: 'new@branch.test',
        websiteUrl: 'https://branch.test',
        isActive: false,
        reason: 'Owner asked to close this branch.',
      }),
    })
    expect(result.id).toBe('br-1')
  })

  it('sends null contact fields to clear them', async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: 'br-1' })
    await branchesApi.edit('br-1', {
      phone: null,
      email: null,
      websiteUrl: null,
      isActive: true,
      reason: 'Cleared stale contacts.',
    })
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/branches/br-1', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({
        phone: null,
        email: null,
        websiteUrl: null,
        isActive: true,
        reason: 'Cleared stale contacts.',
      }),
    })
  })

  it('propagates ApiError with .code on BRANCH_NOT_FOUND', async () => {
    const err = new ApiError(404, { error: { code: 'BRANCH_NOT_FOUND', message: 'Not found' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(
      branchesApi.edit('br-1', { reason: 'x' })
    ).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND' })
  })
})

// ── create (B2.4 branch create) ───────────────────────────────────────────────

describe('branchesApi.create', () => {
  const input = { name: 'New Branch', addressLine1: '1 St', city: 'London', postcode: 'EC1A 1BB', reason: 'merchant asked' }

  it('POST /admin/merchants/:id/branches with auth:true and the body', async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: 'br-new' })
    const result = await branchesApi.create('m-1', input)
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/merchants/m-1/branches', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    })
    expect(result.id).toBe('br-new')
  })

  it('omits blank/undefined optional keys from the wire body (no empty strings sent)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: 'br-new' })
    // The dialog passes undefined for blank optionals; JSON.stringify must drop them
    // so the backend .strict() body sees only the filled fields.
    await branchesApi.create('m-1', { ...input, addressLine2: undefined, phone: undefined, email: undefined, websiteUrl: undefined })
    const sentBody = JSON.parse((mockedApiFetch.mock.calls[0][1] as { body: string }).body)
    expect(sentBody).not.toHaveProperty('addressLine2')
    expect(sentBody).not.toHaveProperty('phone')
    expect(sentBody).not.toHaveProperty('email')
    expect(sentBody).not.toHaveProperty('websiteUrl')
    expect(sentBody).toMatchObject({ name: 'New Branch', postcode: 'EC1A 1BB', reason: 'merchant asked' })
  })

  it('propagates ApiError with .code on POSTCODE_NOT_FOUND', async () => {
    const err = new ApiError(400, { error: { code: 'POSTCODE_NOT_FOUND', message: 'Bad postcode' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(branchesApi.create('m-1', input)).rejects.toMatchObject({ code: 'POSTCODE_NOT_FOUND' })
  })
})

// ── softDelete (B2.4 branch soft-delete) ──────────────────────────────────────

describe('branchesApi.softDelete', () => {
  it('POST /admin/branches/:branchId/delete with auth:true and { reason } body', async () => {
    mockedApiFetch.mockResolvedValueOnce({ ok: true })
    const result = await branchesApi.softDelete('br-1', 'permanently closed')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/branches/br-1/delete', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ reason: 'permanently closed' }),
    })
    expect(result.ok).toBe(true)
  })

  it('propagates ApiError with .code on BRANCH_IS_MAIN', async () => {
    const err = new ApiError(409, { error: { code: 'BRANCH_IS_MAIN', message: 'main' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(branchesApi.softDelete('br-1', 'x')).rejects.toMatchObject({ code: 'BRANCH_IS_MAIN' })
  })
})
