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
import { merchantProfileSchema, updateMerchantProfile } from '../profile'

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
