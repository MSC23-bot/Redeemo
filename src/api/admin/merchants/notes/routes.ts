// MerchantNote routes: internal per-merchant admin notes (packet 2026-07-13, OD2).
// Every route is gated on the UNIVERSAL `merchant:notes` capability (held by every
// admin role; OD2 owner decision). `authenticateAdmin` is applied by the admin
// plugin scope. The merchant-id param is named `:id` (NOT `:merchantId`) to match
// the sibling `/api/v1/admin/merchants/:id/...` routes registered in the same
// Fastify scope: the shared router rejects a differently-named param at the same
// path position, so the note routes REUSE `:id` for the merchant.

import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdminCapability } from '../../capability'
import { listMerchantNotes, addMerchantNote, editMerchantNote, retractMerchantNote } from './service'

// Trimmed non-empty free text with an upper bound (mirrors the leads text()
// helper). A note body is generous; a retract reason is short.
const text = (max: number) => z.string().trim().min(1).max(max)

export async function adminMerchantNoteRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/admin/merchants/:id/notes'
  const gate = { preHandler: [requireAdminCapability('merchant:notes')] }

  const auditCtx = (req: any) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '' })
  const merchantIdParam = (req: any) => z.object({ id: z.string().min(1) }).parse(req.params).id
  const noteIdParam = (req: any) =>
    z.object({ id: z.string().min(1), noteId: z.string().min(1) }).parse(req.params).noteId

  // List a merchant's notes (newest first) each with its event history. 404s an
  // unknown merchant.
  app.get(prefix, gate, async (req: any) => {
    return listMerchantNotes(app.prisma, merchantIdParam(req))
  })

  // Add a note. Body required non-empty. Author = the acting admin. 201.
  app.post(prefix, gate, async (req: any, reply) => {
    const { body } = z.object({ body: text(4000) }).parse(req.body)
    const note = await addMerchantNote(app.prisma, req.user.sub, merchantIdParam(req), body, auditCtx(req))
    return reply.status(201).send(note)
  })

  // Edit an OWN + ACTIVE note's body (guards enforced in the service).
  app.patch(`${prefix}/:noteId`, gate, async (req: any) => {
    const { body } = z.object({ body: text(4000) }).parse(req.body)
    return editMerchantNote(app.prisma, req.user.sub, merchantIdParam(req), noteIdParam(req), body, auditCtx(req))
  })

  // Retract (soft-delete) an OWN + ACTIVE note. Reason required non-empty.
  app.post(`${prefix}/:noteId/retract`, gate, async (req: any) => {
    const { reason } = z.object({ reason: text(500) }).parse(req.body)
    return retractMerchantNote(app.prisma, req.user.sub, merchantIdParam(req), noteIdParam(req), reason, auditCtx(req))
  })
}
