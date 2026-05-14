// tests/api/customer/postcode/preview.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../../src/api/app'

describe('GET /api/v1/customer/postcode/preview', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.restoreAllMocks()
    app = await buildApp()
    // buildApp() skips prismaPlugin in test mode, so we mock the decoration
    // directly. The preview service only reads (findExistingLocality), so
    // returning null from findUnique is enough to drive the no-Locality-match
    // code path (preview falls back to derived localityName).
    app.decorate('prisma', {
      locality: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as any)
  })

  afterEach(async () => {
    await app.close()
  })

  it('returns 200 with resolved locality fields on success', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 200,
        result: {
          postcode: 'HD1 2PY',
          country: 'England',
          region: 'Yorkshire and the Humber',
          admin_district: 'Kirklees',
          admin_county: 'West Yorkshire',
          parish: 'Kirklees, unparished area',
          admin_ward: 'Newsome',
          parliamentary_constituency: 'Huddersfield',
          latitude: 53.6463,
          longitude: -1.7809,
        },
      }),
    } as Response)

    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/postcode/preview?code=HD12PY' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.postcode).toBe('HD1 2PY')
    // Plan §4.1.1 canonicalisation: parish is the "unparished area" placeholder,
    // region is NOT London, so localityName falls through to the parliamentary
    // constituency ("Huddersfield").
    expect(body.localityName).toBe('Huddersfield')
    expect(body.postTown).toBeNull()  // postcodes.io didn't return post_town for this fixture
    expect(body.country).toBe('England')
    expect(body.region).toBe('Yorkshire and the Humber')
    // localityId is null because the mock returns no matching Locality —
    // preview MUST NOT auto-create (the read-only contract).
    expect(body.localityId).toBeNull()
  })

  it('returns 404 for unknown postcode', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ status: 404 }),
    } as Response)

    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/postcode/preview?code=ZZ999ZZ' })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error).toBe('POSTCODE_NOT_FOUND')
  })

  it('returns 503 on gazetteer unavailable', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network'))

    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/postcode/preview?code=HD12PY' })
    expect(res.statusCode).toBe(503)
    expect(JSON.parse(res.body).error).toBe('GAZETTEER_UNAVAILABLE')
  })

  it('returns 400 for malformed query (no code)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/postcode/preview' })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toBe('INVALID_POSTCODE')
  })
})
