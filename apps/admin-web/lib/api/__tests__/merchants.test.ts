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

// ── getById (B2.1 detail) ─────────────────────────────────────────────────────

describe('merchantsApi.getById', () => {
  const DETAIL = {
    merchant: {
      id: 'm-1',
      businessName: 'Acme Coffee',
      tradingName: 'Acme',
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      onboardingStep: 'LIVE',
      websiteUrl: 'https://acme.test',
      vatNumber: 'GB123456789',
      companyNumber: '12345678',
      logoUrl: null,
      category: 'Restaurants',
    },
    branches: [
      {
        id: 'br-1',
        name: 'Main Branch',
        isMainBranch: true,
        addressLine1: '1 High Street',
        addressLine2: null,
        city: 'Huddersfield',
        postcode: 'HD1 1AA',
        localityName: 'Huddersfield',
        locationConfidence: 'MANUALLY_CONFIRMED',
        phone: '+447700900123',
        email: 'main@acme.test',
        websiteUrl: null,
        isActive: true,
      },
    ],
  }

  it('GET /api/v1/admin/merchants/:id with auth:true', async () => {
    mockedApiFetch.mockResolvedValueOnce(DETAIL)
    const result = await merchantsApi.getById('m-1')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/merchants/m-1', { auth: true })
    expect(result.merchant.id).toBe('m-1')
    expect(result.branches).toHaveLength(1)
  })

  it('Zod-parses the detail response including nullable fields', async () => {
    mockedApiFetch.mockResolvedValueOnce(DETAIL)
    const result = await merchantsApi.getById('m-1')
    expect(result).toEqual(DETAIL)
  })

  it('parses a merchant with all-nullable optional fields and empty branches', async () => {
    const minimal = {
      merchant: {
        id: 'm-2',
        businessName: 'Bare Co',
        tradingName: null,
        status: 'REGISTERED',
        verificationStatus: 'NOT_SUBMITTED',
        onboardingStep: 'PROFILE',
        websiteUrl: null,
        vatNumber: null,
        companyNumber: null,
        logoUrl: null,
        category: null,
      },
      branches: [],
    }
    mockedApiFetch.mockResolvedValueOnce(minimal)
    const result = await merchantsApi.getById('m-2')
    expect(result.merchant.tradingName).toBeNull()
    expect(result.merchant.vatNumber).toBeNull()
    expect(result.merchant.companyNumber).toBeNull()
    expect(result.branches).toEqual([])
  })

  it('tolerates an unknown status / verification / locationConfidence string (drift resilience)', async () => {
    const drifted = {
      ...DETAIL,
      merchant: { ...DETAIL.merchant, status: 'FROZEN', verificationStatus: 'ESCALATED' },
      branches: [{ ...DETAIL.branches[0], locationConfidence: 'SOME_NEW_VALUE' }],
    }
    mockedApiFetch.mockResolvedValueOnce(drifted)
    const result = await merchantsApi.getById('m-1')
    expect(result.merchant.status).toBe('FROZEN')
    expect(result.branches[0].locationConfidence).toBe('SOME_NEW_VALUE')
  })

  it('propagates ApiError with .code on MERCHANT_NOT_FOUND', async () => {
    const err = new ApiError(404, { error: { code: 'MERCHANT_NOT_FOUND', message: 'Not found' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(merchantsApi.getById('m-1')).rejects.toMatchObject({ code: 'MERCHANT_NOT_FOUND' })
  })

  it('throws on a malformed response (Zod validation)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ bad: 'shape' })
    await expect(merchantsApi.getById('m-1')).rejects.toThrow()
  })
})

// ── editProfile (B2.1 edit-on-behalf) ─────────────────────────────────────────

describe('merchantsApi.editProfile', () => {
  it('PATCH /api/v1/admin/merchants/:id/profile with auth:true and { websiteUrl, reason } body', async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: 'm-1' })
    const result = await merchantsApi.editProfile('m-1', {
      websiteUrl: 'https://new.test',
      reason: 'Owner asked over the phone.',
    })
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/merchants/m-1/profile', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ websiteUrl: 'https://new.test', reason: 'Owner asked over the phone.' }),
    })
    expect(result.id).toBe('m-1')
  })

  it('sends a null websiteUrl to clear it', async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: 'm-1' })
    await merchantsApi.editProfile('m-1', { websiteUrl: null, reason: 'Removed dead link.' })
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/merchants/m-1/profile', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ websiteUrl: null, reason: 'Removed dead link.' }),
    })
  })

  it('propagates ApiError with .code on MERCHANT_NOT_FOUND', async () => {
    const err = new ApiError(404, { error: { code: 'MERCHANT_NOT_FOUND', message: 'Not found' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(
      merchantsApi.editProfile('m-1', { websiteUrl: 'x', reason: 'y' })
    ).rejects.toMatchObject({ code: 'MERCHANT_NOT_FOUND' })
  })
})

// ── editIdentity (B2.2 identity edit-on-behalf) ───────────────────────────────

describe('merchantsApi.editIdentity', () => {
  it('PATCH /api/v1/admin/merchants/:id/identity with auth:true and { vat, company, reason, confirm } body', async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: 'm-1' })
    const result = await merchantsApi.editIdentity('m-1', {
      vatNumber: 'GB999',
      companyNumber: '87654321',
      reason: 'Companies House correction.',
      confirm: true,
    })
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/merchants/m-1/identity', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({
        vatNumber: 'GB999',
        companyNumber: '87654321',
        reason: 'Companies House correction.',
        confirm: true,
      }),
    })
    expect(result.id).toBe('m-1')
  })

  it('sends null fields to clear them', async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: 'm-1' })
    await merchantsApi.editIdentity('m-1', { vatNumber: null, companyNumber: null, reason: 'Cleared.', confirm: true })
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/merchants/m-1/identity', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ vatNumber: null, companyNumber: null, reason: 'Cleared.', confirm: true }),
    })
  })

  it('propagates ApiError with .code on MERCHANT_NOT_FOUND', async () => {
    const err = new ApiError(404, { error: { code: 'MERCHANT_NOT_FOUND', message: 'Not found' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(
      merchantsApi.editIdentity('m-1', { vatNumber: 'x', reason: 'y', confirm: true })
    ).rejects.toMatchObject({ code: 'MERCHANT_NOT_FOUND' })
  })
})
