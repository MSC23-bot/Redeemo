import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// MerchantLead pipeline routes (packet 2026-07-12, OD1). Every route is gated on
// `lead:manage` (FIELD baseline); the CONVERT route additionally demands
// `merchant:create-draft` (N4 defense-in-depth: convert mints a merchant draft).
// The gate fires in a preHandler before the service, so a small prisma mock
// suffices to prove fail-closed authz + the schema-level validation. Also pins
// the F2 boolean-parse fix (?overdue=false / ?includeTerminal=false must parse
// to FALSE) and the N2 empty-string-clears-to-null PATCH transform.

describe('MerchantLead routes: lead:manage gate + schema validation', () => {
  let app: FastifyInstance
  let findMany: ReturnType<typeof vi.fn>
  let leadUpdate: ReturnType<typeof vi.fn>

  const sign = (adminRole?: string, caps?: string[]) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, caps, sessionId: 's1' }, { expiresIn: '1h' })

  const leadRow = {
    id: 'lead-1', businessName: 'Bloom Cafe', categoryGuess: null, locationHint: null,
    contactName: null, contactEmail: null, contactPhone: null, source: null, stage: 'LEAD',
    nextAction: null, dueDate: null, assignedRepId: null, lostReason: null,
    convertedMerchantId: null, lastActivityAt: new Date(), anonymisedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
  }

  beforeEach(async () => {
    app = await buildApp()
    findMany = vi.fn().mockResolvedValue([])
    leadUpdate = vi.fn().mockResolvedValue(leadRow)
    const tx = {
      merchantLead: {
        findUnique: vi.fn().mockResolvedValue(leadRow),
        create: vi.fn().mockResolvedValue(leadRow),
        update: leadUpdate,
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    app.decorate('prisma', {
      $transaction: vi.fn().mockImplementation(async (cb: any) => cb(tx)),
      merchantLead: { findMany, findUnique: vi.fn().mockResolvedValue(leadRow) },
    } as any)
    app.decorate('redis', { get: vi.fn(), set: vi.fn(), del: vi.fn(), keys: vi.fn().mockResolvedValue([]) } as any)
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  const ROUTES: Array<{ method: any; url: string; payload?: any }> = [
    { method: 'GET', url: '/api/v1/admin/leads' },
    { method: 'POST', url: '/api/v1/admin/leads', payload: { businessName: 'Bloom Cafe' } },
    { method: 'PATCH', url: '/api/v1/admin/leads/lead-1', payload: { nextAction: 'call' } },
    { method: 'POST', url: '/api/v1/admin/leads/lead-1/convert', payload: { ownerEmail: 'a@b.com', ownerFirstName: 'A', ownerLastName: 'B' } },
  ]

  it('every route 401s unauthenticated', async () => {
    for (const r of ROUTES) {
      const res = await app.inject({ method: r.method, url: r.url, payload: r.payload })
      expect(res.statusCode, `${r.method} ${r.url}`).toBe(401)
    }
  })

  it('every route 403s (fail-closed) for an admin WITHOUT lead:manage', async () => {
    const token = sign('OPERATIONS', []) // OPERATIONS baseline does NOT include lead:manage
    for (const r of ROUTES) {
      const res = await app.inject({ method: r.method, url: r.url, headers: { authorization: `Bearer ${token}` }, payload: r.payload })
      expect(res.statusCode, `${r.method} ${r.url}`).toBe(403)
      expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
    }
  })

  it('GET passes the gate for a FIELD admin holding lead:manage (200)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/leads', headers: { authorization: `Bearer ${sign('FIELD', ['lead:manage'])}` } })
    expect(res.statusCode).toBe(200)
  })

  it('POST passes the gate and creates (201)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/leads', headers: { authorization: `Bearer ${sign('FIELD', ['lead:manage'])}` }, payload: { businessName: 'Bloom Cafe' } })
    expect(res.statusCode).toBe(201)
  })

  it('PATCH passes the gate (200)', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/api/v1/admin/leads/lead-1', headers: { authorization: `Bearer ${sign('FIELD', ['lead:manage'])}` }, payload: { nextAction: 'call' } })
    expect(res.statusCode).toBe(200)
  })

  it('F2 pin: ?overdue=false&includeTerminal=false parse to FALSE (live pipeline, no dueDate filter)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/leads?overdue=false&includeTerminal=false',
      headers: { authorization: `Bearer ${sign('FIELD', ['lead:manage'])}` },
    })
    expect(res.statusCode).toBe(200)
    const where = findMany.mock.calls[0][0].where
    // includeTerminal=false ⇒ the live-lanes filter IS applied (a wrongly-coerced
    // true would leave stage unset and surface Converted/Lost).
    expect(where.stage).toEqual({ in: ['LEAD', 'CONTACTED', 'VISIT_BOOKED'] })
    // overdue=false ⇒ NO dueDate filter (a wrongly-coerced true would set one).
    expect(where.dueDate).toBeUndefined()
  })

  it('POST validates businessName is required (400 at the schema level)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/leads', headers: { authorization: `Bearer ${sign('FIELD', ['lead:manage'])}` }, payload: {} })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR')
  })

  it('PATCH rejects stage=CONVERTED at the Zod schema level (400, never reaches the service)', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/api/v1/admin/leads/lead-1', headers: { authorization: `Bearer ${sign('FIELD', ['lead:manage'])}` }, payload: { stage: 'CONVERTED' } })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR')
  })

  it('convert validates ownerEmail (400 with BOTH caps ⇒ both gates passed, then the body rejected)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/leads/lead-1/convert', headers: { authorization: `Bearer ${sign('FIELD', ['lead:manage', 'merchant:create-draft'])}` }, payload: { ownerFirstName: 'A', ownerLastName: 'B' } })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR')
  })

  it('N4: convert 403s for an admin holding lead:manage but NOT merchant:create-draft (dual-cap gate)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/leads/lead-1/convert',
      headers: { authorization: `Bearer ${sign('FIELD', ['lead:manage'])}` }, // no merchant:create-draft
      payload: { ownerEmail: 'a@b.com', ownerFirstName: 'A', ownerLastName: 'B' },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('N2: PATCH with an empty-string nullable field clears it to NULL (not stored as "")', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/leads/lead-1',
      headers: { authorization: `Bearer ${sign('FIELD', ['lead:manage'])}` },
      payload: { categoryGuess: '', nextAction: '   ' }, // empty + whitespace-only both clear
    })
    expect(res.statusCode).toBe(200)
    // The service receives null (clearing intent), never a bare "" / trimmed "".
    const data = leadUpdate.mock.calls[0][0].data
    expect(data.categoryGuess).toBeNull()
    expect(data.nextAction).toBeNull()
  })
})
