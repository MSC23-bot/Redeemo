import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('merchant branch routes', () => {
  let app: FastifyInstance
  let merchantToken: string

  const mockBranch = {
    id: 'b1', merchantId: 'm1', name: 'Main Branch', isMainBranch: true,
    addressLine1: '1 Test St', city: 'London', postcode: 'EC1A 1BB',
    country: 'GB', isActive: true, deletedAt: null,
    openingHours: [], amenities: [], photos: [], pendingEdits: [],
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchant: { findUnique: vi.fn() },
      branch: {
        findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(),
        update: vi.fn(), updateMany: vi.fn(), count: vi.fn(),
      },
      branchOpeningHours: { upsert: vi.fn() },
      branchAmenity: { deleteMany: vi.fn(), createMany: vi.fn() },
      branchPendingEdit: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
      adminApproval: { create: vi.fn().mockResolvedValue({}) },
      branchUser: { updateMany: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn() } as any)
    await app.ready()
    merchantToken = (app.jwt as any).merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  it('GET /api/v1/merchant/branches returns branch list', async () => {
    app.prisma.branch.findMany = vi.fn().mockResolvedValue([mockBranch])
    const res = await app.inject({
      method: 'GET', url: '/api/v1/merchant/branches',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveLength(1)
  })

  it('POST /api/v1/merchant/branches creates branch and sets isMainBranch on first', async () => {
    app.prisma.branch.count = vi.fn().mockResolvedValue(0)
    app.prisma.branch.create = vi.fn().mockResolvedValue({ ...mockBranch, isMainBranch: true })

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/branches',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { name: 'Main Branch', addressLine1: '1 Test St', city: 'London', postcode: 'EC1A 1BB' },
    })
    expect(res.statusCode).toBe(201)
    expect(app.prisma.branch.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isMainBranch: true }) })
    )
  })

  it('POST /api/v1/merchant/branches sets isMainBranch false for subsequent branches', async () => {
    app.prisma.branch.count = vi.fn().mockResolvedValue(1)
    app.prisma.branch.create = vi.fn().mockResolvedValue({ ...mockBranch, id: 'b2', isMainBranch: false })

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/branches',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { name: 'Second Branch', addressLine1: '2 Test St', city: 'London', postcode: 'EC1A 1BC' },
    })
    expect(res.statusCode).toBe(201)
    expect(app.prisma.branch.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isMainBranch: false }) })
    )
  })

  it('DELETE /api/v1/merchant/branches/:id blocks deleting main branch', async () => {
    app.prisma.branch.findFirst = vi.fn().mockResolvedValue({ ...mockBranch, isMainBranch: true })

    const res = await app.inject({
      method: 'DELETE', url: '/api/v1/merchant/branches/b1',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('BRANCH_IS_MAIN')
  })

  it('DELETE /api/v1/merchant/branches/:id blocks deleting last active branch of live merchant', async () => {
    app.prisma.branch.findFirst = vi.fn().mockResolvedValue({ ...mockBranch, isMainBranch: false })
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', status: 'ACTIVE' })
    app.prisma.branch.count = vi.fn().mockResolvedValue(1)

    const res = await app.inject({
      method: 'DELETE', url: '/api/v1/merchant/branches/b1',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('BRANCH_LAST_ACTIVE')
  })

  it('POST /api/v1/merchant/branches/:id/edit-request returns 409 when pending edit exists', async () => {
    app.prisma.branch.findFirst = vi.fn().mockResolvedValue(mockBranch)
    app.prisma.branchPendingEdit.findFirst = vi.fn().mockResolvedValue({ id: 'pe1', branchId: 'b1', status: 'PENDING', createdAt: new Date() })

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/branches/b1/edit-request',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { name: 'New Name' },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('PENDING_EDIT_EXISTS')
  })

  it('POST /api/v1/merchant/branches/:id/hours upserts full week', async () => {
    app.prisma.branch.findFirst = vi.fn().mockResolvedValue(mockBranch)
    app.prisma.branchOpeningHours.upsert = vi.fn().mockResolvedValue({})

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/branches/b1/hours',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        hours: [
          { dayOfWeek: 0, isClosed: true },
          { dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isClosed: false },
        ],
      },
    })
    expect(res.statusCode).toBe(200)
    expect(app.prisma.branchOpeningHours.upsert).toHaveBeenCalledTimes(2)
  })
})
