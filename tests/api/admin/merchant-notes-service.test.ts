import { describe, it, expect } from 'vitest'

// MerchantNote service (packet 2026-07-13, OD2) with a mocked Prisma. The
// load-bearing pins: add writes note + ADDED event + audit in ONE tx; edit/retract
// enforce own+active (NOT_FOUND / NOT_AUTHOR / NOT_ACTIVE) and reason-required;
// edit records the PRIOR body in the EDITED event and stamps editedAt; retract
// SOFT-deletes (status + retractedBy/At/Reason) and appends RETRACTED with reason;
// audit rows NEVER carry a note body or priorBody value; list is newest-first and
// bounded (take 500). Merchant existence is checked (404 MERCHANT_NOT_FOUND).

import {
  listMerchantNotes,
  addMerchantNote,
  editMerchantNote,
  retractMerchantNote,
} from '../../../src/api/admin/merchants/notes/service'
import { vi } from 'vitest'

const ctx = { ipAddress: '127.0.0.1', userAgent: 'test' }
const ACTOR = 'admin-1'
const MERCHANT_ID = 'm1'
const NOTE_ID = 'note-1'

function noteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTE_ID,
    merchantId: MERCHANT_ID,
    authorAdminId: ACTOR,
    body: 'original body',
    status: 'ACTIVE',
    editedAt: null,
    retractedById: null,
    retractedAt: null,
    retractedReason: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

function noteWithEvents(overrides: Record<string, unknown> = {}) {
  return { ...noteRow(overrides), events: [] }
}

function makeTx(overrides: Record<string, any> = {}) {
  return {
    merchant: { findUnique: vi.fn().mockResolvedValue({ id: MERCHANT_ID }) },
    merchantNote: {
      findFirst: vi.fn().mockResolvedValue(noteRow()),
      findUnique: vi.fn().mockResolvedValue(noteWithEvents()),
      create: vi.fn().mockResolvedValue({ id: NOTE_ID }),
      update: vi.fn().mockResolvedValue(noteRow()),
    },
    merchantNoteEvent: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    ...overrides,
  }
}

function makePrisma(tx: any, root: Record<string, any> = {}) {
  return {
    $transaction: vi.fn().mockImplementation(async (cb: any) => cb(tx)),
    merchant: { findUnique: vi.fn().mockResolvedValue({ id: MERCHANT_ID }), ...(root.merchant ?? {}) },
    merchantNote: { findMany: vi.fn().mockResolvedValue([]), ...(root.merchantNote ?? {}) },
    ...root,
  } as any
}

const auditData = (tx: any, call = 0) => tx.auditLog.create.mock.calls[call][0].data
const eventData = (tx: any, call = 0) => tx.merchantNoteEvent.create.mock.calls[call][0].data

describe('addMerchantNote', () => {
  it('creates note + ADDED event + MERCHANT_NOTE_ADDED audit in ONE tx (no body value in audit)', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await addMerchantNote(prisma, ACTOR, MERCHANT_ID, 'a private note body', ctx)
    expect(prisma.$transaction).toHaveBeenCalledOnce()
    // note created with author + merchant + body
    expect(tx.merchantNote.create.mock.calls[0][0].data).toMatchObject({
      merchantId: MERCHANT_ID, authorAdminId: ACTOR, body: 'a private note body',
    })
    // ADDED event appended
    expect(eventData(tx)).toMatchObject({ noteId: NOTE_ID, action: 'ADDED', actorAdminId: ACTOR })
    // audit row: entity = merchant, event, metadata.noteId; NO body value anywhere
    const data = auditData(tx)
    expect(data.event).toBe('MERCHANT_NOTE_ADDED')
    expect(data.entityType).toBe('merchant')
    expect(data.entityId).toBe(MERCHANT_ID)
    expect(data.actorId).toBe(ACTOR)
    expect(data.metadata).toEqual({ noteId: NOTE_ID })
    expect(JSON.stringify(data)).not.toContain('a private note body')
  })

  it('404 MERCHANT_NOT_FOUND when the merchant does not exist (no note written)', async () => {
    const tx = makeTx({ merchant: { findUnique: vi.fn().mockResolvedValue(null) } })
    await expect(addMerchantNote(makePrisma(tx), ACTOR, MERCHANT_ID, 'x', ctx)).rejects.toThrow('MERCHANT_NOT_FOUND')
    expect(tx.merchantNote.create).not.toHaveBeenCalled()
  })
})

describe('editMerchantNote: guards', () => {
  it('NOTE_NOT_FOUND when the note is absent', async () => {
    const tx = makeTx({
      merchant: { findUnique: vi.fn().mockResolvedValue({ id: MERCHANT_ID }) },
      merchantNote: { findFirst: vi.fn().mockResolvedValue(null) },
    })
    await expect(editMerchantNote(makePrisma(tx), ACTOR, MERCHANT_ID, NOTE_ID, 'new', ctx)).rejects.toThrow('NOTE_NOT_FOUND')
  })

  it('NOTE_NOT_AUTHOR when the actor is not the author (own-only, no override)', async () => {
    const tx = makeTx({
      merchant: { findUnique: vi.fn().mockResolvedValue({ id: MERCHANT_ID }) },
      merchantNote: { findFirst: vi.fn().mockResolvedValue(noteRow({ authorAdminId: 'someone-else' })) },
    })
    await expect(editMerchantNote(makePrisma(tx), ACTOR, MERCHANT_ID, NOTE_ID, 'new', ctx)).rejects.toThrow('NOTE_NOT_AUTHOR')
  })

  it('NOTE_NOT_ACTIVE when the note is already RETRACTED', async () => {
    const tx = makeTx({
      merchant: { findUnique: vi.fn().mockResolvedValue({ id: MERCHANT_ID }) },
      merchantNote: { findFirst: vi.fn().mockResolvedValue(noteRow({ status: 'RETRACTED' })) },
    })
    await expect(editMerchantNote(makePrisma(tx), ACTOR, MERCHANT_ID, NOTE_ID, 'new', ctx)).rejects.toThrow('NOTE_NOT_ACTIVE')
  })
})

describe('editMerchantNote: happy path', () => {
  it('updates body + editedAt, appends EDITED with priorBody, audits (no body value in audit)', async () => {
    const tx = makeTx({
      merchant: { findUnique: vi.fn().mockResolvedValue({ id: MERCHANT_ID }) },
      merchantNote: {
        findFirst: vi.fn().mockResolvedValue(noteRow({ body: 'secret original body' })),
        findUnique: vi.fn().mockResolvedValue(noteWithEvents({ body: 'secret new body', editedAt: new Date() })),
        update: vi.fn().mockResolvedValue(noteRow({ body: 'secret new body' })),
      },
    })
    await editMerchantNote(makePrisma(tx), ACTOR, MERCHANT_ID, NOTE_ID, 'secret new body', ctx)
    // update carried the new body + an editedAt stamp
    const upd = tx.merchantNote.update.mock.calls[0][0].data
    expect(upd.body).toBe('secret new body')
    expect(upd.editedAt).toBeInstanceOf(Date)
    // EDITED event carries the PRIOR body (the version being replaced)
    expect(eventData(tx)).toMatchObject({ noteId: NOTE_ID, action: 'EDITED', actorAdminId: ACTOR, priorBody: 'secret original body' })
    // audit: MERCHANT_NOTE_EDITED, metadata.noteId, and NEITHER the old nor new body value
    const data = auditData(tx)
    expect(data.event).toBe('MERCHANT_NOTE_EDITED')
    expect(data.metadata).toEqual({ noteId: NOTE_ID })
    const serialized = JSON.stringify(data)
    expect(serialized).not.toContain('secret original body')
    expect(serialized).not.toContain('secret new body')
  })
})

describe('retractMerchantNote', () => {
  it('NOTE_RETRACT_REASON_REQUIRED for an empty / whitespace-only reason (nothing mutated)', async () => {
    const tx = makeTx()
    await expect(retractMerchantNote(makePrisma(tx), ACTOR, MERCHANT_ID, NOTE_ID, '   ', ctx)).rejects.toThrow('NOTE_RETRACT_REASON_REQUIRED')
    expect(tx.merchantNote.update).not.toHaveBeenCalled()
  })

  it('NOTE_NOT_AUTHOR when retracting another author\'s note', async () => {
    const tx = makeTx({
      merchant: { findUnique: vi.fn().mockResolvedValue({ id: MERCHANT_ID }) },
      merchantNote: { findFirst: vi.fn().mockResolvedValue(noteRow({ authorAdminId: 'other' })) },
    })
    await expect(retractMerchantNote(makePrisma(tx), ACTOR, MERCHANT_ID, NOTE_ID, 'spam', ctx)).rejects.toThrow('NOTE_NOT_AUTHOR')
  })

  it('NOTE_NOT_ACTIVE when the note is already retracted', async () => {
    const tx = makeTx({
      merchant: { findUnique: vi.fn().mockResolvedValue({ id: MERCHANT_ID }) },
      merchantNote: { findFirst: vi.fn().mockResolvedValue(noteRow({ status: 'RETRACTED' })) },
    })
    await expect(retractMerchantNote(makePrisma(tx), ACTOR, MERCHANT_ID, NOTE_ID, 'again', ctx)).rejects.toThrow('NOTE_NOT_ACTIVE')
  })

  it('soft-deletes (status + retractedBy/At/Reason), appends RETRACTED w/ reason, audits reason (no body value)', async () => {
    const tx = makeTx({
      merchant: { findUnique: vi.fn().mockResolvedValue({ id: MERCHANT_ID }) },
      merchantNote: {
        findFirst: vi.fn().mockResolvedValue(noteRow({ body: 'secret body text' })),
        findUnique: vi.fn().mockResolvedValue(noteWithEvents({ status: 'RETRACTED' })),
        update: vi.fn().mockResolvedValue(noteRow({ status: 'RETRACTED' })),
      },
    })
    await retractMerchantNote(makePrisma(tx), ACTOR, MERCHANT_ID, NOTE_ID, 'duplicate of note 2', ctx)
    // soft-delete fields set; body preserved (never cleared)
    const upd = tx.merchantNote.update.mock.calls[0][0].data
    expect(upd.status).toBe('RETRACTED')
    expect(upd.retractedById).toBe(ACTOR)
    expect(upd.retractedAt).toBeInstanceOf(Date)
    expect(upd.retractedReason).toBe('duplicate of note 2')
    expect(upd.body).toBeUndefined() // body is NOT touched on retract
    // RETRACTED event carries the reason
    expect(eventData(tx)).toMatchObject({ noteId: NOTE_ID, action: 'RETRACTED', actorAdminId: ACTOR, reason: 'duplicate of note 2' })
    // audit: reason in the reason field, metadata.noteId, NO body value
    const data = auditData(tx)
    expect(data.event).toBe('MERCHANT_NOTE_RETRACTED')
    expect(data.reason).toBe('duplicate of note 2')
    expect(data.metadata).toEqual({ noteId: NOTE_ID })
    expect(JSON.stringify(data)).not.toContain('secret body text')
  })
})

describe('listMerchantNotes', () => {
  it('returns notes NEWEST-FIRST, bounded take 500, scoped to the merchant', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const prisma = makePrisma(makeTx(), { merchantNote: { findMany } })
    await listMerchantNotes(prisma, MERCHANT_ID)
    const args = findMany.mock.calls[0][0]
    expect(args.where).toEqual({ merchantId: MERCHANT_ID })
    expect(args.orderBy).toEqual({ createdAt: 'desc' })
    expect(args.take).toBe(500)
  })

  it('404 MERCHANT_NOT_FOUND when the merchant does not exist', async () => {
    const prisma = makePrisma(makeTx(), { merchant: { findUnique: vi.fn().mockResolvedValue(null) } })
    await expect(listMerchantNotes(prisma, MERCHANT_ID)).rejects.toThrow('MERCHANT_NOT_FOUND')
  })
})
