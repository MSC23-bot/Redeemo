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
import { merchantProfileSchema } from '../profile'

const BASE = { id: 'm1', businessName: 'Acme', status: 'ACTIVE', onboardingStep: 'LIVE' }

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
