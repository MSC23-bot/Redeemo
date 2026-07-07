import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// My Account (Stage 1 backend prerequisites, no schema): GET/PATCH account +
// GET account/sessions. Mirrors the mocked-Prisma harness used by
// tests/api/merchant/notifications/routes.test.ts (buildApp + prisma mock +
// merchant JWT) — every query/mutation is scoped to the caller's OWN adminId
// (req.user.sub), with isCurrent derived from the signed sessionId claim.

describe('merchant account (My Account Stage 1 backend)', () => {
  let app: FastifyInstance
  let merchantToken: string

  const ADMIN_ROW = {
    id: 'ma1',
    firstName: 'Jamie',
    lastName: 'Okafor',
    jobTitle: 'Owner',
    email: 'jamie@example.test',
    phone: '+447700900123',
    phoneCountryCode: '+44',
    emailVerified: true,
    passwordHash: 'SHOULD-NEVER-BE-SELECTED',
  }

  function sessionRow(overrides: Record<string, unknown> = {}) {
    return {
      sessionId: 's-current',
      deviceType: 'web',
      deviceName: 'Chrome on macOS',
      userAgent: 'Mozilla/5.0 jest-ua',
      ipAddress: '9.9.9.9',
      lastActiveAt: new Date('2026-07-06T10:00:00.000Z'),
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
      revokedAt: null,
      ...overrides,
    }
  }

  function signToken(sub: string, sessionId = 's-current') {
    return (app.jwt as any).merchant.sign(
      { sub, role: 'merchant', deviceId: 'd1', sessionId },
      { expiresIn: '1h' }
    )
  }

  // Applies an incoming Prisma `select` to a row, so the mock behaves like the
  // real client for the "never selects passwordHash" assertions below (a naive
  // `mockResolvedValue(ADMIN_ROW)` would leak passwordHash regardless of what
  // the code actually selects).
  function applySelect(row: Record<string, unknown>, select?: Record<string, boolean>) {
    if (!select) return row
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(select)) if (select[k]) out[k] = row[k]
    return out
  }

  function makePrisma() {
    return {
      merchantAdmin: {
        findUnique: vi.fn().mockImplementation(async (args: any) => applySelect(ADMIN_ROW, args?.select)),
        update: vi.fn().mockImplementation(async (args: any) => applySelect({ ...ADMIN_ROW, ...args?.data }, args?.select)),
      },
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
      userSession: {
        findMany: vi.fn().mockResolvedValue([sessionRow()]),
      },
    }
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', makePrisma() as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    merchantToken = signToken('ma1')
  })

  afterEach(async () => { await app.close() })

  function get(url: string, token = merchantToken) {
    return app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } })
  }
  function patch(url: string, payload: Record<string, unknown>, token = merchantToken) {
    return app.inject({ method: 'PATCH', url, payload, headers: { authorization: `Bearer ${token}` } })
  }

  // ---- GET account ----

  it('GET account returns the curated fields and NEVER passwordHash', async () => {
    const res = await get('/api/v1/merchant/account')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toMatchObject({
      id: 'ma1', firstName: 'Jamie', lastName: 'Okafor', jobTitle: 'Owner',
      email: 'jamie@example.test', phone: '+447700900123', phoneCountryCode: '+44',
      emailVerified: true,
    })
    expect(body.passwordHash).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('SHOULD-NEVER-BE-SELECTED')

    // curated select never asks Prisma for passwordHash either (mutation-check pin)
    const selectArg = (app.prisma.merchantAdmin.findUnique as any).mock.calls[0][0].select
    expect(selectArg).toEqual({
      id: true, firstName: true, lastName: true, jobTitle: true,
      email: true, phone: true, phoneCountryCode: true, emailVerified: true,
    })
  })

  it('GET account derives passwordChangedAt from the most recent PASSWORD_CHANGED/AUTH_PASSWORD_RESET audit row', async () => {
    const changedAt = new Date('2026-06-15T09:00:00.000Z')
    app.prisma.auditLog.findFirst = vi.fn().mockResolvedValue({ createdAt: changedAt })

    const res = await get('/api/v1/merchant/account')
    const body = JSON.parse(res.body)
    expect(body.passwordChangedAt).toBe(changedAt.toISOString())

    const arg = (app.prisma.auditLog.findFirst as any).mock.calls[0][0]
    expect(arg.where).toEqual({
      entityId: 'ma1', entityType: 'merchant',
      event: { in: ['PASSWORD_CHANGED', 'AUTH_PASSWORD_RESET'] },
    })
    expect(arg.orderBy).toEqual({ createdAt: 'desc' })
  })

  it('GET account returns passwordChangedAt: null when no password-change audit row exists', async () => {
    app.prisma.auditLog.findFirst = vi.fn().mockResolvedValue(null)
    const res = await get('/api/v1/merchant/account')
    expect(JSON.parse(res.body).passwordChangedAt).toBeNull()
  })

  // ---- PATCH account ----

  it('PATCH account updates ONLY firstName/lastName/jobTitle and writes the audit event', async () => {
    app.prisma.merchantAdmin.update = vi.fn().mockResolvedValue({
      ...ADMIN_ROW, firstName: 'Jay', lastName: 'O', jobTitle: 'Founder',
    })

    const res = await patch('/api/v1/merchant/account', {
      firstName: 'Jay', lastName: 'O', jobTitle: 'Founder',
    })
    expect(res.statusCode).toBe(200)

    const updateArg = (app.prisma.merchantAdmin.update as any).mock.calls[0][0]
    expect(updateArg.where).toEqual({ id: 'ma1' })
    expect(updateArg.data).toEqual({ firstName: 'Jay', lastName: 'O', jobTitle: 'Founder' })

    expect(app.prisma.auditLog.create).toHaveBeenCalledTimes(1)
    expect((app.prisma.auditLog.create as any).mock.calls[0][0].data).toMatchObject({
      entityId: 'ma1', entityType: 'merchant', event: 'PROFILE_UPDATED',
    })
  })

  it('PATCH account accepts jobTitle: null (clearing it)', async () => {
    const res = await patch('/api/v1/merchant/account', {
      firstName: 'Jamie', lastName: 'Okafor', jobTitle: null,
    })
    expect(res.statusCode).toBe(200)
    const updateArg = (app.prisma.merchantAdmin.update as any).mock.calls[0][0]
    expect(updateArg.data.jobTitle).toBeNull()
  })

  it('PATCH account rejects a disallowed field (email) with a 400 and never touches Prisma', async () => {
    const res = await patch('/api/v1/merchant/account', {
      firstName: 'Jamie', lastName: 'Okafor', email: 'new@example.test',
    })
    expect(res.statusCode).toBe(400)
    expect(app.prisma.merchantAdmin.update).not.toHaveBeenCalled()
  })

  it('PATCH account rejects a disallowed field (role) with a 400 and never touches Prisma', async () => {
    const res = await patch('/api/v1/merchant/account', {
      firstName: 'Jamie', lastName: 'Okafor', role: 'OWNER',
    })
    expect(res.statusCode).toBe(400)
    expect(app.prisma.merchantAdmin.update).not.toHaveBeenCalled()
  })

  it('PATCH account rejects an empty firstName with a 400 and never touches Prisma', async () => {
    const res = await patch('/api/v1/merchant/account', {
      firstName: '   ', lastName: 'Okafor',
    })
    expect(res.statusCode).toBe(400)
    expect(app.prisma.merchantAdmin.update).not.toHaveBeenCalled()
  })

  it('PATCH account rejects a missing lastName with a 400 and never touches Prisma', async () => {
    const res = await patch('/api/v1/merchant/account', { firstName: 'Jamie' })
    expect(res.statusCode).toBe(400)
    expect(app.prisma.merchantAdmin.update).not.toHaveBeenCalled()
  })

  // ---- GET account/sessions ----

  it('GET account/sessions returns the curated shape scoped to this admin, non-revoked, ordered by lastActiveAt desc', async () => {
    const res = await get('/api/v1/merchant/account/sessions')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.sessions).toHaveLength(1)
    expect(body.sessions[0]).toMatchObject({
      deviceType: 'web', deviceName: 'Chrome on macOS', userAgent: 'Mozilla/5.0 jest-ua',
      ipAddress: '9.9.9.9', isCurrent: true,
    })
    // curated: never leaks the raw sessionId
    expect(body.sessions[0].sessionId).toBeUndefined()

    const arg = (app.prisma.userSession.findMany as any).mock.calls[0][0]
    expect(arg.where).toEqual({ entityId: 'ma1', entityType: 'merchant', revokedAt: null })
    expect(arg.orderBy).toEqual({ lastActiveAt: 'desc' })
  })

  it('marks isCurrent:true only for the session matching the caller’s own signed sessionId, false for others', async () => {
    app.prisma.userSession.findMany = vi.fn().mockResolvedValue([
      sessionRow({ sessionId: 's-current', deviceType: 'web' }),
      sessionRow({ sessionId: 's-other', deviceType: 'ios', deviceName: 'iPhone' }),
    ])
    const res = await get('/api/v1/merchant/account/sessions')
    const body = JSON.parse(res.body)
    expect(body.sessions).toHaveLength(2)
    const current = body.sessions.find((s: any) => s.deviceType === 'web')
    const other = body.sessions.find((s: any) => s.deviceType === 'ios')
    expect(current.isCurrent).toBe(true)
    expect(other.isCurrent).toBe(false)
  })

  it('excludes revoked sessions (scoped where guarantees the mock never returns them; verifying the where clause)', async () => {
    // The where clause itself is the exclusion mechanism (revokedAt: null) —
    // simulate the DB-level filtering by having the mock return only the
    // live row even when a revoked one "exists" upstream.
    app.prisma.userSession.findMany = vi.fn().mockResolvedValue([sessionRow()])
    await get('/api/v1/merchant/account/sessions')
    expect((app.prisma.userSession.findMany as any).mock.calls[0][0].where.revokedAt).toBeNull()
  })

  it('a second merchant-admin (ma2) scopes findMany to entityId:ma2', async () => {
    const ma2 = signToken('ma2', 's-ma2')
    await get('/api/v1/merchant/account/sessions', ma2)
    expect((app.prisma.userSession.findMany as any).mock.calls[0][0].where.entityId).toBe('ma2')
  })

  // ---- Auth boundary ----

  it('GET account with no bearer token -> 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchant/account' })
    expect(res.statusCode).toBe(401)
    expect(app.prisma.merchantAdmin.findUnique).not.toHaveBeenCalled()
  })

  it('PATCH account with no bearer token -> 401', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/merchant/account',
      payload: { firstName: 'Jamie', lastName: 'Okafor' },
    })
    expect(res.statusCode).toBe(401)
    expect(app.prisma.merchantAdmin.update).not.toHaveBeenCalled()
  })

  it('GET account/sessions with no bearer token -> 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchant/account/sessions' })
    expect(res.statusCode).toBe(401)
    expect(app.prisma.userSession.findMany).not.toHaveBeenCalled()
  })
})
