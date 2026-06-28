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
