import { describe, it, expect, vi, beforeEach } from 'vitest'

// notify is dynamically imported inside issueMerchantClaim — vi.mock intercepts it.
// This file builds no app, so a global notify mock is safe here.
vi.mock('../../../src/api/shared/notify', () => ({
  notify: vi.fn().mockResolvedValue({ queued: true, communicationLogId: 'cl-1' }),
}))

import { issueMerchantClaim } from '../../../src/api/auth/merchant/service'
import { notify } from '../../../src/api/shared/notify'

describe('issueMerchantClaim', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stores a 7-day claim token keyed to the owner admin, queues the claim email, and returns NO token', async () => {
    // PR-B review FIX A (supersession): issueMerchantClaim now reads the per-admin
    // current-token pointer (get), deletes any prior token (del), then writes BOTH
    // the new token AND the pointer (two sets). The double must support get/del.
    const redis = { get: vi.fn().mockResolvedValue(null), del: vi.fn().mockResolvedValue(0), set: vi.fn().mockResolvedValue('OK') }

    const ret = await issueMerchantClaim({} as any, redis as any, {
      adminId: 'ma-1', email: 'owner@example.com', ip: '1.2.3.4',
    })

    // returns void — the raw token is never handed back to the caller (so it can
    // never reach the admin API response, which returns the createMerchantDraft result).
    expect(ret).toBeUndefined()

    // First call: NO prior token (get → null), so no prior delete.
    expect(redis.get).toHaveBeenCalledWith('merchant-claim-current:ma-1')
    expect(redis.del).not.toHaveBeenCalled()

    // Two sets: (1) merchant-claim:<token> = adminId, EX = 7 days, (2) the pointer.
    expect(redis.set).toHaveBeenCalledTimes(2)
    const [key, value, ex, ttl] = redis.set.mock.calls[0]
    expect(key).toMatch(/^merchant-claim:.+/)
    expect(value).toBe('ma-1')
    expect(ex).toBe('EX')
    expect(ttl).toBe(7 * 24 * 3600)

    // The pointer write: merchant-claim-current:<adminId> = <token>, same TTL.
    const token = key.slice('merchant-claim:'.length)
    const [pKey, pValue, pEx, pTtl] = redis.set.mock.calls[1]
    expect(pKey).toBe('merchant-claim-current:ma-1')
    expect(pValue).toBe(token)
    expect(pEx).toBe('EX')
    expect(pTtl).toBe(7 * 24 * 3600)

    // claim email queued via the notify outbox — transactional, userId null, MERCHANT_ADMIN
    expect(notify).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(notify).mock.calls[0][2]
    expect(arg).toMatchObject({
      to: 'owner@example.com',
      recipientType: 'MERCHANT_ADMIN',
      recipientId: 'ma-1',
      userId: null,
      type: 'merchant_claim',
    })
    expect(arg.email.subject).toMatch(/set up your .* merchant account/i)
  })

  it('is best-effort: a notify failure does NOT throw — the token is still stored', async () => {
    vi.mocked(notify).mockRejectedValueOnce(new Error('email dark'))
    const redis = { get: vi.fn().mockResolvedValue(null), del: vi.fn().mockResolvedValue(0), set: vi.fn().mockResolvedValue('OK') }
    await expect(
      issueMerchantClaim({} as any, redis as any, { adminId: 'ma-2', email: 'x@y.com' })
    ).resolves.toBeUndefined()
    // Token + pointer both written despite the notify failure (best-effort send).
    expect(redis.set).toHaveBeenCalledTimes(2)
  })
})
