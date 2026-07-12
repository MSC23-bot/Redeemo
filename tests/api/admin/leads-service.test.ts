import { describe, it, expect, vi, beforeEach } from 'vitest'

// MerchantLead recruitment pipeline service (packet 2026-07-12, OD1) with a
// mocked Prisma. createMerchantDraft is mocked so convertLead's draft-first
// ordering is observable without the merchants service. The load-bearing pins:
// LEAD_UPDATED audit rows are PII-FREE (F1); LOST revival clears lostReason and
// a Lost-stays-Lost reason edit is applied (F3/F4); dedupe is warn-only and
// excludes terminal/anonymised leads; convertLead stamps via a null-guarded
// updateMany after the draft exists.

const createMerchantDraft = vi.fn()
vi.mock('../../../src/api/admin/merchants/service', () => ({
  createMerchantDraft: (...a: unknown[]) => createMerchantDraft(...a),
}))

import { createLead, updateLead, convertLead } from '../../../src/api/admin/leads/service'

const ctx = { ipAddress: '127.0.0.1', userAgent: 'test' }
const ACTOR = 'field-1'
const LEAD_ID = 'lead-1'

// A full LEAD_SELECT row (the shape findUnique/update/create return).
function leadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LEAD_ID,
    businessName: 'Bloom Cafe',
    categoryGuess: 'Cafe',
    locationHint: 'SW1',
    contactName: 'Jo Owner',
    contactEmail: 'jo@bloom.test',
    contactPhone: '0700000000',
    source: 'REP_VISIT',
    stage: 'LEAD',
    nextAction: null,
    dueDate: null,
    assignedRepId: null,
    lostReason: null,
    convertedMerchantId: null,
    lastActivityAt: new Date('2026-01-01T00:00:00.000Z'),
    anonymisedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

function makeTx(overrides: Record<string, any> = {}) {
  return {
    merchantLead: {
      findUnique: vi.fn().mockResolvedValue(leadRow()),
      create: vi.fn().mockResolvedValue(leadRow()),
      update: vi.fn().mockResolvedValue(leadRow()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    ...overrides,
  }
}

function makePrisma(tx: any, root: Record<string, any> = {}) {
  return {
    $transaction: vi.fn().mockImplementation(async (cb: any) => cb(tx)),
    merchantLead: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(leadRow()),
      ...(root.merchantLead ?? {}),
    },
    ...root,
  } as any
}

/** The `after` audit payload from the Nth auditLog.create call. */
function auditData(tx: any, call = 0) {
  return tx.auditLog.create.mock.calls[call][0].data
}

beforeEach(() => {
  createMerchantDraft.mockReset()
})

describe('createLead: audit + warn-only dedupe', () => {
  it('creates the lead and writes a LEAD_CREATED audit row inside the tx (no contact PII in the payload)', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    const res = await createLead(prisma, ACTOR, { businessName: 'Bloom Cafe' }, ctx)
    expect(tx.merchantLead.create).toHaveBeenCalledOnce()
    const data = auditData(tx)
    expect(data.event).toBe('LEAD_CREATED')
    expect(data.actorId).toBe(ACTOR)
    // The created-audit payload never carries a contact VALUE.
    const serialized = JSON.stringify(data)
    expect(serialized).not.toContain('jo@bloom.test')
    expect(serialized).not.toContain('Jo Owner')
    expect(serialized).not.toContain('0700000000')
    expect(res.duplicateWarning).toBeNull()
  })

  it('duplicateWarning is populated when an active same-name/location lead exists', async () => {
    const tx = makeTx()
    const dupes = [{ id: 'other', businessName: 'Bloom Cafe', locationHint: 'SW1' }]
    const prisma = makePrisma(tx, { merchantLead: { findMany: vi.fn().mockResolvedValue(dupes) } })
    const res = await createLead(prisma, ACTOR, { businessName: 'Bloom Cafe', locationHint: 'SW1' }, ctx)
    expect(res.duplicateWarning).toEqual({ count: 1, sample: dupes })
    // Still created (warn-only never blocks).
    expect(tx.merchantLead.create).toHaveBeenCalledOnce()
  })

  it('dedupe candidate query EXCLUDES terminal + anonymised leads', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const prisma = makePrisma(makeTx(), { merchantLead: { findMany } })
    await createLead(prisma, ACTOR, { businessName: 'Bloom Cafe', locationHint: 'SW1' }, ctx)
    const where = findMany.mock.calls[0][0].where
    expect(where.anonymisedAt).toBeNull()
    expect(where.stage).toEqual({ in: ['LEAD', 'CONTACTED', 'VISIT_BOOKED'] }) // no CONVERTED/LOST
  })
})

describe('updateLead: guards', () => {
  it('throws LEAD_NOT_FOUND when the lead does not exist', async () => {
    const tx = makeTx({ merchantLead: { findUnique: vi.fn().mockResolvedValue(null) } })
    await expect(updateLead(makePrisma(tx), ACTOR, LEAD_ID, { nextAction: 'call' }, ctx)).rejects.toThrow(
      'LEAD_NOT_FOUND',
    )
  })

  it('throws LEAD_ANONYMISED for an anonymised lead', async () => {
    const tx = makeTx({
      merchantLead: { findUnique: vi.fn().mockResolvedValue(leadRow({ anonymisedAt: new Date() })) },
    })
    await expect(updateLead(makePrisma(tx), ACTOR, LEAD_ID, { nextAction: 'x' }, ctx)).rejects.toThrow(
      'LEAD_ANONYMISED',
    )
  })

  it('throws LEAD_ALREADY_CONVERTED for a converted lead', async () => {
    const tx = makeTx({
      merchantLead: { findUnique: vi.fn().mockResolvedValue(leadRow({ convertedMerchantId: 'm1' })) },
    })
    await expect(updateLead(makePrisma(tx), ACTOR, LEAD_ID, { nextAction: 'x' }, ctx)).rejects.toThrow(
      'LEAD_ALREADY_CONVERTED',
    )
  })

  it('rejects CONVERTED as a direct stage (LEAD_STAGE_NOT_DIRECTLY_SETTABLE)', async () => {
    const tx = makeTx()
    await expect(
      updateLead(makePrisma(tx), ACTOR, LEAD_ID, { stage: 'CONVERTED' }, ctx),
    ).rejects.toThrow('LEAD_STAGE_NOT_DIRECTLY_SETTABLE')
  })

  it('entering LOST without a reason throws LEAD_LOST_REASON_REQUIRED', async () => {
    const tx = makeTx()
    await expect(updateLead(makePrisma(tx), ACTOR, LEAD_ID, { stage: 'LOST' }, ctx)).rejects.toThrow(
      'LEAD_LOST_REASON_REQUIRED',
    )
    // Whitespace-only is also rejected.
    await expect(
      updateLead(makePrisma(makeTx()), ACTOR, LEAD_ID, { stage: 'LOST', lostReason: '   ' }, ctx),
    ).rejects.toThrow('LEAD_LOST_REASON_REQUIRED')
    expect(tx.merchantLead.update).not.toHaveBeenCalled()
  })
})

describe('updateLead: audit events', () => {
  it('entering LOST with a reason emits LEAD_LOST carrying the reason', async () => {
    const tx = makeTx({
      merchantLead: {
        findUnique: vi.fn().mockResolvedValue(leadRow({ stage: 'CONTACTED' })),
        update: vi.fn().mockResolvedValue(leadRow({ stage: 'LOST', lostReason: 'went elsewhere' })),
      },
    })
    await updateLead(makePrisma(tx), ACTOR, LEAD_ID, { stage: 'LOST', lostReason: 'went elsewhere' }, ctx)
    const data = auditData(tx)
    expect(data.event).toBe('LEAD_LOST')
    expect(data.metadata.lostReason).toBe('went elsewhere')
    // lostReason is persisted.
    expect(tx.merchantLead.update.mock.calls[0][0].data.lostReason).toBe('went elsewhere')
  })

  it('a lane move emits LEAD_STAGE_CHANGED with from/to', async () => {
    const tx = makeTx({
      merchantLead: {
        findUnique: vi.fn().mockResolvedValue(leadRow({ stage: 'LEAD' })),
        update: vi.fn().mockResolvedValue(leadRow({ stage: 'CONTACTED' })),
      },
    })
    await updateLead(makePrisma(tx), ACTOR, LEAD_ID, { stage: 'CONTACTED' }, ctx)
    const data = auditData(tx)
    expect(data.event).toBe('LEAD_STAGE_CHANGED')
    expect(data.metadata).toEqual({ from: 'LEAD', to: 'CONTACTED' })
  })

  it('F1: a plain edit emits LEAD_UPDATED whose before/after carry NO contact VALUES; changedFields lists the names', async () => {
    const existing = leadRow({ contactEmail: 'old@x.test', nextAction: 'call Monday' })
    const updated = leadRow({ contactEmail: 'new@x.test', nextAction: 'call Tuesday' })
    const tx = makeTx({
      merchantLead: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    })
    await updateLead(makePrisma(tx), ACTOR, LEAD_ID, { contactEmail: 'new@x.test', nextAction: 'call Tuesday' }, ctx)
    const data = auditData(tx)
    expect(data.event).toBe('LEAD_UPDATED')
    // The PII value never appears anywhere in the audit row.
    const serialized = JSON.stringify(data)
    expect(serialized).not.toContain('old@x.test')
    expect(serialized).not.toContain('new@x.test')
    // before/after hold only the non-PII changed field.
    expect(data.before).toEqual({ nextAction: 'call Monday' })
    expect(data.after).toEqual({ nextAction: 'call Tuesday' })
    expect((data.before as Record<string, unknown>).contactEmail).toBeUndefined()
    // changedFields lists BOTH names (PII name allowed, value not).
    expect(data.metadata.changedFields.sort()).toEqual(['contactEmail', 'nextAction'])
  })

  it('F3: a LOST-to-lane revival clears lostReason and notes it in the stage-changed diff', async () => {
    const tx = makeTx({
      merchantLead: {
        findUnique: vi.fn().mockResolvedValue(leadRow({ stage: 'LOST', lostReason: 'no budget' })),
        update: vi.fn().mockResolvedValue(leadRow({ stage: 'CONTACTED', lostReason: null })),
      },
    })
    await updateLead(makePrisma(tx), ACTOR, LEAD_ID, { stage: 'CONTACTED' }, ctx)
    // lostReason cleared in the persisted data.
    expect(tx.merchantLead.update.mock.calls[0][0].data.lostReason).toBeNull()
    const data = auditData(tx)
    expect(data.event).toBe('LEAD_STAGE_CHANGED')
    expect(data.before).toEqual({ stage: 'LOST', lostReason: 'no budget' })
    expect(data.after).toEqual({ stage: 'CONTACTED', lostReason: null })
  })

  it('F4: a reason edit while the lead STAYS Lost is applied (previously dropped)', async () => {
    const tx = makeTx({
      merchantLead: {
        findUnique: vi.fn().mockResolvedValue(leadRow({ stage: 'LOST', lostReason: 'old reason' })),
        update: vi.fn().mockResolvedValue(leadRow({ stage: 'LOST', lostReason: 'clearer reason' })),
      },
    })
    await updateLead(makePrisma(tx), ACTOR, LEAD_ID, { lostReason: 'clearer reason' }, ctx)
    // The new reason IS written.
    expect(tx.merchantLead.update.mock.calls[0][0].data.lostReason).toBe('clearer reason')
    const data = auditData(tx)
    expect(data.event).toBe('LEAD_UPDATED')
    expect(data.metadata.changedFields).toContain('lostReason')
    expect(data.before).toEqual({ lostReason: 'old reason' })
    expect(data.after).toEqual({ lostReason: 'clearer reason' })
  })

  it('every successful update bumps lastActivityAt (the anonymisation clock)', async () => {
    const tx = makeTx()
    await updateLead(makePrisma(tx), ACTOR, LEAD_ID, { nextAction: 'follow up' }, ctx)
    expect(tx.merchantLead.update.mock.calls[0][0].data.lastActivityAt).toBeInstanceOf(Date)
  })
})

describe('convertLead: draft-first, null-guarded stamp', () => {
  it('creates the draft BEFORE stamping the lead (assert order)', async () => {
    const order: string[] = []
    createMerchantDraft.mockImplementation(async () => {
      order.push('draft')
      return { merchantId: 'm-new' }
    })
    const tx = makeTx({
      merchantLead: { updateMany: vi.fn().mockImplementation(async () => { order.push('stamp'); return { count: 1 } }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    })
    const prisma = makePrisma(tx, { merchantLead: { findUnique: vi.fn().mockResolvedValue(leadRow()) } })
    const res = await convertLead(prisma, ACTOR, LEAD_ID, {
      ownerEmail: 'jo@bloom.test', ownerFirstName: 'Jo', ownerLastName: 'Owner',
    }, ctx)
    expect(order).toEqual(['draft', 'stamp'])
    expect(res.merchantId).toBe('m-new')
  })

  it('stamps via updateMany null-guard; count 0 throws LEAD_ALREADY_CONVERTED', async () => {
    createMerchantDraft.mockResolvedValue({ merchantId: 'm-new' })
    const tx = makeTx({
      merchantLead: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      auditLog: { create: vi.fn() },
    })
    const prisma = makePrisma(tx, { merchantLead: { findUnique: vi.fn().mockResolvedValue(leadRow()) } })
    await expect(
      convertLead(prisma, ACTOR, LEAD_ID, { ownerEmail: 'a@b.test', ownerFirstName: 'A', ownerLastName: 'B' }, ctx),
    ).rejects.toThrow('LEAD_ALREADY_CONVERTED')
    // The null-guard is present on the stamp.
    expect(tx.merchantLead.updateMany.mock.calls[0][0].where).toMatchObject({ id: LEAD_ID, convertedMerchantId: null })
  })

  it('an already-converted lead throws BEFORE any draft is created', async () => {
    const prisma = makePrisma(makeTx(), {
      merchantLead: { findUnique: vi.fn().mockResolvedValue(leadRow({ convertedMerchantId: 'm-old' })) },
    })
    await expect(
      convertLead(prisma, ACTOR, LEAD_ID, { ownerEmail: 'a@b.test', ownerFirstName: 'A', ownerLastName: 'B' }, ctx),
    ).rejects.toThrow('LEAD_ALREADY_CONVERTED')
    expect(createMerchantDraft).not.toHaveBeenCalled()
  })

  it('an anonymised lead refuses conversion (before any draft)', async () => {
    const prisma = makePrisma(makeTx(), {
      merchantLead: { findUnique: vi.fn().mockResolvedValue(leadRow({ anonymisedAt: new Date() })) },
    })
    await expect(
      convertLead(prisma, ACTOR, LEAD_ID, { ownerEmail: 'a@b.test', ownerFirstName: 'A', ownerLastName: 'B' }, ctx),
    ).rejects.toThrow('LEAD_ANONYMISED')
    expect(createMerchantDraft).not.toHaveBeenCalled()
  })

  it('LEAD_CONVERTED audit carries the merchantId', async () => {
    createMerchantDraft.mockResolvedValue({ merchantId: 'm-new' })
    const tx = makeTx({
      merchantLead: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    })
    const prisma = makePrisma(tx, { merchantLead: { findUnique: vi.fn().mockResolvedValue(leadRow()) } })
    await convertLead(prisma, ACTOR, LEAD_ID, { ownerEmail: 'jo@bloom.test', ownerFirstName: 'Jo', ownerLastName: 'Owner' }, ctx)
    const data = auditData(tx)
    expect(data.event).toBe('LEAD_CONVERTED')
    expect(data.metadata.merchantId).toBe('m-new')
  })
})
