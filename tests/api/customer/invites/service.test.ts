import { describe, it, expect, vi } from 'vitest'
import { Prisma } from '../../../../generated/prisma/client'
import { submitInvite, scrubInvitesForUser } from '../../../../src/api/customer/invites/service'
import { buildInviterKey } from '../../../../src/api/customer/invites/identity'

// Customer merchant-invite programme M0 with a mocked Prisma — mirrors the
// mock shape in tests/api/admin/leads-service.test.ts ($transaction resolves
// by invoking the callback with a `tx` object whose model methods are
// individually stubbed). Load-bearing pins:
//   - pipeline privacy: a non-ACTIVE (draft/pipeline) merchant match returns
//     the SAME { kind: 'ok' } shape as an unknown business — never leaks the
//     draft merchant's id/status — and the created invite is NOT reward-eligible.
//   - only an ACTIVE merchant triggers `already_live`.
//   - note validation fails BEFORE any DB write; the open-invite cap is
//     checked INSIDE the transaction, AFTER the advisory locks AND after an
//     in-lock duplicate pre-check (Codex correction round 3, 2026-07-14):
//     `SET LOCAL lock_timeout = '3s'` then the namespaced two-arg
//     `pg_advisory_xact_lock(1, hashtext(placeKey))` /
//     `pg_advisory_xact_lock(2, hashtext(inviterKey))` pair (two separate
//     $executeRaw calls, in that order), then
//     `tx.merchantInvite.findUnique({ where: { inviterKey_placeKey } })` — an
//     exact duplicate short-circuits to { kind: 'ok' } BEFORE the cap count
//     ever runs, so a duplicate can never consume/be blocked by cap headroom.
//   - a duplicate (inviterKey, placeKey) P2002 (the cross-transaction
//     backstop) is swallowed to { kind: 'ok' }, matched EXACTLY (not by
//     substring).
//   - a lock_timeout expiry (P2010 + meta.code '55P03') on the lock
//     $executeRaw maps to AppError INVITE_SUBMIT_CONTENTION (429).
//   - scrubInvitesForUser (account erasure) now SEVERS the person linkage:
//     voids PENDING InviteRewardGrant rows first, then nulls
//     inviterUserId/inviterKey (not just note/email/ipHash) and sets
//     rewardEligible false on every non-anonymised invite for the user.

const BASE_INPUT = {
  userId: 'user-1',
  businessNameRaw: 'Bloom Cafe',
  localityRaw: 'SW1',
  googlePlaceId: null as string | null,
  note: null as string | null,
  consentShareName: true,
  ip: '203.0.113.5',
  userAgent: 'test-agent',
}

function matchingBranch(overrides: Record<string, unknown> = {}) {
  return {
    addressLine1: '1 High St',
    addressLine2: null,
    city: 'London',
    postcode: 'SW1 1AA',
    localityName: null,
    postTown: null,
    ...overrides,
  }
}

function makeTx(overrides: {
  merchantLeadFindMany?: any
  merchantLeadCreate?: any
  merchantLeadUpdate?: any
  merchantInviteFindFirst?: any
  merchantInviteFindUnique?: any
  merchantInviteCreate?: any
  merchantInviteCount?: any
  executeRaw?: any
} = {}) {
  return {
    $executeRaw: overrides.executeRaw ?? vi.fn().mockResolvedValue(0),
    merchantLead: {
      findMany: overrides.merchantLeadFindMany ?? vi.fn().mockResolvedValue([]),
      create: overrides.merchantLeadCreate ?? vi.fn().mockResolvedValue({ id: 'lead-new' }),
      update: overrides.merchantLeadUpdate ?? vi.fn().mockResolvedValue({}),
    },
    merchantInvite: {
      findFirst: overrides.merchantInviteFindFirst ?? vi.fn().mockResolvedValue(null),
      // In-lock duplicate pre-check (correction round 3). Default: no
      // existing (inviterKey, placeKey) row.
      findUnique: overrides.merchantInviteFindUnique ?? vi.fn().mockResolvedValue(null),
      create: overrides.merchantInviteCreate ?? vi.fn().mockResolvedValue({ id: 'invite-1' }),
      count: overrides.merchantInviteCount ?? vi.fn().mockResolvedValue(0),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
}

function makePrisma(tx: any, overrides: {
  branchFindFirst?: any
  merchantFindFirst?: any
  merchantLeadFindMany?: any
  merchantInviteUpdateMany?: any
  transactionImpl?: any
} = {}) {
  return {
    $transaction: overrides.transactionImpl ?? vi.fn().mockImplementation(async (cb: any) => cb(tx)),
    branch: { findFirst: overrides.branchFindFirst ?? vi.fn().mockResolvedValue(null) },
    merchant: { findFirst: overrides.merchantFindFirst ?? vi.fn().mockResolvedValue(null) },
    merchantLead: { findMany: overrides.merchantLeadFindMany ?? vi.fn().mockResolvedValue([]) },
    merchantInvite: { updateMany: overrides.merchantInviteUpdateMany ?? vi.fn().mockResolvedValue({ count: 0 }) },
  } as any
}

describe('identity: buildInviterKey', () => {
  it('returns "u:" + userId, the stable non-PII identity', () => {
    expect(buildInviterKey('user-1')).toBe('u:user-1')
    expect(buildInviterKey('abc-123-def')).toBe('u:abc-123-def')
  })
})

describe('submitInvite: already_live (googlePlaceId path)', () => {
  it('returns already_live when the Place resolves to an ACTIVE merchant', async () => {
    const branchFindFirst = vi.fn().mockResolvedValue({
      merchant: { id: 'm-1', businessName: 'Bloom Cafe', status: 'ACTIVE' },
    })
    const tx = makeTx()
    const prisma = makePrisma(tx, { branchFindFirst })
    const res = await submitInvite(prisma, { ...BASE_INPUT, googlePlaceId: 'gp-123' })
    expect(res).toEqual({ kind: 'already_live', merchantId: 'm-1', businessName: 'Bloom Cafe' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('submitInvite: pipeline privacy (DRAFT/non-ACTIVE merchant match)', () => {
  it('a non-ACTIVE merchant match is treated as unknown: response is EXACTLY { kind: "ok" } and rewardEligible is false', async () => {
    // The mock inspects the `where` clause to emulate the DB-level ACTIVE
    // filter: the (d) LIVE check queries status:'ACTIVE' and finds nothing;
    // the (f) eligibility re-run drops the status filter and finds the draft.
    const merchantFindFirst = vi.fn().mockImplementation(async (args: any) => {
      if (args.where.status === 'ACTIVE') return null
      return {
        id: 'm-draft', businessName: 'Bloom Cafe', status: 'REGISTERED',
        branches: [matchingBranch()],
      }
    })
    const merchantInviteCreate = vi.fn().mockResolvedValue({ id: 'invite-1' })
    const tx = makeTx({ merchantInviteCreate })
    const prisma = makePrisma(tx, { merchantFindFirst })

    const res = await submitInvite(prisma, BASE_INPUT)

    expect(res).toEqual({ kind: 'ok' })
    expect(merchantInviteCreate).toHaveBeenCalledOnce()
    const data = merchantInviteCreate.mock.calls[0][0].data
    expect(data.rewardEligible).toBe(false)
    expect(data.status).toBe('ACTIVE') // no held term — status is still ACTIVE, only reward is withheld
  })
})

describe('submitInvite: unknown business', () => {
  it('creates a MerchantLead (CUSTOMER_REQUEST/LEAD) and an ACTIVE invite with countableAt set + rewardEligible true', async () => {
    const merchantLeadCreate = vi.fn().mockResolvedValue({ id: 'lead-new' })
    const merchantInviteCreate = vi.fn().mockResolvedValue({ id: 'invite-1' })
    const tx = makeTx({ merchantLeadCreate, merchantInviteCreate })
    const prisma = makePrisma(tx)

    const res = await submitInvite(prisma, BASE_INPUT)

    expect(res).toEqual({ kind: 'ok' })
    expect(merchantLeadCreate).toHaveBeenCalledOnce()
    const leadData = merchantLeadCreate.mock.calls[0][0].data
    expect(leadData).toMatchObject({
      businessName: 'Bloom Cafe',
      locationHint: 'SW1',
      source: 'CUSTOMER_REQUEST',
      stage: 'LEAD',
    })

    expect(merchantInviteCreate).toHaveBeenCalledOnce()
    const inviteData = merchantInviteCreate.mock.calls[0][0].data
    expect(inviteData.status).toBe('ACTIVE')
    expect(inviteData.rewardEligible).toBe(true)
    expect(inviteData.countableAt).toBeInstanceOf(Date)
    expect(inviteData.leadId).toBe('lead-new')

    // Identity: inviterKey carries 'u:'+userId, and NO email is persisted.
    expect(inviteData.inviterKey).toBe('u:user-1')
    expect(inviteData.inviterEmailNorm).toBeUndefined()

    // LEAD_CREATED + INVITE_CREATED audit rows, both actorType CUSTOMER.
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2)
    expect(tx.auditLog.create.mock.calls[0][0].data.event).toBe('LEAD_CREATED')
    expect(tx.auditLog.create.mock.calls[1][0].data.event).toBe('INVITE_CREATED')
  })
})

describe('submitInvite: attaches to an existing early-stage lead', () => {
  it('attaches without creating a new lead, and bumps lastActivityAt', async () => {
    const existingLead = { id: 'lead-existing', locationHint: 'SW1', convertedMerchantId: null }
    const merchantLeadFindManyTx = vi.fn().mockResolvedValue([existingLead])
    const merchantLeadCreate = vi.fn()
    const merchantLeadUpdate = vi.fn().mockResolvedValue({})
    const merchantInviteCreate = vi.fn().mockResolvedValue({ id: 'invite-1' })
    const tx = makeTx({
      merchantLeadFindMany: merchantLeadFindManyTx,
      merchantLeadCreate,
      merchantLeadUpdate,
      merchantInviteCreate,
    })
    const prisma = makePrisma(tx, { merchantLeadFindMany: vi.fn().mockResolvedValue([existingLead]) })

    const res = await submitInvite(prisma, BASE_INPUT)

    expect(res).toEqual({ kind: 'ok' })
    expect(merchantLeadCreate).not.toHaveBeenCalled()
    expect(merchantLeadUpdate).toHaveBeenCalledWith({
      where: { id: 'lead-existing' },
      data: { lastActivityAt: expect.any(Date) },
    })
    const inviteData = merchantInviteCreate.mock.calls[0][0].data
    expect(inviteData.leadId).toBe('lead-existing')
  })
})

describe('submitInvite: email-change dedupe (identity is userId, not email)', () => {
  it('the SAME userId submitting the same business twice (account email changed between the two submits at the auth layer) still dedupes: first ok, second ok via P2002', async () => {
    // SubmitInviteInput carries no email field at all — identity is userId
    // only, so an email change at the auth layer between the two submits
    // (invisible to this function's input shape) cannot bypass the dedupe.
    // Call 1: fresh business, succeeds and creates the invite carrying
    // inviterKey 'u:user-1'.
    const merchantInviteCreate1 = vi.fn().mockResolvedValue({ id: 'invite-1' })
    const tx1 = makeTx({ merchantInviteCreate: merchantInviteCreate1 })
    const prisma1 = makePrisma(tx1)
    const firstRes = await submitInvite(prisma1, BASE_INPUT)
    expect(firstRes).toEqual({ kind: 'ok' })
    expect(merchantInviteCreate1.mock.calls[0][0].data.inviterKey).toBe('u:user-1')

    // Call 2: same userId, same business — the DB unique constraint on
    // (inviterKey, placeKey) fires as a P2002, which submitInvite swallows
    // to the same { kind: 'ok' } shape, regardless of any email change.
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.0.0',
      meta: { target: ['inviterKey', 'placeKey'] },
    })
    const tx2 = makeTx()
    const prisma2 = makePrisma(tx2, { transactionImpl: vi.fn().mockRejectedValue(p2002) })
    const secondRes = await submitInvite(prisma2, BASE_INPUT)
    expect(secondRes).toEqual({ kind: 'ok' })
  })
})

describe('submitInvite: P2002 exact-match (inviterKey, placeKey)', () => {
  it('meta.target as array ["inviterKey","placeKey"] (in this order) -> ok', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.0.0',
      meta: { target: ['inviterKey', 'placeKey'] },
    })
    const tx = makeTx()
    const prisma = makePrisma(tx, { transactionImpl: vi.fn().mockRejectedValue(p2002) })
    const res = await submitInvite(prisma, BASE_INPUT)
    expect(res).toEqual({ kind: 'ok' })
  })

  it('meta.target as array in the OPPOSITE order ["placeKey","inviterKey"] -> ok (order-insensitive)', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.0.0',
      meta: { target: ['placeKey', 'inviterKey'] },
    })
    const tx = makeTx()
    const prisma = makePrisma(tx, { transactionImpl: vi.fn().mockRejectedValue(p2002) })
    const res = await submitInvite(prisma, BASE_INPUT)
    expect(res).toEqual({ kind: 'ok' })
  })

  it('meta.target as the constraint-name string "MerchantInvite_inviterKey_placeKey_key" -> ok', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.0.0',
      meta: { target: 'MerchantInvite_inviterKey_placeKey_key' },
    })
    const tx = makeTx()
    const prisma = makePrisma(tx, { transactionImpl: vi.fn().mockRejectedValue(p2002) })
    const res = await submitInvite(prisma, BASE_INPUT)
    expect(res).toEqual({ kind: 'ok' })
  })

  it('meta.target ["somethingElse"] -> rethrows (not the composite constraint)', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.0.0',
      meta: { target: ['somethingElse'] },
    })
    const tx = makeTx()
    const prisma = makePrisma(tx, { transactionImpl: vi.fn().mockRejectedValue(p2002) })
    await expect(submitInvite(prisma, BASE_INPUT)).rejects.toBe(p2002)
  })

  it('P2002 with no meta -> rethrows', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.0.0',
    })
    const tx = makeTx()
    const prisma = makePrisma(tx, { transactionImpl: vi.fn().mockRejectedValue(p2002) })
    await expect(submitInvite(prisma, BASE_INPUT)).rejects.toBe(p2002)
  })
})

describe('submitInvite: advisory lock discipline (correction round 3, namespaced two-arg locks)', () => {
  it('sets lock_timeout, then acquires both namespaced advisory locks (raw SQL mentioning pg_advisory_xact_lock(1, ... and pg_advisory_xact_lock(2, ...), in that order, BEFORE the duplicate pre-check, the in-tx cap check, and any lead/invite write', async () => {
    const executeRaw = vi.fn().mockResolvedValue(0)
    const merchantInviteFindUnique = vi.fn().mockResolvedValue(null)
    const merchantInviteCount = vi.fn().mockResolvedValue(0)
    const merchantLeadCreate = vi.fn().mockResolvedValue({ id: 'lead-new' })
    const merchantInviteCreate = vi.fn().mockResolvedValue({ id: 'invite-1' })
    const tx = makeTx({ executeRaw, merchantInviteFindUnique, merchantInviteCount, merchantLeadCreate, merchantInviteCreate })
    const prisma = makePrisma(tx)

    await submitInvite(prisma, BASE_INPUT)

    // Exactly two raw statements: SET LOCAL lock_timeout, then the lock
    // acquisition — never combined into one, never reordered.
    expect(executeRaw).toHaveBeenCalledTimes(2)

    const setLocalStrings = executeRaw.mock.calls[0][0] as TemplateStringsArray
    expect(Array.from(setLocalStrings).join('')).toContain('SET LOCAL lock_timeout')

    const lockStrings = executeRaw.mock.calls[1][0] as TemplateStringsArray
    const lockSql = Array.from(lockStrings).join('')
    expect(lockSql).toContain('pg_advisory_xact_lock(1,')
    expect(lockSql).toContain('pg_advisory_xact_lock(2,')

    const setLocalOrder = executeRaw.mock.invocationCallOrder[0]
    const lockOrder = executeRaw.mock.invocationCallOrder[1]
    expect(setLocalOrder).toBeLessThan(lockOrder)
    expect(lockOrder).toBeLessThan(merchantInviteFindUnique.mock.invocationCallOrder[0])
    expect(lockOrder).toBeLessThan(merchantInviteCount.mock.invocationCallOrder[0])
    expect(lockOrder).toBeLessThan(merchantLeadCreate.mock.invocationCallOrder[0])
    expect(lockOrder).toBeLessThan(merchantInviteCreate.mock.invocationCallOrder[0])
  })
})

describe('submitInvite: in-lock duplicate pre-check + cap (correction round 3)', () => {
  it('an existing (inviterKey, placeKey) row short-circuits to { kind: "ok" } BEFORE the cap check: count is NEVER called, and nothing is created', async () => {
    const merchantInviteFindUnique = vi.fn().mockResolvedValue({ id: 'invite-existing' })
    // Deliberately at-cap — if the pre-check didn't short-circuit before the
    // cap, this would (wrongly) reject the idempotent duplicate.
    const merchantInviteCount = vi.fn().mockResolvedValue(10)
    const merchantLeadCreate = vi.fn()
    const merchantInviteCreate = vi.fn()
    const tx = makeTx({ merchantInviteFindUnique, merchantInviteCount, merchantLeadCreate, merchantInviteCreate })
    const prisma = makePrisma(tx)

    const res = await submitInvite(prisma, BASE_INPUT)

    expect(res).toEqual({ kind: 'ok' })
    expect(merchantInviteCount).not.toHaveBeenCalled()
    expect(merchantLeadCreate).not.toHaveBeenCalled()
    expect(merchantInviteCreate).not.toHaveBeenCalled()
  })

  it('no duplicate (findUnique null) + tx count at the cap (10) still throws INVITE_CAP_REACHED, and never reaches invite create', async () => {
    const merchantInviteFindUnique = vi.fn().mockResolvedValue(null)
    const merchantInviteCount = vi.fn().mockResolvedValue(10)
    const merchantInviteCreate = vi.fn().mockResolvedValue({ id: 'invite-1' })
    const tx = makeTx({ merchantInviteFindUnique, merchantInviteCount, merchantInviteCreate })
    const prisma = makePrisma(tx)

    await expect(submitInvite(prisma, BASE_INPUT)).rejects.toThrow('INVITE_CAP_REACHED')
    expect(merchantInviteCreate).not.toHaveBeenCalled()
  })
})

describe('submitInvite: lock-timeout contention mapping (correction round 3)', () => {
  it('a P2010 (SQLSTATE 55P03 in meta.code) on the lock-acquisition $executeRaw maps to AppError INVITE_SUBMIT_CONTENTION', async () => {
    // Constructed the same way the existing P2002 fixtures in this file
    // construct PrismaClientKnownRequestError: the public two-arg form
    // (message, { code, clientVersion, meta }) — it accepts any code/meta
    // shape, so no Object.create/assign workaround is needed here.
    const p2010 = new Prisma.PrismaClientKnownRequestError('canceling statement due to lock timeout', {
      code: 'P2010',
      clientVersion: '7.0.0',
      meta: { code: '55P03' },
    })
    const executeRaw = vi.fn()
      .mockResolvedValueOnce(0) // SET LOCAL lock_timeout succeeds
      .mockRejectedValueOnce(p2010) // the lock-acquisition statement times out
    const tx = makeTx({ executeRaw })
    const prisma = makePrisma(tx)

    await expect(submitInvite(prisma, BASE_INPUT)).rejects.toThrow('INVITE_SUBMIT_CONTENTION')
  })
})

describe('submitInvite: held-term note', () => {
  it('creates a HELD_REVIEW invite with countableAt null and rewardEligible false', async () => {
    const merchantInviteCreate = vi.fn().mockResolvedValue({ id: 'invite-1' })
    const tx = makeTx({ merchantInviteCreate })
    const prisma = makePrisma(tx)

    const res = await submitInvite(prisma, { ...BASE_INPUT, note: 'honestly this feels like a scam' })

    expect(res).toEqual({ kind: 'ok' })
    const data = merchantInviteCreate.mock.calls[0][0].data
    expect(data.status).toBe('HELD_REVIEW')
    expect(data.countableAt).toBeNull()
    expect(data.rewardEligible).toBe(false)
    expect(data.note).toBe('honestly this feels like a scam')
  })
})

describe('submitInvite: invalid note (URL)', () => {
  it('throws INVITE_NOTE_INVALID before touching the database', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await expect(
      submitInvite(prisma, { ...BASE_INPUT, note: 'check us out at https://example.com' }),
    ).rejects.toThrow('INVITE_NOTE_INVALID')
    expect(prisma.branch.findFirst).not.toHaveBeenCalled()
    expect(prisma.merchant.findFirst).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('submitInvite: D8 eligibility, freshly-converted business (lead review round)', () => {
  it('a BRANCHLESS non-ACTIVE merchant name-match (a fresh convertLead draft) disqualifies rewardEligible', async () => {
    const merchantFindFirst = vi.fn().mockImplementation(async (args: any) => {
      if (args.where.status === 'ACTIVE') return null
      // convertLead creates the Merchant with NO branches: the eligibility
      // lane must still see it, or the D8 insider window opens.
      return { id: 'm-draft', businessName: 'Bloom Cafe', status: 'REGISTERED', branches: [] }
    })
    const merchantInviteCreate = vi.fn().mockResolvedValue({ id: 'invite-1' })
    const tx = makeTx({ merchantInviteCreate })
    const prisma = makePrisma(tx, { merchantFindFirst })

    const res = await submitInvite(prisma, BASE_INPUT)

    expect(res).toEqual({ kind: 'ok' })
    expect(merchantInviteCreate).toHaveBeenCalledOnce()
    expect(merchantInviteCreate.mock.calls[0][0].data.rewardEligible).toBe(false)
  })

  it('a CONVERTED lead matching name+locality disqualifies rewardEligible even when no merchant matches', async () => {
    // Covers the renamed-at-conversion case: the draft merchant may be
    // unmatchable by name/place, but the CONVERTED lead still records that
    // this business began onboarding.
    const merchantLeadFindMany = vi.fn().mockImplementation(async (args: any) => {
      if (args.where.stage === 'CONVERTED') {
        return [{ id: 'lead-converted', locationHint: 'SW1' }]
      }
      return [] // open-lane attach lookup finds nothing
    })
    const merchantInviteCreate = vi.fn().mockResolvedValue({ id: 'invite-1' })
    const tx = makeTx({ merchantInviteCreate })
    const prisma = makePrisma(tx, { merchantLeadFindMany })

    const res = await submitInvite(prisma, BASE_INPUT)

    expect(res).toEqual({ kind: 'ok' })
    expect(merchantInviteCreate).toHaveBeenCalledOnce()
    expect(merchantInviteCreate.mock.calls[0][0].data.rewardEligible).toBe(false)
  })
})

describe('submitInvite: F1 (adversarial review), Places-lane branch-miss falls through to the name lane', () => {
  it('placeId with NO branch match + a branchless draft name-match still disqualifies rewardEligible', async () => {
    // convertLead draft: no branch carries the placeId yet, and the draft has
    // no branches at all — the eligibility lane must fall through to the
    // name lane or the Places lane reopens the D8 insider window.
    const branchFindFirst = vi.fn().mockResolvedValue(null)
    const merchantFindFirst = vi.fn().mockImplementation(async (args: any) => {
      if (args.where.status === 'ACTIVE') return null
      return { id: 'm-draft', businessName: 'Bloom Cafe', status: 'REGISTERED', branches: [] }
    })
    const merchantInviteCreate = vi.fn().mockResolvedValue({ id: 'invite-1' })
    const tx = makeTx({ merchantInviteCreate })
    const prisma = makePrisma(tx, { branchFindFirst, merchantFindFirst })

    const res = await submitInvite(prisma, { ...BASE_INPUT, googlePlaceId: 'gp-123' })

    expect(res).toEqual({ kind: 'ok' })
    expect(merchantInviteCreate).toHaveBeenCalledOnce()
    expect(merchantInviteCreate.mock.calls[0][0].data.rewardEligible).toBe(false)
  })

  it('placeId with NO branch match + an ACTIVE name+locality match is revealed as already_live (manual-pin live merchant)', async () => {
    const branchFindFirst = vi.fn().mockResolvedValue(null)
    const merchantFindFirst = vi.fn().mockImplementation(async (args: any) => {
      if (args.where.status === 'ACTIVE') {
        return { id: 'm-live', businessName: 'Bloom Cafe', status: 'ACTIVE', branches: [matchingBranch({ city: 'SW1' })] }
      }
      return null
    })
    const tx = makeTx()
    const prisma = makePrisma(tx, { branchFindFirst, merchantFindFirst })

    const res = await submitInvite(prisma, { ...BASE_INPUT, googlePlaceId: 'gp-123' })

    expect(res).toEqual({ kind: 'already_live', merchantId: 'm-live', businessName: 'Bloom Cafe' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('scrubInvitesForUser (correction round 3: severs person linkage)', () => {
  it('voids PENDING reward grants, then nulls the invite person-linkage (inviterUserId + inviterKey) alongside the existing PII fields, clears rewardEligible, and returns the scrubbed invite count', async () => {
    const inviteRewardGrantUpdateMany = vi.fn().mockResolvedValue({ count: 2 })
    const merchantInviteUpdateMany = vi.fn().mockResolvedValue({ count: 3 })
    const prisma = {
      inviteRewardGrant: { updateMany: inviteRewardGrantUpdateMany },
      merchantInvite: { updateMany: merchantInviteUpdateMany },
    } as any

    const count = await scrubInvitesForUser(prisma, 'user-1')

    expect(count).toBe(3)

    // PENDING grants are voided (ISSUED/CONSUMED are financial records and
    // are left untouched by this call — not asserted here since the mock
    // only reports the PENDING-scoped updateMany shape).
    expect(inviteRewardGrantUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', status: 'PENDING' },
      data: { status: 'VOIDED', voidReason: 'ACCOUNT_DELETED' },
    })

    // The invite update now nulls inviterUserId + inviterKey (severing the
    // person linkage entirely — NULLs drop the row out of the
    // (inviterKey, placeKey) unique constraint and out of the cap/mine
    // queries), on top of the pre-existing note/email/ipHash nulling, and
    // clears rewardEligible (a deleted account's pending reward lapses).
    expect(merchantInviteUpdateMany).toHaveBeenCalledWith({
      where: { inviterUserId: 'user-1', anonymisedAt: null },
      data: {
        note: null,
        inviterEmailNorm: null,
        ipHash: null,
        inviterUserId: null,
        inviterKey: null,
        rewardEligible: false,
        anonymisedAt: expect.any(Date),
      },
    })

    // Grants are voided BEFORE the invite linkage is severed.
    expect(inviteRewardGrantUpdateMany.mock.invocationCallOrder[0])
      .toBeLessThan(merchantInviteUpdateMany.mock.invocationCallOrder[0])
  })
})
