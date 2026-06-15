// Unit tests for the WP4 stale-claim sweep (mock prisma, injected `now`, no DB).
// Proves: the candidate scan window/status/claimed filter, the alert + stamp,
// dedup (alert once per claim), re-arm (after release + reclaim), and best-effort
// (one failed alert does not abort the batch).

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/api/shared/adminNotify', () => ({
  adminNotify: vi.fn().mockResolvedValue(undefined),
}))

import { sweepStaleClaims, CLAIM_STALE_AGE_MS } from '../../../src/api/queues/processors/claimStaleSweep'
import { adminNotify } from '../../../src/api/shared/adminNotify'

const NOW = new Date('2026-06-15T12:00:00.000Z')
const hoursAgo = (h: number): Date => new Date(NOW.getTime() - h * 60 * 60 * 1000)

interface Row {
  id: string
  claimedById: string | null
  claimedAt: Date | null
  referenceId: string
  referenceType: string
  lastStaleAlertAt: Date | null
}

function makePrisma(rows: Row[]) {
  return {
    adminApproval: {
      findMany: vi.fn().mockResolvedValue(rows),
      update: vi.fn().mockResolvedValue({}),
    },
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(adminNotify as any).mockResolvedValue(undefined)
})

describe('sweepStaleClaims — candidate scan', () => {
  it('scans only PENDING, claimed, and claimed-over-24h-ago rows (bounded)', async () => {
    const prisma = makePrisma([])
    await sweepStaleClaims(prisma, NOW)
    const arg = prisma.adminApproval.findMany.mock.calls[0][0]
    expect(arg.where).toEqual({
      status: 'PENDING',
      claimedById: { not: null },
      claimedAt: { lt: new Date(NOW.getTime() - CLAIM_STALE_AGE_MS) },
    })
    expect(arg.take).toBe(200)
  })
})

describe('sweepStaleClaims — alert', () => {
  it('alerts the claimer and stamps lastStaleAlertAt for a fresh stale claim', async () => {
    const prisma = makePrisma([
      { id: 'a1', claimedById: 'admin-1', claimedAt: hoursAgo(25), referenceId: 'm1', referenceType: 'merchant', lastStaleAlertAt: null },
    ])
    const res = await sweepStaleClaims(prisma, NOW)
    expect(adminNotify).toHaveBeenCalledTimes(1)
    expect(adminNotify).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        adminUserId: 'admin-1',
        type: 'ADMIN_CLAIM_STALE',
        referenceId: 'm1',
        referenceType: 'merchant',
      }),
    )
    expect(prisma.adminApproval.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { lastStaleAlertAt: NOW },
    })
    expect(res).toEqual({ alerted: 1, scanned: 1 })
  })
})

describe('sweepStaleClaims — dedup + re-arm', () => {
  it('does NOT re-alert a claim already alerted (lastStaleAlertAt after claimedAt)', async () => {
    const claimedAt = hoursAgo(25)
    const prisma = makePrisma([
      { id: 'a1', claimedById: 'admin-1', claimedAt, referenceId: 'm1', referenceType: 'merchant', lastStaleAlertAt: new Date(claimedAt.getTime() + 1000) },
    ])
    const res = await sweepStaleClaims(prisma, NOW)
    expect(adminNotify).not.toHaveBeenCalled()
    expect(prisma.adminApproval.update).not.toHaveBeenCalled()
    expect(res).toEqual({ alerted: 0, scanned: 1 })
  })

  it('re-arms after release + reclaim (a newer claimedAt than the prior alert)', async () => {
    const prisma = makePrisma([
      { id: 'a1', claimedById: 'admin-2', claimedAt: hoursAgo(25), referenceId: 'm1', referenceType: 'merchant', lastStaleAlertAt: hoursAgo(48) },
    ])
    const res = await sweepStaleClaims(prisma, NOW)
    expect(adminNotify).toHaveBeenCalledTimes(1)
    expect(adminNotify).toHaveBeenCalledWith(prisma, expect.objectContaining({ adminUserId: 'admin-2' }))
    expect(prisma.adminApproval.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { lastStaleAlertAt: NOW } })
    expect(res.alerted).toBe(1)
  })
})

describe('sweepStaleClaims — best-effort', () => {
  it('continues the batch when one alert throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const prisma = makePrisma([
      { id: 'a1', claimedById: 'admin-1', claimedAt: hoursAgo(25), referenceId: 'm1', referenceType: 'merchant', lastStaleAlertAt: null },
      { id: 'a2', claimedById: 'admin-2', claimedAt: hoursAgo(30), referenceId: 'm2', referenceType: 'merchant', lastStaleAlertAt: null },
    ])
    ;(adminNotify as any).mockRejectedValueOnce(new Error('redis down')).mockResolvedValueOnce(undefined)
    const res = await sweepStaleClaims(prisma, NOW)
    expect(adminNotify).toHaveBeenCalledTimes(2)
    // a1 failed (no stamp); a2 succeeded (stamp). The batch was not aborted.
    expect(prisma.adminApproval.update).toHaveBeenCalledTimes(1)
    expect(prisma.adminApproval.update).toHaveBeenCalledWith({ where: { id: 'a2' }, data: { lastStaleAlertAt: NOW } })
    expect(res).toEqual({ alerted: 1, scanned: 2 })
  })
})
