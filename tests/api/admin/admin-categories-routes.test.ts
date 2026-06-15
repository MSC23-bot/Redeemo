import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// Option B B2.3-read: auth + capability gate + eligibility on GET
// /admin/categories. The gate (authenticateAdmin then
// requireAdminCapability('merchant:read')) fires in preHandlers before the
// service, so a tiny prisma mock suffices. The positive case pins that the query
// counts ACTIVE RMV templates and that `eligible = (count >= 2)`.
describe('B2.3-read: GET /admin/categories (auth + capability + eligibility)', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })
  const url = '/api/v1/admin/categories'

  const catRows = [
    { id: 'cat-eligible', name: 'Food', parentId: null, sortOrder: 0, _count: { rmvTemplates: 2 } },
    { id: 'cat-eligible-3', name: 'Drinks', parentId: null, sortOrder: 1, _count: { rmvTemplates: 3 } },
    { id: 'cat-ineligible', name: 'Niche', parentId: null, sortOrder: 2, _count: { rmvTemplates: 1 } },
    { id: 'cat-none', name: 'Empty', parentId: null, sortOrder: 3, _count: { rmvTemplates: 0 } },
  ]

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', { category: { findMany: vi.fn().mockResolvedValue(catRows) } } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  it('401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url })
    expect(res.statusCode).toBe(401)
  })

  it('403 ADMIN_CAPABILITY_DENIED for SUPPORT (lacks merchant:read)', async () => {
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` } })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('200 for OPERATIONS with eligible flags derived from active RMV-template counts', async () => {
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.categories).toEqual([
      { id: 'cat-eligible', name: 'Food', parentId: null, eligible: true },
      { id: 'cat-eligible-3', name: 'Drinks', parentId: null, eligible: true },
      { id: 'cat-ineligible', name: 'Niche', parentId: null, eligible: false },
      { id: 'cat-none', name: 'Empty', parentId: null, eligible: false },
    ])
    // The eligibility count must be scoped to ACTIVE templates + top-level categories.
    const findArgs = (app as any).prisma.category.findMany.mock.calls[0][0]
    expect(findArgs.where).toMatchObject({ parentId: null, isActive: true })
    expect(findArgs.select._count.select.rmvTemplates.where).toEqual({ isActive: true })
  })

  it('200 for SUPER_ADMIN (superuser)', async () => {
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` } })
    expect(res.statusCode).toBe(200)
  })
})
