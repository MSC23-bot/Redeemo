import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Branches PR-4 (§4a): setOpeningHours is now STAGE-not-apply — it enqueues a
// delayed promotion nudge via enqueue(MAINTENANCE_QUEUE, ...). Mock enqueue so the
// route-level tests never touch Redis/BullMQ; keep MAINTENANCE_QUEUE real.
const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn().mockResolvedValue({ id: 'job-1' }) }))
vi.mock('../../../../src/api/queues', () => ({ MAINTENANCE_QUEUE: 'maintenance', enqueue: enqueueMock }))

import { buildApp } from '../../../../src/api/app'
import type { FastifyInstance } from 'fastify'
import { validateOpeningHours } from '../../../../src/api/merchant/branch/openingHours'

/**
 * Branches PR-8 (umbrella D9): server-side opening-hours validation for the
 * MULTI-WINDOW storage model. The LIVE model dropped
 * `BranchOpeningHours @@unique([branchId, dayOfWeek])`, so a day may hold N>=1 open
 * windows. The validator now groups rows per day, enforces within-day AND cross-day
 * no-overlap on HALF-OPEN intervals `[open, close)`, and keeps the per-row format /
 * 24:00-close / zero-length / closed-day rules. `close < open` is the first-class
 * OVERNIGHT (crosses-midnight) encoding and is ACCEPTED.
 */
describe('validateOpeningHours (pure, multi-window)', () => {
  const open = (dayOfWeek: number, openTime: string, closeTime: string) => ({
    dayOfWeek, openTime, closeTime, isClosed: false,
  })
  const closed = (dayOfWeek: number) => ({ dayOfWeek, isClosed: true })

  it('accepts a well-formed same-day open period (close > open)', () => {
    expect(() => validateOpeningHours([open(1, '09:00', '17:00')])).not.toThrow()
  })

  it('accepts MULTIPLE windows on the same day (split shift)', () => {
    expect(() => validateOpeningHours([
      open(1, '09:00', '14:00'),
      open(1, '17:00', '23:00'),
    ])).not.toThrow()
  })

  it('accepts ABUTTING windows within a day (prev.close === next.open, half-open)', () => {
    expect(() => validateOpeningHours([
      open(1, '09:00', '14:00'),
      open(1, '14:00', '23:00'),
    ])).not.toThrow()
  })

  it('rejects OVERLAPPING windows within a day', () => {
    expect(() => validateOpeningHours([
      open(1, '09:00', '14:00'),
      open(1, '13:00', '23:00'),
    ])).toThrow('OPENING_HOURS_INVALID')
  })

  it('accepts an OVERNIGHT period where closeTime crosses midnight (close < open)', () => {
    // 18:00 -> 02:00 is the first-class overnight (crosses-midnight) encoding.
    expect(() => validateOpeningHours([open(5, '18:00', '02:00')])).not.toThrow()
  })

  it('rejects a CROSS-DAY overlap (Mon 18:00-02:00 spill vs Tue 01:00-03:00)', () => {
    // Monday overnight 18:00->02:00 spills to Tuesday [00:00, 02:00); a Tuesday
    // 01:00-03:00 window overlaps that spill and MUST be rejected.
    expect(() => validateOpeningHours([
      open(1, '18:00', '02:00'),
      open(2, '01:00', '03:00'),
    ])).toThrow('OPENING_HOURS_INVALID')
  })

  it('accepts a CROSS-DAY abutting window (spill ends exactly at the next window open)', () => {
    // Monday spill ends at Tuesday 02:00; a Tuesday 02:00-05:00 window abuts (half-open).
    expect(() => validateOpeningHours([
      open(1, '18:00', '02:00'),
      open(2, '02:00', '05:00'),
    ])).not.toThrow()
  })

  it('accepts a closed day that STILL receives a prior-day overnight spill', () => {
    // Monday overnight spills into a CLOSED Tuesday: Tuesday has no own windows, so
    // there is nothing to reject; the branch is genuinely open during [00:00, 02:00).
    expect(() => validateOpeningHours([
      open(1, '18:00', '02:00'),
      closed(2),
    ])).not.toThrow()
  })

  it('wraps Sunday -> Monday (Sun 22:00-01:00 spill vs Mon 00:30-04:00 rejected)', () => {
    expect(() => validateOpeningHours([
      open(0, '22:00', '01:00'),
      open(1, '00:30', '04:00'),
    ])).toThrow('OPENING_HOURS_INVALID')
  })

  it('accepts Open 24h (00:00 -> 24:00 sentinel)', () => {
    expect(() => validateOpeningHours([open(2, '00:00', '24:00')])).not.toThrow()
  })

  it('accepts a closed day with no times', () => {
    expect(() => validateOpeningHours([closed(0)])).not.toThrow()
  })

  it('rejects mixing an isClosed row with open windows on the same day', () => {
    expect(() => validateOpeningHours([
      closed(3),
      open(3, '09:00', '17:00'),
    ])).toThrow('OPENING_HOURS_INVALID')
  })

  it('accepts a full mixed week (multi-window, closed days, overnight, 24h)', () => {
    expect(() => validateOpeningHours([
      closed(0),
      open(1, '09:00', '14:00'),
      open(1, '17:00', '23:00'),
      open(2, '00:00', '24:00'),
      open(3, '09:00', '17:00'),
      open(4, '09:00', '17:00'),
      open(5, '18:00', '02:00'),
      open(6, '10:00', '14:00'),
    ])).not.toThrow()
  })

  it('rejects a dayOfWeek out of range (defense-in-depth)', () => {
    expect(() => validateOpeningHours([open(7, '09:00', '17:00')])).toThrow('OPENING_HOURS_INVALID')
    expect(() => validateOpeningHours([open(-1, '09:00', '17:00')])).toThrow('OPENING_HOURS_INVALID')
  })

  it('rejects a closed day that still carries an openTime', () => {
    expect(() => validateOpeningHours([{ dayOfWeek: 0, openTime: '09:00', isClosed: true }]))
      .toThrow('OPENING_HOURS_INVALID')
  })

  it('rejects a closed day that still carries a closeTime', () => {
    expect(() => validateOpeningHours([{ dayOfWeek: 0, closeTime: '17:00', isClosed: true }]))
      .toThrow('OPENING_HOURS_INVALID')
  })

  it('rejects an open day missing openTime', () => {
    expect(() => validateOpeningHours([{ dayOfWeek: 1, closeTime: '17:00', isClosed: false }]))
      .toThrow('OPENING_HOURS_INVALID')
  })

  it('rejects an open day missing closeTime', () => {
    expect(() => validateOpeningHours([{ dayOfWeek: 1, openTime: '09:00', isClosed: false }]))
      .toThrow('OPENING_HOURS_INVALID')
  })

  it('rejects a malformed openTime (25:00)', () => {
    expect(() => validateOpeningHours([open(1, '25:00', '17:00')])).toThrow('OPENING_HOURS_INVALID')
  })

  it('rejects a malformed openTime (no leading zero "9:5")', () => {
    expect(() => validateOpeningHours([open(1, '9:5', '17:00')])).toThrow('OPENING_HOURS_INVALID')
  })

  it('rejects a malformed time ("0930" not HH:MM)', () => {
    expect(() => validateOpeningHours([open(1, '0930', '17:00')])).toThrow('OPENING_HOURS_INVALID')
  })

  it('rejects "24:30" as a time', () => {
    expect(() => validateOpeningHours([open(1, '09:00', '24:30')])).toThrow('OPENING_HOURS_INVALID')
  })

  it('rejects "24:00" used as openTime (sentinel is closeTime-only)', () => {
    expect(() => validateOpeningHours([open(1, '24:00', '17:00')])).toThrow('OPENING_HOURS_INVALID')
  })

  it('rejects a degenerate zero-length period (open === close)', () => {
    expect(() => validateOpeningHours([open(1, '09:00', '09:00')])).toThrow('OPENING_HOURS_INVALID')
  })

  it('accepts an empty array (no-op week)', () => {
    expect(() => validateOpeningHours([])).not.toThrow()
  })
})

describe('POST /api/v1/merchant/branches/:id/hours validation + STAGE-not-apply (route-level, PR-4 §4a)', () => {
  let app: FastifyInstance
  let merchantToken: string

  const mockBranch = {
    id: 'b1', merchantId: 'm1', name: 'Main Branch', isMainBranch: true,
    addressLine1: '1 Test St', city: 'London', postcode: 'EC1A 1BB',
    country: 'GB', isActive: true, deletedAt: null,
    openingHours: [], amenities: [], photos: [], pendingEdits: [], pendingHours: [],
  }

  // OWNER membership row resolved by resolveMerchantContext -> getActiveMembership
  // (merchantMembership.findMany). The single row drives role + branch scope.
  const ownerRow = {
    id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'OWNER',
    allBranches: true, canManageVouchers: false,
    merchant: { status: 'ACTIVE', businessName: 'Acme' },
    branches: [],
  }

  beforeEach(async () => {
    enqueueMock.mockClear()
    app = await buildApp()
    const prismaMock: any = {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: { findMany: vi.fn().mockResolvedValue([ownerRow]) },
      merchant: { findUnique: vi.fn() },
      branch: { findFirst: vi.fn().mockResolvedValue(mockBranch) },
      branchOpeningHours: { upsert: vi.fn().mockResolvedValue({}) },
      branchOpeningHoursPending: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'ph1', status: 'PENDING', ...data })),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    prismaMock.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prismaMock))
    app.decorate('prisma', prismaMock as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    merchantToken = (app.jwt as any).merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  it('rejects an OVERLAPPING multi-window payload with 400 and no staging write (PR-8)', async () => {
    // Branches PR-8: two windows on the SAME day is now VALID (multi-window); the
    // reject is now for OVERLAPPING windows, not for a repeated dayOfWeek.
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/branches/b1/hours',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        hours: [
          { dayOfWeek: 1, openTime: '09:00', closeTime: '14:00', isClosed: false },
          { dayOfWeek: 1, openTime: '13:00', closeTime: '17:00', isClosed: false },
        ],
      },
    })

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('OPENING_HOURS_INVALID')
    // Validation runs BEFORE any DB work: neither the staging write nor the enqueue
    // happens.
    expect(app.prisma.branchOpeningHoursPending.create).not.toHaveBeenCalled()
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('STAGES a non-overlapping multi-window day (split shift) with no live write (PR-8)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/branches/b1/hours',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        hours: [
          { dayOfWeek: 1, openTime: '09:00', closeTime: '14:00', isClosed: false },
          { dayOfWeek: 1, openTime: '17:00', closeTime: '23:00', isClosed: false },
        ],
      },
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.branchOpeningHoursPending.create).toHaveBeenCalledTimes(1)
    const createArg = (app.prisma.branchOpeningHoursPending.create as any).mock.calls[0][0]
    // Both windows for the day are carried into the staged proposedHours payload.
    expect(createArg.data.proposedHours).toHaveLength(2)
    expect(enqueueMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a closed-day-with-times payload with 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/branches/b1/hours',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { hours: [{ dayOfWeek: 0, openTime: '09:00', closeTime: '17:00', isClosed: true }] },
    })

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('OPENING_HOURS_INVALID')
    expect(app.prisma.branchOpeningHoursPending.create).not.toHaveBeenCalled()
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('accepts a well-formed week (incl. overnight + 24h) and STAGES one pending row (no live upsert)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/branches/b1/hours',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        hours: [
          { dayOfWeek: 0, isClosed: true },
          { dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isClosed: false },
          { dayOfWeek: 2, openTime: '00:00', closeTime: '24:00', isClosed: false },
          { dayOfWeek: 5, openTime: '18:00', closeTime: '02:00', isClosed: false },
        ],
      },
    })

    expect(res.statusCode).toBe(200)
    // STAGE-not-apply: the live hours are NOT upserted at write time.
    expect(app.prisma.branchOpeningHours.upsert).not.toHaveBeenCalled()
    // Exactly one PENDING row created, holding the full proposed week.
    expect(app.prisma.branchOpeningHoursPending.create).toHaveBeenCalledTimes(1)
    const createArg = (app.prisma.branchOpeningHoursPending.create as any).mock.calls[0][0]
    expect(createArg.data.status).toBe('PENDING')
    expect(createArg.data.branchId).toBe('b1')
    expect(createArg.data.merchantId).toBe('m1')
    expect(createArg.data.proposedHours).toHaveLength(4)
    expect(createArg.data.effectiveAt).toBeInstanceOf(Date)
    // The delayed promotion nudge is enqueued with a branch-keyed jobId + 2h delay.
    expect(enqueueMock).toHaveBeenCalledTimes(1)
    const [queueName, data, opts] = enqueueMock.mock.calls[0]
    expect(queueName).toBe('maintenance')
    expect(data.pendingId).toBe('ph1')
    expect(opts.jobId).toBe('promote-hours:b1')
    expect(opts.delay).toBe(2 * 60 * 60 * 1000)
    // Response is the staged pending record.
    expect(JSON.parse(res.body).status).toBe('PENDING')
  })
})
