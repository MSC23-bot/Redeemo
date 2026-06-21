/**
 * F1 resolver tests for lib/notifications/resolveDestination.ts.
 *
 * The resolver maps (referenceType, referenceId, type) to a route + a `built`
 * flag. Only currently-shipped sections are in the map; everything else hits the
 * safe fallback (home, built:false) so a clicked notification never dead-ends.
 */
import { resolveNotificationDestination } from '../resolveDestination'

describe('resolveNotificationDestination', () => {
  it('routes referenceType "merchant" to home, built:true', () => {
    const dest = resolveNotificationDestination('merchant', 'm1', 'MERCHANT_VERIFICATION_UPDATE')
    expect(dest).toEqual({ href: '/', built: true })
  })

  it('routes referenceType "merchant" with a null referenceId to home, built:true', () => {
    const dest = resolveNotificationDestination('merchant', null)
    expect(dest).toEqual({ href: '/', built: true })
  })

  it('falls back to home, built:false for an unknown referenceType', () => {
    const dest = resolveNotificationDestination('voucher', 'v1', 'VOUCHER_APPROVAL_UPDATE')
    expect(dest).toEqual({ href: '/', built: false })
  })

  it('falls back to home, built:false when referenceType is null', () => {
    const dest = resolveNotificationDestination(null, null)
    expect(dest).toEqual({ href: '/', built: false })
  })

  it('never throws (safe fallback) for unexpected input', () => {
    expect(() => resolveNotificationDestination(null, 'x')).not.toThrow()
    expect(() => resolveNotificationDestination('weird', null)).not.toThrow()
  })
})
