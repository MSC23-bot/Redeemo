import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// MerchantNote routes (packet 2026-07-13, OD2). Every route is gated on the
// UNIVERSAL `merchant:notes` capability. The gate fires in a preHandler before the
// service, so a small prisma mock suffices to prove fail-closed authz + schema
// validation + the merchant-existence 404. Load-bearing pins: a token whose caps
// claim lacks merchant:notes is 403 (fail-closed); a FINANCE-role admin CAN add +
// read (the OD2 all-roles decision), incl. via a legacy token that falls back to
// the FINANCE baseline; body / reason are required; an unknown merchant 404s.

describe('MerchantNote routes: merchant:notes gate + validation', () => {
  let app: FastifyInstance
  let noteFindMany: ReturnType<typeof vi.fn>
  let merchantFindUnique: ReturnType<typeof vi.fn>

  const sign = (adminRole?: string, caps?: string[]) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, caps, sessionId: 's1' }, { expiresIn: '1h' })

  const noteWithEvents = {
    id: 'note-1', merchantId: 'm1', authorAdminId: 'admin-1', body: 'hi', status: 'ACTIVE',
    editedAt: null, retractedById: null, retractedAt: null, retractedReason: null,
    createdAt: new Date(), updatedAt: new Date(), events: [],
  }

  beforeEach(async () => {
    app = await buildApp()
    noteFindMany = vi.fn().mockResolvedValue([])
    merchantFindUnique = vi.fn().mockResolvedValue({ id: 'm1' })
    const tx = {
      merchant: { findUnique: merchantFindUnique },
      merchantNote: {
        findFirst: vi.fn().mockResolvedValue(noteWithEvents),
        findUnique: vi.fn().mockResolvedValue(noteWithEvents),
        create: vi.fn().mockResolvedValue({ id: 'note-1' }),
        update: vi.fn().mockResolvedValue(noteWithEvents),
      },
      merchantNoteEvent: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    app.decorate('prisma', {
      $transaction: vi.fn().mockImplementation(async (cb: any) => cb(tx)),
      merchant: { findUnique: merchantFindUnique },
      merchantNote: { findMany: noteFindMany },
    } as any)
    app.decorate('redis', { get: vi.fn(), set: vi.fn(), del: vi.fn(), keys: vi.fn().mockResolvedValue([]) } as any)
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  const ROUTES: Array<{ method: any; url: string; payload?: any }> = [
    { method: 'GET', url: '/api/v1/admin/merchants/m1/notes' },
    { method: 'POST', url: '/api/v1/admin/merchants/m1/notes', payload: { body: 'a note' } },
    { method: 'PATCH', url: '/api/v1/admin/merchants/m1/notes/note-1', payload: { body: 'edited' } },
    { method: 'POST', url: '/api/v1/admin/merchants/m1/notes/note-1/retract', payload: { reason: 'dupe' } },
  ]

  it('every route 401s unauthenticated', async () => {
    for (const r of ROUTES) {
      const res = await app.inject({ method: r.method, url: r.url, payload: r.payload })
      expect(res.statusCode, `${r.method} ${r.url}`).toBe(401)
    }
  })

  it('every route 403s (fail-closed) for a token whose caps claim lacks merchant:notes', async () => {
    // A minted caps claim is authoritative when present: caps=[] denies even a role
    // whose baseline would otherwise grant the universal cap.
    const token = sign('SUPPORT', [])
    for (const r of ROUTES) {
      const res = await app.inject({ method: r.method, url: r.url, headers: { authorization: `Bearer ${token}` }, payload: r.payload })
      expect(res.statusCode, `${r.method} ${r.url}`).toBe(403)
      expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
    }
  })

  it('OD2: a FINANCE admin holding merchant:notes CAN read (200) and add (201)', async () => {
    const token = sign('FINANCE', ['merchant:notes'])
    const list = await app.inject({ method: 'GET', url: '/api/v1/admin/merchants/m1/notes', headers: { authorization: `Bearer ${token}` } })
    expect(list.statusCode).toBe(200)
    const add = await app.inject({ method: 'POST', url: '/api/v1/admin/merchants/m1/notes', headers: { authorization: `Bearer ${token}` }, payload: { body: 'finance can note' } })
    expect(add.statusCode).toBe(201)
  })

  it('OD2: a FINANCE LEGACY token (no caps claim) falls back to the FINANCE baseline and passes (200)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/merchants/m1/notes', headers: { authorization: `Bearer ${sign('FINANCE', undefined)}` } })
    expect(res.statusCode).toBe(200)
  })

  it('POST requires a non-empty body (400 at the schema level)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/merchants/m1/notes', headers: { authorization: `Bearer ${sign('FINANCE', ['merchant:notes'])}` }, payload: {} })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR')
  })

  it('retract requires a non-empty reason (400 at the schema level)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/merchants/m1/notes/note-1/retract', headers: { authorization: `Bearer ${sign('FINANCE', ['merchant:notes'])}` }, payload: {} })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR')
  })

  it('404 MERCHANT_NOT_FOUND for an unknown merchant (GET + POST)', async () => {
    merchantFindUnique.mockResolvedValue(null)
    const token = sign('FINANCE', ['merchant:notes'])
    const list = await app.inject({ method: 'GET', url: '/api/v1/admin/merchants/nope/notes', headers: { authorization: `Bearer ${token}` } })
    expect(list.statusCode).toBe(404)
    expect(JSON.parse(list.body).error.code).toBe('MERCHANT_NOT_FOUND')
    const add = await app.inject({ method: 'POST', url: '/api/v1/admin/merchants/nope/notes', headers: { authorization: `Bearer ${token}` }, payload: { body: 'x' } })
    expect(add.statusCode).toBe(404)
    expect(JSON.parse(add.body).error.code).toBe('MERCHANT_NOT_FOUND')
  })
})
