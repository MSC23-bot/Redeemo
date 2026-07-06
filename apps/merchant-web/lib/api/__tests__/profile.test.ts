/**
 * Insights & Reports: merchantProfileSchema.viewerCapabilities parsing.
 *
 * The Insights nav item is hidden for STAFF using the server-derived
 * viewerCapabilities.canViewInsights. The parser must:
 *   - tolerate a TEMPORARILY ABSENT capability (pre-deploy backend / loading) without
 *     throwing, and
 *   - FAIL CLOSED: absent -> the consumer's `canViewInsights === true` check is false,
 *     so the nav stays hidden until the backend positively reports access.
 */
import {
  merchantProfileSchema,
  updateMerchantProfile,
  createMerchantEditRequest,
  listMerchantEditRequests,
  withdrawMerchantEditRequest,
} from '../profile'

const apiFetch = jest.fn()
jest.mock('../client', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}))

const BASE = { id: 'm1', businessName: 'Acme', status: 'ACTIVE', onboardingStep: 'LIVE' }

beforeEach(() => {
  apiFetch.mockReset()
})

describe('merchantProfileSchema viewerCapabilities (fail-closed Insights nav)', () => {
  it('parses a profile WITHOUT viewerCapabilities and fails closed (absent -> cannot view)', () => {
    const p = merchantProfileSchema.parse(BASE)
    // The consumer derives visibility with `=== true`; an absent capability is false.
    expect(p.viewerCapabilities?.canViewInsights === true).toBe(false)
  })

  it('parses canViewInsights=true (Owner / Branch Manager)', () => {
    const p = merchantProfileSchema.parse({ ...BASE, viewerCapabilities: { canViewInsights: true } })
    expect(p.viewerCapabilities?.canViewInsights).toBe(true)
  })

  it('parses canViewInsights=false (Staff)', () => {
    const p = merchantProfileSchema.parse({ ...BASE, viewerCapabilities: { canViewInsights: false } })
    expect(p.viewerCapabilities?.canViewInsights).toBe(false)
  })

  it('does not throw on a null viewerCapabilities (defensive) and fails closed', () => {
    const p = merchantProfileSchema.parse({ ...BASE, viewerCapabilities: null })
    expect(p.viewerCapabilities?.canViewInsights === true).toBe(false)
  })
})

describe('merchantProfileSchema ownerContact + agreement (Business Profile M1)', () => {
  it('parses a profile WITHOUT ownerContact/agreement (older backend / pre-deploy)', () => {
    const p = merchantProfileSchema.parse(BASE)
    expect(p.ownerContact).toBeUndefined()
    expect(p.agreement).toBeUndefined()
  })

  it('parses a populated ownerContact + agreement', () => {
    const p = merchantProfileSchema.parse({
      ...BASE,
      ownerContact: {
        firstName: 'Priya',
        lastName: 'Shah',
        email: 'owner@acme.test',
        phone: '7000000001',
        phoneCountryCode: '+44',
        jobTitle: 'Founder',
      },
      agreement: {
        acceptedVersion: 'v2',
        acceptedAt: '2026-01-15T10:30:00.000Z',
        signatureMethod: 'CLICK_TO_AGREE',
      },
    })
    expect(p.ownerContact).toEqual({
      firstName: 'Priya',
      lastName: 'Shah',
      email: 'owner@acme.test',
      phone: '7000000001',
      phoneCountryCode: '+44',
      jobTitle: 'Founder',
    })
    expect(p.agreement).toEqual({
      acceptedVersion: 'v2',
      acceptedAt: '2026-01-15T10:30:00.000Z',
      signatureMethod: 'CLICK_TO_AGREE',
    })
  })

  it('accepts null ownerContact + null agreement (no resolvable owner / unsigned merchant)', () => {
    const p = merchantProfileSchema.parse({ ...BASE, ownerContact: null, agreement: null })
    expect(p.ownerContact).toBeNull()
    expect(p.agreement).toBeNull()
  })
})

describe('updateMerchantProfile (Business Profile M3: direct-edit + category change)', () => {
  it('PATCHes the given body to /api/v1/merchant/profile with auth', async () => {
    apiFetch.mockResolvedValueOnce({ ...BASE })
    await updateMerchantProfile({ websiteUrl: 'newsite.co.uk' })
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/profile', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ websiteUrl: 'newsite.co.uk' }),
    })
  })

  it('sends primaryCategoryId + confirm alongside the rest of the body', async () => {
    apiFetch.mockResolvedValueOnce({ ...BASE })
    await updateMerchantProfile({ primaryCategoryId: 'sub-cafe', confirm: true })
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/v1/merchant/profile',
      expect.objectContaining({
        body: JSON.stringify({ primaryCategoryId: 'sub-cafe', confirm: true }),
      }),
    )
  })

  it('parses + returns a full MerchantProfile response unchanged', async () => {
    apiFetch.mockResolvedValueOnce({ ...BASE, websiteUrl: 'newsite.co.uk' })
    const result = await updateMerchantProfile({ websiteUrl: 'newsite.co.uk' })
    expect('requiresConfirmation' in result).toBe(false)
    expect(result).toMatchObject({ id: 'm1', websiteUrl: 'newsite.co.uk' })
  })

  it('parses a { requiresConfirmation, message } category-change preview WITHOUT throwing or coercing it into a profile', async () => {
    apiFetch.mockResolvedValueOnce({
      requiresConfirmation: true,
      message: 'Changing category will discard your existing RMV drafts. Re-send with confirm: true to proceed.',
    })
    const result = await updateMerchantProfile({ primaryCategoryId: 'sub-cafe' })
    expect('requiresConfirmation' in result).toBe(true)
    if ('requiresConfirmation' in result) {
      expect(result.requiresConfirmation).toBe(true)
      expect(result.message).toMatch(/discard your existing rmv drafts/i)
    }
  })

  it('still parses a real profile as a profile even though it never carries requiresConfirmation:true', async () => {
    apiFetch.mockResolvedValueOnce({ ...BASE, primaryCategoryId: 'sub-cafe' })
    const result = await updateMerchantProfile({ primaryCategoryId: 'sub-cafe', confirm: true })
    expect('requiresConfirmation' in result).toBe(false)
    expect(result).toMatchObject({ id: 'm1', primaryCategoryId: 'sub-cafe' })
  })
})

describe('Business Profile M4: edit-request client (mirrors lib/api/branch.ts)', () => {
  it('createMerchantEditRequest POSTs the sensitive subset to /edit-request and returns the parsed MerchantPendingEdit', async () => {
    apiFetch.mockResolvedValueOnce({
      id: 'pe1',
      merchantId: 'm1',
      proposedChanges: { businessName: 'New Name', description: 'New description' },
      status: 'PENDING',
      createdAt: '2026-07-06T10:00:00.000Z',
    })
    const edit = await createMerchantEditRequest({
      businessName: 'New Name',
      tradingName: 'New Trading',
      description: 'New description',
      logoUrl: 'https://cdn.test/logo2.png',
      bannerUrl: 'https://cdn.test/banner2.png',
    })
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/profile/edit-request', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({
        businessName: 'New Name',
        tradingName: 'New Trading',
        description: 'New description',
        logoUrl: 'https://cdn.test/logo2.png',
        bannerUrl: 'https://cdn.test/banner2.png',
      }),
    })
    expect(edit.id).toBe('pe1')
    expect(edit.status).toBe('PENDING')
    expect(edit.createdAt).toBe('2026-07-06T10:00:00.000Z')
  })

  it('listMerchantEditRequests GETs /edit-requests with auth and returns the parsed array (all statuses)', async () => {
    apiFetch.mockResolvedValueOnce([
      {
        id: 'pe1',
        merchantId: 'm1',
        proposedChanges: { businessName: 'A' },
        status: 'PENDING',
        createdAt: '2026-07-06T10:00:00.000Z',
      },
      {
        id: 'pe2',
        merchantId: 'm1',
        proposedChanges: { businessName: 'B' },
        status: 'WITHDRAWN',
        createdAt: '2026-07-05T10:00:00.000Z',
        reviewedAt: '2026-07-05T11:00:00.000Z',
      },
    ])
    const list = await listMerchantEditRequests()
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/profile/edit-requests', {
      method: 'GET',
      auth: true,
    })
    expect(list).toHaveLength(2)
    expect(list[0].status).toBe('PENDING')
    expect(list[1].status).toBe('WITHDRAWN')
  })

  it('withdrawMerchantEditRequest DELETEs /edit-requests/:id with auth and returns the parsed edit', async () => {
    apiFetch.mockResolvedValueOnce({
      id: 'pe1',
      merchantId: 'm1',
      proposedChanges: { businessName: 'A' },
      status: 'WITHDRAWN',
      createdAt: '2026-07-06T10:00:00.000Z',
      reviewedAt: '2026-07-06T11:00:00.000Z',
    })
    const edit = await withdrawMerchantEditRequest('pe1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/profile/edit-requests/pe1', {
      method: 'DELETE',
      auth: true,
    })
    expect(edit.status).toBe('WITHDRAWN')
  })
})
