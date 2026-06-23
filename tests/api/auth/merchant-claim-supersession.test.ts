import { describe, it, expect, vi, beforeEach } from 'vitest'

// FIX A (P1 — claim-token supersession). Re-issuing a claim for the same admin
// must MINT a fresh token AND INVALIDATE the prior one (per-admin current-token
// pointer). Previously tokens were stored by token-key only, so a re-issue left
// BOTH tokens valid for the full 7-day TTL.

// notify is dynamically imported inside issueMerchantClaim — vi.mock intercepts it.
vi.mock('../../../src/api/shared/notify', () => ({
  notify: vi.fn().mockResolvedValue({ queued: true, communicationLogId: 'cl-1' }),
}))

import {
  issueMerchantClaim,
  claimMerchantAccount,
} from '../../../src/api/auth/merchant/service'
import { RedisKey } from '../../../src/api/shared/redis-keys'
import {
  inviteMember,
  removeMember,
} from '../../../src/api/merchant/staff/service'

const VALID = 'ValidPass1!'

/**
 * In-memory Redis double that models string get/set/del + TTL handling well
 * enough to prove the supersession semantics end-to-end. Only the operations the
 * claim flow uses are implemented.
 */
function fakeRedis() {
  const store = new Map<string, string>()
  return {
    store,
    get: vi.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
    set: vi.fn(async (k: string, v: string, ..._rest: any[]) => {
      store.set(k, v)
      return 'OK'
    }),
    del: vi.fn(async (k: string) => {
      const had = store.has(k)
      store.delete(k)
      return had ? 1 : 0
    }),
  }
}

/** Capture the token written into merchant-claim:<token> by the most recent issue. */
function lastIssuedToken(redis: ReturnType<typeof fakeRedis>): string {
  const tokenKeys = [...redis.store.keys()].filter(
    (k) => k.startsWith('merchant-claim:') && !k.startsWith('merchant-claim-current:'),
  )
  // The supersession deletes the prior token key, so at most one should remain.
  expect(tokenKeys.length).toBe(1)
  return tokenKeys[0].slice('merchant-claim:'.length)
}

describe('FIX A — claim-token supersession', () => {
  beforeEach(() => vi.clearAllMocks())

  it('(1) re-issuing for the same admin deletes the FIRST token: claiming with the OLD token throws CLAIM_TOKEN_EXPIRED; the NEW token claims OK', async () => {
    const redis = fakeRedis()

    await issueMerchantClaim({} as any, redis as any, { adminId: 'ma-1', email: 'o@x.com' })
    const firstToken = lastIssuedToken(redis)
    // The per-admin pointer points at the first token.
    expect(redis.store.get(RedisKey.merchantClaimCurrent('ma-1'))).toBe(firstToken)

    await issueMerchantClaim({} as any, redis as any, { adminId: 'ma-1', email: 'o@x.com' })
    const secondToken = lastIssuedToken(redis)
    expect(secondToken).not.toBe(firstToken)
    // The pointer advanced; the first token key is gone (superseded).
    expect(redis.store.get(RedisKey.merchantClaimCurrent('ma-1'))).toBe(secondToken)
    expect(redis.store.has(RedisKey.merchantClaim(firstToken))).toBe(false)
    expect(redis.store.has(RedisKey.merchantClaim(secondToken))).toBe(true)

    // Claiming with the OLD token now fails (Redis miss → CLAIM_TOKEN_EXPIRED).
    const prismaA: any = {
      merchantAdmin: { update: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    await expect(
      claimMerchantAccount(prismaA, redis as any, { token: firstToken, newPassword: VALID, ipAddress: '1.1.1.1', userAgent: 'vitest' }),
    ).rejects.toThrow('CLAIM_TOKEN_EXPIRED')
    expect(prismaA.merchantAdmin.update).not.toHaveBeenCalled()

    // Claiming with the NEW token succeeds.
    const prismaB: any = {
      merchantAdmin: { update: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    await claimMerchantAccount(prismaB, redis as any, { token: secondToken, newPassword: VALID, ipAddress: '1.1.1.1', userAgent: 'vitest' })
    expect(prismaB.merchantAdmin.update).toHaveBeenCalled()
  })

  it('(2) after a successful claim, BOTH the token key AND the per-admin current pointer are gone', async () => {
    const redis = fakeRedis()
    await issueMerchantClaim({} as any, redis as any, { adminId: 'ma-2', email: 'o2@x.com' })
    const token = lastIssuedToken(redis)
    expect(redis.store.has(RedisKey.merchantClaimCurrent('ma-2'))).toBe(true)

    const prisma: any = {
      merchantAdmin: { update: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    await claimMerchantAccount(prisma, redis as any, { token, newPassword: VALID, ipAddress: '1.1.1.1', userAgent: 'vitest' })

    expect(redis.store.has(RedisKey.merchantClaim(token))).toBe(false)
    expect(redis.store.has(RedisKey.merchantClaimCurrent('ma-2'))).toBe(false)
  })

  it('(3) re-invite-after-remove (staff reactivate-DELETED → issueMerchantClaim) supersedes the prior claim token the same way', async () => {
    const redis = fakeRedis()

    // Build a prisma double for the re-invite path. The removed admin already has a
    // DELETED membership for THIS merchant; inviteMember reactivates it and issues a
    // FRESH claim. We pre-seed an OLD claim token for that admin to prove it is killed.
    const existingAdminId = 'removed-admin'
    await issueMerchantClaim({} as any, redis as any, { adminId: existingAdminId, email: 're@x.com' })
    const oldToken = lastIssuedToken(redis)
    expect(redis.store.has(RedisKey.merchantClaim(oldToken))).toBe(true)

    const ctx: any = {
      adminId: 'owner-admin', merchantId: 'm1', role: 'OWNER',
      allBranches: true, allowedBranchIds: [], canManageVouchers: true,
      ipAddress: '1.1.1.1', userAgent: 'vitest',
    }
    const prisma: any = {
      merchantMembership: {
        // resolveAdminMerchant (owner-only)
        findFirst: vi.fn().mockResolvedValue({
          id: 'owner-mm', merchantId: 'm1', merchantAdminId: 'owner-admin',
          merchant: { status: 'ACTIVE', businessName: 'X' },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      merchantAdmin: {
        findUnique: vi.fn().mockResolvedValue({
          id: existingAdminId,
          memberships: [{ id: 'old-mm', merchantId: 'm1', status: 'DELETED' }],
        }),
      },
      merchantMembershipBranch: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      branch: { findMany: vi.fn().mockResolvedValue([]) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    prisma.$transaction = vi.fn().mockImplementation(async (cb: any) => cb(prisma))

    await inviteMember(prisma, redis as any, ctx.adminId, {
      email: 're@x.com', firstName: 'Re', lastName: 'Member',
      role: 'STAFF', allBranches: true,
    }, ctx)

    // The re-invite issued a FRESH claim that superseded the old token.
    const newToken = lastIssuedToken(redis)
    expect(newToken).not.toBe(oldToken)
    expect(redis.store.has(RedisKey.merchantClaim(oldToken))).toBe(false)
    expect(redis.store.has(RedisKey.merchantClaim(newToken))).toBe(true)
    expect(redis.store.get(RedisKey.merchantClaimCurrent(existingAdminId))).toBe(newToken)
  })

  it('(4) inviteMember / removeMember responses never contain a token or claim-link field — only { memberId, inviteDelivery }', async () => {
    const redis = fakeRedis()
    const ctx: any = {
      adminId: 'owner-admin', merchantId: 'm1', role: 'OWNER',
      allBranches: true, allowedBranchIds: [], canManageVouchers: true,
      ipAddress: '1.1.1.1', userAgent: 'vitest',
    }
    const prisma: any = {
      merchantMembership: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'owner-mm', merchantId: 'm1', merchantAdminId: 'owner-admin',
          merchant: { status: 'ACTIVE', businessName: 'X' },
        }),
        create: vi.fn().mockResolvedValue({ id: 'new-mm' }),
        update: vi.fn().mockResolvedValue({}),
      },
      merchantAdmin: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'new-admin', email: 'new@x.com' }),
      },
      merchantMembershipBranch: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      branch: { findMany: vi.fn().mockResolvedValue([]) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    prisma.$transaction = vi.fn().mockImplementation(async (cb: any) => cb(prisma))

    const invited = await inviteMember(prisma, redis as any, ctx.adminId, {
      email: 'new@x.com', firstName: 'New', lastName: 'Member',
      role: 'STAFF', allBranches: true,
    }, ctx)

    expect(Object.keys(invited).sort()).toEqual(['inviteDelivery', 'memberId'])
    const invitedJson = JSON.stringify(invited)
    expect(invitedJson).not.toMatch(/token/i)
    expect(invitedJson).not.toMatch(/claim/i)

    // removeMember response shape (no token leak either).
    const target = {
      id: 'mm-target', merchantId: 'm1', merchantAdminId: 'target-admin',
      role: 'STAFF', status: 'ACTIVE', allBranches: true, canManageVouchers: false,
      merchantAdmin: { id: 'target-admin', email: 't@x.com', passwordHash: 'HASH', firstName: 'T', lastName: 'X' },
      branches: [],
    }
    prisma.merchantMembership.findUnique = vi.fn().mockResolvedValue(target)
    prisma.merchantMembership.count = vi.fn().mockResolvedValue(2)
    prisma.userSession = { updateMany: vi.fn().mockResolvedValue({ count: 0 }) }
    const removeRedis: any = { ...redis, keys: vi.fn().mockResolvedValue([]) }

    const removed = await removeMember(prisma, removeRedis, ctx.adminId, 'mm-target', ctx)
    expect(Object.keys(removed)).toEqual(['id'])
  })
})
