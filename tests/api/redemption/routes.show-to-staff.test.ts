import { describe, it, expect, vi } from 'vitest'
import { customerRedemptionRoutes } from '../../../src/api/redemption/routes'

// Smoke tests for the two customer routes added in M3:
//   - GET /api/v1/redemption/me/:code           (Show-to-Staff polling)
//   - POST /api/v1/redemption/:code/screenshot-flag (anti-fraud telemetry)
//
// Both routes MUST be registered inside `customerRedemptionRoutes` so
// they inherit customer-JWT auth via the redemption plugin's scoped
// `app.authenticateCustomer` preHandler — see src/api/redemption/plugin.ts.
//
// We verify the path registration shape only here. Service-level
// behaviour is covered by the unit tests against
// flagRedemptionScreenshot + getMyRedemptionByCode.

describe('customerRedemptionRoutes — Show-to-Staff route registration', () => {
  it('registers GET /api/v1/redemption/me/:code', async () => {
    const get = vi.fn()
    const post = vi.fn()
    await customerRedemptionRoutes({ get, post } as any)
    const paths = (get.mock.calls as Array<[string, ...unknown[]]>).map((c) => c[0])
    expect(paths).toContain('/api/v1/redemption/me/:code')
  })

  it('registers POST /api/v1/redemption/:code/screenshot-flag', async () => {
    const get = vi.fn()
    const post = vi.fn()
    await customerRedemptionRoutes({ get, post } as any)
    const paths = (post.mock.calls as Array<[string, ...unknown[]]>).map((c) => c[0])
    expect(paths).toContain('/api/v1/redemption/:code/screenshot-flag')
  })

  it('keeps the existing customer routes registered alongside the new ones (regression)', async () => {
    const get = vi.fn()
    const post = vi.fn()
    await customerRedemptionRoutes({ get, post } as any)
    const getPaths  = (get.mock.calls  as Array<[string, ...unknown[]]>).map((c) => c[0])
    const postPaths = (post.mock.calls as Array<[string, ...unknown[]]>).map((c) => c[0])

    // M2 customer routes
    expect(postPaths).toContain('/api/v1/redemption')
    expect(getPaths).toContain('/api/v1/redemption/my')
    expect(getPaths).toContain('/api/v1/redemption/my/:id')
    // M3 additions
    expect(getPaths).toContain('/api/v1/redemption/me/:code')
    expect(postPaths).toContain('/api/v1/redemption/:code/screenshot-flag')
  })
})
