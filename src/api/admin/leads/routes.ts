// MerchantLead recruitment pipeline routes (packet 2026-07-12, OD1).
// Every route is gated on `lead:manage` (FIELD baseline + grantable path). A
// single capability covers read and write for v1 (owner decision 2026-07-12).
// `authenticateAdmin` is applied by the admin plugin scope.

import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { emailSchema } from '../../shared/schemas'
import { requireAdminCapability } from '../capability'
import { listLeads, createLead, updateLead, convertLead } from './service'

const SOURCE = z.enum([
  'REP_VISIT',
  'INBOUND_ENQUIRY',
  'PHONE',
  'SOCIAL',
  'EMAIL_CAMPAIGN',
  'CUSTOMER_REQUEST',
])
// PATCH stage targets: the three lanes plus LOST. CONVERTED is deliberately
// absent (reached only via the convert route).
const PATCH_STAGE = z.enum(['LEAD', 'CONTACTED', 'VISIT_BOOKED', 'LOST'])

const text = (max: number) => z.string().trim().min(1).max(max)
// Nullable free-text edit field: an empty/whitespace-only string carries CLEARING
// intent, so it transforms to null (store null, never a bare "") to match the
// service's null-means-cleared semantics.
const nullableText = (max: number) =>
  z.string().trim().max(max).nullable().transform((v) => (v === '' ? null : v))

export async function adminLeadRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/admin/leads'
  const gate = { preHandler: [requireAdminCapability('lead:manage')] }

  const auditCtx = (req: any) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '' })
  const leadIdParam = (req: any) => z.object({ leadId: z.string().min(1) }).parse(req.params).leadId

  // List the pipeline. Terminal (Converted/Lost) leads excluded unless
  // includeTerminal=true; filter by stage / assignedRep / source / overdue.
  app.get(prefix, gate, async (req: any) => {
    const q = z
      .object({
        stage: z.enum(['LEAD', 'CONTACTED', 'VISIT_BOOKED', 'CONVERTED', 'LOST']).optional(),
        assignedRepId: z.string().min(1).optional(),
        source: SOURCE.optional(),
        // NOT z.coerce.boolean(): query values arrive as strings and
        // Boolean('false') is TRUE, so ?overdue=false / ?includeTerminal=false
        // would wrongly coerce to true. Parse the literal token instead; absent
        // means false (the default board view: live pipeline, all due dates).
        overdue: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
        includeTerminal: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
      })
      .parse(req.query)
    return listLeads(app.prisma, q)
  })

  // Capture a prospect. Returns { lead, duplicateWarning }: dedupe never blocks.
  app.post(prefix, gate, async (req: any, reply) => {
    const body = z
      .object({
        businessName: text(200),
        categoryGuess: text(120).optional(),
        locationHint: text(120).optional(),
        contactName: text(160).optional(),
        contactEmail: emailSchema.optional(),
        contactPhone: text(40).optional(),
        source: SOURCE.optional(),
        nextAction: text(300).optional(),
        dueDate: z.coerce.date().optional(),
        assignedRepId: z.string().min(1).optional(),
      })
      .parse(req.body)
    const result = await createLead(app.prisma, req.user.sub, body, auditCtx(req))
    return reply.status(201).send(result)
  })

  // Edit fields and/or move stage (lane move or LOST). LOST requires lostReason.
  app.patch(`${prefix}/:leadId`, gate, async (req: any) => {
    const body = z
      .object({
        businessName: text(200).optional(),
        categoryGuess: nullableText(120).optional(),
        locationHint: nullableText(120).optional(),
        contactName: nullableText(160).optional(),
        contactEmail: emailSchema.nullable().optional(),
        contactPhone: nullableText(40).optional(),
        source: SOURCE.nullable().optional(),
        nextAction: nullableText(300).optional(),
        dueDate: z.coerce.date().nullable().optional(),
        assignedRepId: z.string().min(1).nullable().optional(),
        stage: PATCH_STAGE.optional(),
        lostReason: text(500).optional(),
      })
      .parse(req.body)
    return updateLead(app.prisma, req.user.sub, leadIdParam(req), body, auditCtx(req))
  })

  // Convert to a merchant draft (creates the draft, stamps the lead). Owner
  // details are supplied fresh (pre-filled from the lead in the UI). Gated on
  // BOTH lead:manage AND merchant:create-draft (defense-in-depth): convert mints
  // a merchant draft, so it demands the same capability as the direct draft
  // route. Today every lead:manage holder also holds merchant:create-draft; this
  // pins that invariant so a future capability split can't silently open a
  // draft-minting side door.
  const convertGate = {
    preHandler: [
      requireAdminCapability('lead:manage'),
      requireAdminCapability('merchant:create-draft'),
    ],
  }
  app.post(`${prefix}/:leadId/convert`, convertGate, async (req: any, reply) => {
    const body = z
      .object({
        ownerEmail: emailSchema,
        ownerFirstName: text(80),
        ownerLastName: text(80),
        tradingName: text(200).optional(),
        jobTitle: text(120).optional(),
      })
      .parse(req.body)
    const result = await convertLead(app.prisma, req.user.sub, leadIdParam(req), body, auditCtx(req))
    return reply.status(201).send(result)
  })
}
