import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// Customer merchant-invite programme M1 — route-level unit tests. Mirrors the
// house fastify-inject + vi.mock(service) convention used by
// tests/api/customer/reviews.routes.test.ts / savings.routes.test.ts: every
// sibling customer service module is mocked (even when unused by these
// tests) so buildApp() never touches Prisma for routes outside this file.
//
// Codex correction round (2026-07-14): INVITES_ENABLED is now a BOOT-TIME
// gate (src/api/customer/plugin.ts) — the invite router is only ever
// REGISTERED when the flag reads true at the moment buildApp() runs, so
// every test that cares about the flag value must set/unset the env var
// BEFORE calling buildApp(), not after. This is why the flag-off and
// flag-on suites below each own a full buildApp() in their own
// `beforeEach`, rather than sharing one app instance built once at the top
// (the previous M0/M1-draft shape, which could no longer express boot-time
// gating: the app was always built with the flag unset, then the flag was
// flipped on a per-request/per-test basis afterwards).

vi.mock('../../../../src/api/customer/invites/service', () => ({
  submitInvite: vi.fn(),
  searchInvitePlaces: vi.fn(),
  resolveInviteLocationCandidate: vi.fn(),
}))
vi.mock('../../../../src/api/shared/inviteSubmitLimiter', () => ({
  consumeInviteSubmit: vi.fn(),
}))
vi.mock('../../../../src/api/customer/discovery/service', () => ({
  getHomeFeed: vi.fn(), getCustomerMerchant: vi.fn(), getCustomerMerchantBranches: vi.fn(),
  getCustomerVoucher: vi.fn(), searchMerchants: vi.fn(), listActiveCategories: vi.fn(),
  getActiveCampaigns: vi.fn(), getCampaignMerchants: vi.fn(),
}))
vi.mock('../../../../src/api/customer/profile/service', () => ({
  getCustomerProfile: vi.fn(), updateCustomerProfile: vi.fn(),
  updateCustomerInterests: vi.fn(), changeCustomerPassword: vi.fn(),
}))
vi.mock('../../../../src/api/customer/favourites/service', () => ({
  listFavouriteMerchants: vi.fn(), addFavouriteMerchant: vi.fn(), removeFavouriteMerchant: vi.fn(),
  listFavouriteVouchers: vi.fn(), addFavouriteVoucher: vi.fn(), removeFavouriteVoucher: vi.fn(),
}))
vi.mock('../../../../src/api/customer/reviews/service', () => ({
  listMerchantReviews: vi.fn(), listBranchReviews: vi.fn(), upsertBranchReview: vi.fn(),
  deleteBranchReview: vi.fn(), reportReview: vi.fn(), getReviewSummary: vi.fn(), toggleHelpful: vi.fn(),
}))
vi.mock('../../../../src/api/customer/savings/service', () => ({
  getSavingsSummary: vi.fn(), getSavingsRedemptions: vi.fn(), getMonthlyDetail: vi.fn(),
}))

import { submitInvite, searchInvitePlaces, resolveInviteLocationCandidate } from '../../../../src/api/customer/invites/service'
import { consumeInviteSubmit } from '../../../../src/api/shared/inviteSubmitLimiter'
import { AppError } from '../../../../src/api/shared/errors'

const PREFIX = '/api/v1/customer/invites'

function sign(app: FastifyInstance, sub = 'user-1'): string {
  const jwtAny = app.jwt as any
  return jwtAny.customer.sign({ sub, role: 'customer', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
}

/** Builds a fresh app (reading INVITES_ENABLED at THIS moment — the boot-time
 * gate — so the caller must set/unset the env var before calling this) with
 * the standard prisma/redis stubs + a signed customer token. */
async function setupApp() {
  const app = await buildApp()
  const userFindUnique = vi.fn().mockResolvedValue({ id: 'user-1', status: 'ACTIVE' })
  const inviteFindMany = vi.fn().mockResolvedValue([])
  app.decorate('prisma', {
    user: { findUnique: userFindUnique },
    merchantInvite: { findMany: inviteFindMany },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  } as any)
  app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn(), del: vi.fn() } as any)
  await app.ready()
  const token = sign(app)
  return { app, token, userFindUnique, inviteFindMany }
}

function resetServiceMocks() {
  vi.mocked(submitInvite).mockReset()
  vi.mocked(searchInvitePlaces).mockReset()
  vi.mocked(resolveInviteLocationCandidate).mockReset()
  vi.mocked(consumeInviteSubmit).mockReset()
  vi.mocked(consumeInviteSubmit).mockResolvedValue(undefined)
}

describe('customer invite routes', () => {
  // ------------------------------------------------------------------ //
  // Flag OFF AT BOOT: the plugin never registers the invite router
  // (src/api/customer/plugin.ts's `if (isInvitesEnabled())` guard), so every
  // probe — unauthenticated or authenticated — gets Fastify's built-in 404,
  // identical to hitting a route that was never defined.
  // ------------------------------------------------------------------ //
  describe('INVITES_ENABLED unset at boot (true dark-by-default)', () => {
    let app: FastifyInstance
    let token: string
    let userFindUnique: ReturnType<typeof vi.fn>
    let inviteFindMany: ReturnType<typeof vi.fn>

    beforeEach(async () => {
      delete process.env.INVITES_ENABLED
      resetServiceMocks()
      ;({ app, token, userFindUnique, inviteFindMany } = await setupApp())
    })

    afterEach(async () => {
      delete process.env.INVITES_ENABLED
      await app.close()
    })

    it('the invite router is never registered — printRoutes() has no /customer/invites entry', () => {
      // Harness limitation, documented per the M1 correction-round contract:
      // the house test harness has no hook to directly observe whether
      // @fastify/rate-limit or authenticateCustomer's preHandler ran for a
      // given path (no counter/spy surface on either). What IS observable
      // and strictly stronger is that the routes are structurally ABSENT
      // from the router entirely — which entails that no auth check and no
      // rate-limit consumption can possibly run for them, because Fastify
      // never dispatches into a path that was never registered.
      const routes = app.printRoutes()
      expect(routes).not.toContain('invites')
    })

    it('unauthenticated POST .../place-search -> 404 (not 401)', async () => {
      const res = await app.inject({
        method: 'POST', url: `${PREFIX}/place-search`, payload: { query: 'Bloom Cafe' },
      })
      expect(res.statusCode).toBe(404)
      expect(searchInvitePlaces).not.toHaveBeenCalled()
    })

    it('unauthenticated POST /api/v1/customer/invites -> 404 (not 401)', async () => {
      const res = await app.inject({
        method: 'POST', url: PREFIX, payload: { businessName: 'Bloom Cafe', consentShareName: true },
      })
      expect(res.statusCode).toBe(404)
      expect(submitInvite).not.toHaveBeenCalled()
      expect(consumeInviteSubmit).not.toHaveBeenCalled()
    })

    it('unauthenticated GET .../mine -> 404 (not 401)', async () => {
      const res = await app.inject({ method: 'GET', url: `${PREFIX}/mine` })
      expect(res.statusCode).toBe(404)
      expect(inviteFindMany).not.toHaveBeenCalled()
    })

    it('authenticated (valid token) POST .../place-search -> 404, service never called', async () => {
      const res = await app.inject({
        method: 'POST', url: `${PREFIX}/place-search`,
        headers: { authorization: `Bearer ${token}` }, payload: { query: 'Bloom Cafe' },
      })
      expect(res.statusCode).toBe(404)
      expect(searchInvitePlaces).not.toHaveBeenCalled()
    })

    it('authenticated (valid token) POST /api/v1/customer/invites -> 404, no limiter/service call', async () => {
      const res = await app.inject({
        method: 'POST', url: PREFIX,
        headers: { authorization: `Bearer ${token}` }, payload: { businessName: 'Bloom Cafe', consentShareName: true },
      })
      expect(res.statusCode).toBe(404)
      expect(consumeInviteSubmit).not.toHaveBeenCalled()
      expect(submitInvite).not.toHaveBeenCalled()
      expect(userFindUnique).not.toHaveBeenCalled()
    })

    it('authenticated (valid token) GET .../mine -> 404, prisma never touched', async () => {
      const res = await app.inject({
        method: 'GET', url: `${PREFIX}/mine`, headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(404)
      expect(inviteFindMany).not.toHaveBeenCalled()
    })

    it('a flag-off 404 is structurally identical to hitting a truly unregistered route (same statusCode, body shape, content-type)', async () => {
      const known = await app.inject({
        method: 'GET', url: `${PREFIX}/mine`,
        headers: { authorization: `Bearer ${token}` },
      })
      const unknown = await app.inject({
        method: 'GET', url: `${PREFIX}/this-route-truly-does-not-exist`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(known.statusCode).toBe(unknown.statusCode)
      expect(known.statusCode).toBe(404)
      expect(known.headers['content-type']).toEqual(unknown.headers['content-type'])
      expect(Object.keys(JSON.parse(known.body)).sort()).toEqual(Object.keys(JSON.parse(unknown.body)).sort())
    })
  })

  // ------------------------------------------------------------------ //
  // Flag ON AT BOOT: the invite router IS registered, so the authed scope's
  // authenticateCustomer preHandler runs (401 without a token) and the
  // routes behave as designed.
  // ------------------------------------------------------------------ //
  describe('INVITES_ENABLED=true at boot', () => {
    let app: FastifyInstance
    let token: string
    let userFindUnique: ReturnType<typeof vi.fn>
    let inviteFindMany: ReturnType<typeof vi.fn>

    beforeEach(async () => {
      process.env.INVITES_ENABLED = 'true'
      resetServiceMocks()
      ;({ app, token, userFindUnique, inviteFindMany } = await setupApp())
    })

    afterEach(async () => {
      delete process.env.INVITES_ENABLED
      await app.close()
    })

    it('an UNauthenticated probe -> 401 (auth runs; the route exists and gates on the token)', async () => {
      const res = await app.inject({ method: 'GET', url: `${PREFIX}/mine` })
      expect(res.statusCode).toBe(401)
    })

    describe('POST /api/v1/customer/invites/place-search', () => {
      it('maps searchInvitePlaces candidates onto the wire with no place id / lat / lng leakage', async () => {
        vi.mocked(searchInvitePlaces).mockResolvedValue([
          {
            candidateToken: 'cand-tok-1',
            name: 'Bloom Cafe',
            formattedAddress: '1 High St, London, SW1 1AA',
            addressParts: { addressLine1: '1 High St', city: 'London', postcode: 'SW1 1AA' },
          },
        ])
        const res = await app.inject({
          method: 'POST', url: `${PREFIX}/place-search`,
          headers: { authorization: `Bearer ${token}` }, payload: { query: 'Bloom Cafe London' },
        })
        expect(res.statusCode).toBe(200)
        const body = res.json()
        expect(body.candidates).toEqual([
          {
            candidateToken: 'cand-tok-1',
            name: 'Bloom Cafe',
            formattedAddress: '1 High St, London, SW1 1AA',
            addressParts: { addressLine1: '1 High St', city: 'London', postcode: 'SW1 1AA' },
          },
        ])
        // No google place id shape ("gp-…"), no coords, no raw provider fields anywhere on the wire.
        expect(res.body).not.toMatch(/gp-[\w-]+/)
        expect(res.body).not.toContain('googlePlaceId')
        expect(res.body).not.toContain('latitude')
        expect(res.body).not.toContain('longitude')
        expect(res.body).not.toContain('placeId')
        for (const c of body.candidates) {
          expect(Object.keys(c).sort()).toEqual(['addressParts', 'candidateToken', 'formattedAddress', 'name'])
        }
      })

      it('propagates the inviteLocationLimiter rate-limit rejection as the house 429', async () => {
        vi.mocked(searchInvitePlaces).mockRejectedValue(new AppError('LOCATION_SEARCH_RATE_LIMITED', { retryAfter: 3600 }))
        const res = await app.inject({
          method: 'POST', url: `${PREFIX}/place-search`,
          headers: { authorization: `Bearer ${token}` }, payload: { query: 'Bloom Cafe' },
        })
        expect(res.statusCode).toBe(429)
        const body = res.json()
        expect(body.error.code).toBe('LOCATION_SEARCH_RATE_LIMITED')
        expect(body.error.retryAfter).toBe(3600)
      })

      it('graceful degrade: searchInvitePlaces resolving [] (provider unavailable) -> 200 with empty candidates, not a 500', async () => {
        vi.mocked(searchInvitePlaces).mockResolvedValue([])
        const res = await app.inject({
          method: 'POST', url: `${PREFIX}/place-search`,
          headers: { authorization: `Bearer ${token}` }, payload: { query: 'Bloom Cafe' },
        })
        expect(res.statusCode).toBe(200)
        expect(res.json()).toEqual({ candidates: [] })
      })

      it('400 for a too-short query (zod boundary), service never called', async () => {
        const res = await app.inject({
          method: 'POST', url: `${PREFIX}/place-search`,
          headers: { authorization: `Bearer ${token}` }, payload: { query: 'a' },
        })
        expect(res.statusCode).toBe(400)
        expect(searchInvitePlaces).not.toHaveBeenCalled()
      })

      it('401 without a token', async () => {
        const res = await app.inject({
          method: 'POST', url: `${PREFIX}/place-search`, payload: { query: 'Bloom Cafe' },
        })
        expect(res.statusCode).toBe(401)
      })
    })

    describe('POST /api/v1/customer/invites (submit)', () => {
      it('resolves a candidateToken stash and forwards googlePlaceId + name + locality to submitInvite (no userEmail — identity is inviterKey, computed in the service)', async () => {
        vi.mocked(resolveInviteLocationCandidate).mockResolvedValue({
          googlePlaceId: 'place-xyz', name: 'Bloom Cafe', formattedAddress: '1 High St, London, SW1 1AA', locality: 'London',
        })
        vi.mocked(submitInvite).mockResolvedValue({ kind: 'ok' })

        const res = await app.inject({
          method: 'POST', url: PREFIX,
          headers: { authorization: `Bearer ${token}` },
          payload: { candidateToken: 'cand-tok-1', note: 'Please add them!', consentShareName: true },
        })

        expect(res.statusCode).toBe(200)
        expect(res.json()).toEqual({ status: 'ok' })
        expect(resolveInviteLocationCandidate).toHaveBeenCalledWith(expect.anything(), 'user-1', 'cand-tok-1')
        expect(submitInvite).toHaveBeenCalledWith(expect.anything(), {
          userId: 'user-1',
          businessNameRaw: 'Bloom Cafe',
          localityRaw: 'London',
          googlePlaceId: 'place-xyz',
          note: 'Please add them!',
          consentShareName: true,
          ip: expect.any(String),
          userAgent: expect.anything(),
        })
        // The corrected contract never passes userEmail (or reads user.email at all).
        expect(userFindUnique).toHaveBeenCalledWith({
          where: { id: 'user-1' },
          select: { id: true, status: true },
        })
      })

      it('calls consumeInviteSubmit BEFORE resolveInviteLocationCandidate and any prisma work, and BEFORE submitInvite', async () => {
        const order: string[] = []
        vi.mocked(consumeInviteSubmit).mockImplementation(async () => { order.push('limiter') })
        vi.mocked(resolveInviteLocationCandidate).mockImplementation(async () => {
          order.push('resolveCandidate')
          return { googlePlaceId: 'place-xyz', name: 'Bloom Cafe', formattedAddress: '1 High St, London, SW1 1AA', locality: 'London' }
        })
        userFindUnique.mockImplementation(async () => {
          order.push('prismaUser')
          return { id: 'user-1', status: 'ACTIVE' }
        })
        vi.mocked(submitInvite).mockImplementation(async () => {
          order.push('submitInvite')
          return { kind: 'ok' }
        })

        const res = await app.inject({
          method: 'POST', url: PREFIX,
          headers: { authorization: `Bearer ${token}` },
          payload: { candidateToken: 'cand-tok-1', consentShareName: true },
        })

        expect(res.statusCode).toBe(200)
        expect(order).toEqual(['limiter', 'resolveCandidate', 'prismaUser', 'submitInvite'])
      })

      it('a consumeInviteSubmit throw surfaces as the new INVITE_SUBMIT_RATE_LIMITED 429, with no invite created', async () => {
        vi.mocked(consumeInviteSubmit).mockRejectedValue(new AppError('INVITE_SUBMIT_RATE_LIMITED', { retryAfter: 1800 }))

        const res = await app.inject({
          method: 'POST', url: PREFIX,
          headers: { authorization: `Bearer ${token}` },
          payload: { businessName: 'Bloom Cafe', consentShareName: true },
        })

        expect(res.statusCode).toBe(429)
        const body = res.json()
        expect(body.error.code).toBe('INVITE_SUBMIT_RATE_LIMITED')
        expect(body.error.retryAfter).toBe(1800)
        expect(resolveInviteLocationCandidate).not.toHaveBeenCalled()
        expect(userFindUnique).not.toHaveBeenCalled()
        expect(submitInvite).not.toHaveBeenCalled()
      })

      it('already_live -> 200 with { status, merchant: { id, businessName } }', async () => {
        vi.mocked(resolveInviteLocationCandidate).mockResolvedValue(null)
        vi.mocked(submitInvite).mockResolvedValue({ kind: 'already_live', merchantId: 'm-1', businessName: 'Bloom Cafe' })

        const res = await app.inject({
          method: 'POST', url: PREFIX,
          headers: { authorization: `Bearer ${token}` },
          payload: { businessName: 'Bloom Cafe', consentShareName: false },
        })
        expect(res.statusCode).toBe(200)
        expect(res.json()).toEqual({ status: 'already_live', merchant: { id: 'm-1', businessName: 'Bloom Cafe' } })
      })

      it('400 INVITE_BUSINESS_NAME_REQUIRED when neither candidateToken nor businessName is supplied', async () => {
        const res = await app.inject({
          method: 'POST', url: PREFIX,
          headers: { authorization: `Bearer ${token}` },
          payload: { consentShareName: true },
        })
        expect(res.statusCode).toBe(400)
        expect(res.json().error.code).toBe('INVITE_BUSINESS_NAME_REQUIRED')
        expect(resolveInviteLocationCandidate).not.toHaveBeenCalled()
        expect(submitInvite).not.toHaveBeenCalled()
      })

      it('an expired/unknown candidateToken falls back to the supplied businessName', async () => {
        vi.mocked(resolveInviteLocationCandidate).mockResolvedValue(null)
        vi.mocked(submitInvite).mockResolvedValue({ kind: 'ok' })

        const res = await app.inject({
          method: 'POST', url: PREFIX,
          headers: { authorization: `Bearer ${token}` },
          payload: { candidateToken: 'expired-tok', businessName: 'Fallback Cafe', locality: 'Leeds', consentShareName: true },
        })
        expect(res.statusCode).toBe(200)
        expect(submitInvite).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
          businessNameRaw: 'Fallback Cafe', localityRaw: 'Leeds', googlePlaceId: null,
        }))
      })

      it('400 INVITE_BUSINESS_NAME_REQUIRED when the candidateToken is expired and there is no businessName fallback', async () => {
        vi.mocked(resolveInviteLocationCandidate).mockResolvedValue(null)
        const res = await app.inject({
          method: 'POST', url: PREFIX,
          headers: { authorization: `Bearer ${token}` },
          payload: { candidateToken: 'expired-tok', consentShareName: true },
        })
        expect(res.statusCode).toBe(400)
        expect(res.json().error.code).toBe('INVITE_BUSINESS_NAME_REQUIRED')
        expect(submitInvite).not.toHaveBeenCalled()
      })

      it('SESSION_REVOKED (401) when the account is DELETED', async () => {
        userFindUnique.mockResolvedValue({ id: 'user-1', status: 'DELETED' })
        const res = await app.inject({
          method: 'POST', url: PREFIX,
          headers: { authorization: `Bearer ${token}` },
          payload: { businessName: 'Bloom Cafe', consentShareName: true },
        })
        expect(res.statusCode).toBe(401)
        expect(res.json().error.code).toBe('SESSION_REVOKED')
        expect(submitInvite).not.toHaveBeenCalled()
      })

      it('401 without a token', async () => {
        const res = await app.inject({
          method: 'POST', url: PREFIX,
          payload: { businessName: 'Bloom Cafe', consentShareName: true },
        })
        expect(res.statusCode).toBe(401)
      })
    })

    describe('GET /api/v1/customer/invites/mine', () => {
      it('returns only the caller\'s own invites, newest first, hiding status/rewardEligible/leadId', async () => {
        inviteFindMany.mockResolvedValue([
          { id: 'inv-2', businessNameRaw: 'Newer Cafe', localityRaw: 'London', createdAt: new Date('2026-07-10T00:00:00.000Z') },
          { id: 'inv-1', businessNameRaw: 'Older Cafe', localityRaw: null, createdAt: new Date('2026-07-01T00:00:00.000Z') },
        ])

        const res = await app.inject({
          method: 'GET', url: `${PREFIX}/mine`,
          headers: { authorization: `Bearer ${token}` },
        })

        expect(res.statusCode).toBe(200)
        expect(res.json()).toEqual([
          { id: 'inv-2', businessName: 'Newer Cafe', locality: 'London', createdAt: '2026-07-10T00:00:00.000Z' },
          { id: 'inv-1', businessName: 'Older Cafe', locality: null, createdAt: '2026-07-01T00:00:00.000Z' },
        ])
        expect(inviteFindMany).toHaveBeenCalledWith({
          where: { inviterUserId: 'user-1', anonymisedAt: null },
          select: { id: true, businessNameRaw: true, localityRaw: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
        for (const row of res.json()) {
          expect(row).not.toHaveProperty('status')
          expect(row).not.toHaveProperty('rewardEligible')
          expect(row).not.toHaveProperty('leadId')
          expect(row).not.toHaveProperty('countableAt')
        }
      })

      it('401 without a token', async () => {
        const res = await app.inject({ method: 'GET', url: `${PREFIX}/mine` })
        expect(res.statusCode).toBe(401)
      })
    })
  })
})
