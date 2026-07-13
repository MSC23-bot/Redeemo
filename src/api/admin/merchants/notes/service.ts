// MerchantNote service: internal per-merchant admin notes (packet 2026-07-13,
// owner-locked OD2 grill-me 2026-07-10; plan
// docs/superpowers/plans/2026-07-13-merchant-note-packet.md; D51 Merchant 360 Tab 8).
//
// Internal notes admins leave on a merchant. Add is open to any note author; edit
// and retract are OWN + ACTIVE only (the acting admin must be the author). v1 has
// NO moderation override: not even a SUPER_ADMIN edits or retracts another
// author's note (spec own-only; revisit if abuse appears). Retract is a SOFT
// delete (status RETRACTED + retractedBy/At/Reason, body preserved); nothing is
// ever hard-deleted. Every mutation appends a MerchantNoteEvent (ADDED /
// EDITED-with-priorBody / RETRACTED-with-reason) AND an AuditLog row, both inside
// the SAME transaction as the note write. Note BODY values NEVER enter an audit
// row (bodies + prior versions live in MerchantNoteEvent; the lead-packet
// discipline: content does not enter audit rows).
//
// Route-level gating on the universal `merchant:notes` capability is applied in
// routes.ts; these functions assume the caller already passed that gate.

import { PrismaClient } from '../../../../../generated/prisma/client'
import { AppError } from '../../../shared/errors'
import { writeAuditLogTx } from '../../../shared/audit'

interface ActorCtx {
  ipAddress: string
  userAgent: string
}

// Curated read shape for a note (no author/actor PII beyond the admin id). Explicit
// so a future sensitive column is never leaked by default.
const NOTE_SELECT = {
  id: true,
  merchantId: true,
  authorAdminId: true,
  body: true,
  status: true,
  editedAt: true,
  retractedById: true,
  retractedAt: true,
  retractedReason: true,
  createdAt: true,
  updatedAt: true,
} as const

const EVENT_SELECT = {
  id: true,
  noteId: true,
  action: true,
  actorAdminId: true,
  priorBody: true,
  reason: true,
  createdAt: true,
} as const

// A note plus its chronological (oldest-first) history. The events read is bounded
// implicitly by the per-note history size (a note accrues one event per action).
const NOTE_WITH_EVENTS_SELECT = {
  ...NOTE_SELECT,
  events: { select: EVENT_SELECT, orderBy: { createdAt: 'asc' } },
} as const

// Structural tx client shape (the real Prisma tx client, or a mock, satisfies it).
type TxClient = {
  merchant: { findUnique: (args: any) => Promise<any> }
  merchantNote: {
    findFirst: (args: any) => Promise<any>
    findUnique: (args: any) => Promise<any>
    create: (args: any) => Promise<any>
    update: (args: any) => Promise<any>
  }
  merchantNoteEvent: { create: (args: any) => Promise<any> }
  auditLog: { create: (args: any) => Promise<any> }
}

/** 404 MERCHANT_NOT_FOUND if the merchant does not exist. Reused by every note
 *  operation (the merchantId FK is RESTRICT, so a bad id would otherwise surface
 *  as a raw FK violation on insert). */
async function assertMerchantExists(
  client: { merchant: { findUnique: (args: any) => Promise<any> } },
  merchantId: string,
): Promise<void> {
  const merchant = await client.merchant.findUnique({ where: { id: merchantId }, select: { id: true } })
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')
}

/**
 * List a merchant's notes, NEWEST FIRST, each with its chronological event
 * history. Bounded (take 500, mirroring the leads v1 board bound) so a large note
 * history cannot return an unbounded row set; add pagination when history grows.
 */
export async function listMerchantNotes(prisma: PrismaClient, merchantId: string) {
  await assertMerchantExists(prisma, merchantId)
  return prisma.merchantNote.findMany({
    where: { merchantId },
    orderBy: { createdAt: 'desc' },
    select: NOTE_WITH_EVENTS_SELECT,
    take: 500,
  })
}

/**
 * Add a note. In ONE transaction: create the note (ACTIVE), append its ADDED
 * event, and write the MERCHANT_NOTE_ADDED audit row (entityId = merchantId,
 * metadata { noteId }, NO body value). Returns the note with its (single) event.
 */
export async function addMerchantNote(
  prisma: PrismaClient,
  actorId: string,
  merchantId: string,
  body: string,
  ctx: ActorCtx,
) {
  return prisma.$transaction(async (tx: TxClient) => {
    await assertMerchantExists(tx, merchantId)
    const note = await tx.merchantNote.create({
      data: { merchantId, authorAdminId: actorId, body },
      select: { id: true },
    })
    await tx.merchantNoteEvent.create({
      data: { noteId: note.id, action: 'ADDED', actorAdminId: actorId },
    })
    await writeAuditLogTx(tx, {
      entityId: merchantId,
      entityType: 'merchant',
      event: 'MERCHANT_NOTE_ADDED',
      actorId,
      actorType: 'ADMIN',
      metadata: { noteId: note.id },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    return tx.merchantNote.findUnique({ where: { id: note.id }, select: NOTE_WITH_EVENTS_SELECT })
  })
}

/** Load an ACTIVE note the actor authored, applying the own+active guards.
 *  Throws NOTE_NOT_FOUND / NOTE_NOT_AUTHOR / NOTE_NOT_ACTIVE. Author is checked
 *  before state, so a cross-author access is always NOTE_NOT_AUTHOR regardless of
 *  the note's state (own-only is the primary ownership boundary; v1 has no
 *  moderation override). */
async function loadOwnActiveNote(tx: TxClient, actorId: string, merchantId: string, noteId: string) {
  const note = await tx.merchantNote.findFirst({ where: { id: noteId, merchantId }, select: NOTE_SELECT })
  if (!note) throw new AppError('NOTE_NOT_FOUND')
  if (note.authorAdminId !== actorId) throw new AppError('NOTE_NOT_AUTHOR')
  if (note.status !== 'ACTIVE') throw new AppError('NOTE_NOT_ACTIVE')
  return note
}

/**
 * Edit an OWN + ACTIVE note's body. In ONE transaction: guard, update body +
 * stamp editedAt, append an EDITED event carrying the PRIOR body (the version
 * being replaced), and write the MERCHANT_NOTE_EDITED audit row (NO body value).
 * Returns the note with its full event history.
 */
export async function editMerchantNote(
  prisma: PrismaClient,
  actorId: string,
  merchantId: string,
  noteId: string,
  body: string,
  ctx: ActorCtx,
) {
  return prisma.$transaction(async (tx: TxClient) => {
    await assertMerchantExists(tx, merchantId)
    const existing = await loadOwnActiveNote(tx, actorId, merchantId, noteId)
    await tx.merchantNote.update({
      where: { id: noteId },
      data: { body, editedAt: new Date() },
    })
    await tx.merchantNoteEvent.create({
      data: { noteId, action: 'EDITED', actorAdminId: actorId, priorBody: existing.body },
    })
    await writeAuditLogTx(tx, {
      entityId: merchantId,
      entityType: 'merchant',
      event: 'MERCHANT_NOTE_EDITED',
      actorId,
      actorType: 'ADMIN',
      metadata: { noteId },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    return tx.merchantNote.findUnique({ where: { id: noteId }, select: NOTE_WITH_EVENTS_SELECT })
  })
}

/**
 * Retract (SOFT-delete) an OWN + ACTIVE note. A non-empty reason is REQUIRED. In
 * ONE transaction: guard, set status RETRACTED + retractedBy/At/Reason (body
 * preserved), append a RETRACTED event carrying the reason, and write the
 * MERCHANT_NOTE_RETRACTED audit row (reason in the audit `reason` field; NO body
 * value). Returns the note with its full event history.
 */
export async function retractMerchantNote(
  prisma: PrismaClient,
  actorId: string,
  merchantId: string,
  noteId: string,
  reason: string,
  ctx: ActorCtx,
) {
  return prisma.$transaction(async (tx: TxClient) => {
    await assertMerchantExists(tx, merchantId)
    await loadOwnActiveNote(tx, actorId, merchantId, noteId)
    // Defence-in-depth (the route Zod also requires a non-empty reason): an
    // empty/whitespace-only reason never soft-deletes a note.
    if (!reason || reason.trim() === '') throw new AppError('NOTE_RETRACT_REASON_REQUIRED')
    await tx.merchantNote.update({
      where: { id: noteId },
      data: {
        status: 'RETRACTED',
        retractedById: actorId,
        retractedAt: new Date(),
        retractedReason: reason,
      },
    })
    await tx.merchantNoteEvent.create({
      data: { noteId, action: 'RETRACTED', actorAdminId: actorId, reason },
    })
    await writeAuditLogTx(tx, {
      entityId: merchantId,
      entityType: 'merchant',
      event: 'MERCHANT_NOTE_RETRACTED',
      actorId,
      actorType: 'ADMIN',
      reason,
      metadata: { noteId },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    return tx.merchantNote.findUnique({ where: { id: noteId }, select: NOTE_WITH_EVENTS_SELECT })
  })
}
