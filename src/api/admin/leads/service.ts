// MerchantLead recruitment pipeline service (packet 2026-07-12, owner-locked
// OD1 grill-me 2026-07-10; plan docs/superpowers/plans/2026-07-12-merchant-lead-packet.md).
//
// The front half of onboarding: capture a prospect, move it through the
// Lead -> Contacted -> Visit booked lanes, then either Lose it (reason required,
// audited) or Convert it to a merchant draft (stamps convertedMerchantId and
// runs the existing createMerchantDraft flow). Every mutation writes an AuditLog
// row inside the same transaction. Contact PII on Lost/stale leads is anonymised
// by the sibling scheduled sweep (src/api/queues/processors/leadAnonymiseSweep.ts);
// this service never deletes.
//
// Route-level gating on `lead:manage` (FIELD baseline + grantable path) is applied
// in routes.ts; these functions assume the caller already passed that gate.

import { PrismaClient, Prisma } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLogTx } from '../../shared/audit'
import {
  createMerchantDraft,
  type CreateMerchantDraftInput,
  type CreateMerchantDraftResult,
} from '../merchants/service'

interface ActorCtx {
  ipAddress: string
  userAgent: string
}

// The three kanban lanes a prospect can sit in. CONVERTED and LOST are terminal
// STATES (not lanes) and are reached only through updateLead (LOST) or
// convertLead (CONVERTED), never set as a plain lane move.
const PIPELINE_LANES = ['LEAD', 'CONTACTED', 'VISIT_BOOKED'] as const
type PipelineLane = (typeof PIPELINE_LANES)[number]

export function isPipelineLane(stage: string): stage is PipelineLane {
  return (PIPELINE_LANES as readonly string[]).includes(stage)
}

// Curated read shape. There is no secret on MerchantLead, but the select is
// explicit so a future sensitive column is never leaked by default.
const LEAD_SELECT = {
  id: true,
  businessName: true,
  categoryGuess: true,
  locationHint: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  source: true,
  stage: true,
  nextAction: true,
  dueDate: true,
  assignedRepId: true,
  lostReason: true,
  convertedMerchantId: true,
  lastActivityAt: true,
  anonymisedAt: true,
  createdAt: true,
  updatedAt: true,
} as const

// Non-PII lead fields eligible to appear as VALUES in a LEAD_UPDATED audit
// diff. Contact PII (contactName / contactEmail / contactPhone) is deliberately
// absent: audit rows OUTLIVE the lead's PII (OD1 anonymisation nulls the contact
// fields at 6 months but the AuditLog row is retained), so a contact VALUE must
// never enter an audit row. The PII field NAMES may still be reported in
// metadata.changedFields (a field name is not a value).
const AUDIT_DIFF_FIELDS = [
  'businessName',
  'categoryGuess',
  'locationHint',
  'source',
  'stage',
  'nextAction',
  'dueDate',
  'assignedRepId',
  'lostReason',
] as const
const PII_FIELDS = ['contactName', 'contactEmail', 'contactPhone'] as const

/** Value equality that treats two equal-instant Dates as equal (the before/after
 *  reads are separate query results, so equal dueDates are distinct instances). */
function sameLeadValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  return a === b
}

export interface LeadListFilters {
  stage?: string
  assignedRepId?: string
  source?: string
  overdue?: boolean
  // Terminal (CONVERTED / LOST) leads are excluded by default so the board shows
  // the live pipeline; set true to include them (the Converted / Lost filters).
  includeTerminal?: boolean
}

/**
 * List leads for the pipeline board, newest activity first. Terminal states are
 * excluded unless includeTerminal is set. `overdue` selects leads whose dueDate
 * is in the past (relative to now), which the board flags red.
 */
export async function listLeads(prisma: PrismaClient, filters: LeadListFilters = {}) {
  const where: Prisma.MerchantLeadWhereInput = {}

  if (filters.stage) {
    where.stage = filters.stage as Prisma.MerchantLeadWhereInput['stage']
  } else if (!filters.includeTerminal) {
    where.stage = { in: [...PIPELINE_LANES] }
  }

  if (filters.assignedRepId) where.assignedRepId = filters.assignedRepId
  if (filters.source) where.source = filters.source as Prisma.MerchantLeadWhereInput['source']
  if (filters.overdue) where.dueDate = { lt: new Date() }

  return prisma.merchantLead.findMany({
    where,
    orderBy: { lastActivityAt: 'desc' },
    select: LEAD_SELECT,
  })
}

export interface CreateLeadInput {
  businessName: string
  categoryGuess?: string
  locationHint?: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  source?: string
  nextAction?: string
  dueDate?: Date
  assignedRepId?: string
}

export interface CreateLeadResult {
  lead: Awaited<ReturnType<typeof listLeads>>[number]
  // Warn-only dedupe (OD1): a similar business name + location does NOT block
  // creation; the caller surfaces this so the operator can decide. Null when no
  // near-duplicate exists.
  duplicateWarning: { count: number; sample: { id: string; businessName: string; locationHint: string | null }[] } | null
}

/**
 * Create a prospect. Warn-only dedupe: if an ACTIVE (non-terminal, non-anonymised)
 * lead shares a case-insensitive businessName and the same locationHint, a
 * warning is returned ALONGSIDE the created lead (never blocks — OD1).
 */
export async function createLead(
  prisma: PrismaClient,
  actorId: string,
  input: CreateLeadInput,
  ctx: ActorCtx,
): Promise<CreateLeadResult> {
  // Dedupe probe runs before the write so the created row cannot match itself.
  const dupes = await prisma.merchantLead.findMany({
    where: {
      businessName: { equals: input.businessName, mode: 'insensitive' },
      locationHint: input.locationHint ?? null,
      stage: { in: [...PIPELINE_LANES] },
      anonymisedAt: null,
    },
    select: { id: true, businessName: true, locationHint: true },
    take: 5,
  })

  const lead = await prisma.$transaction(async (tx) => {
    const created = await tx.merchantLead.create({
      data: {
        businessName: input.businessName,
        categoryGuess: input.categoryGuess ?? null,
        locationHint: input.locationHint ?? null,
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        source: (input.source ?? null) as Prisma.MerchantLeadCreateInput['source'],
        nextAction: input.nextAction ?? null,
        dueDate: input.dueDate ?? null,
        assignedRepId: input.assignedRepId ?? null,
      },
      select: LEAD_SELECT,
    })
    await writeAuditLogTx(tx, {
      entityId: created.id,
      entityType: 'lead',
      event: 'LEAD_CREATED',
      actorId,
      actorType: 'ADMIN',
      after: { businessName: created.businessName, source: created.source, stage: created.stage },
      metadata: { source: created.source },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    return created
  })

  return {
    lead,
    duplicateWarning: dupes.length > 0 ? { count: dupes.length, sample: dupes } : null,
  }
}

export interface UpdateLeadInput {
  businessName?: string
  categoryGuess?: string | null
  locationHint?: string | null
  contactName?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  source?: string | null
  nextAction?: string | null
  dueDate?: Date | null
  assignedRepId?: string | null
  // A lane move (LEAD / CONTACTED / VISIT_BOOKED) or LOST. CONVERTED is rejected
  // here — it is reachable only via convertLead.
  stage?: string
  lostReason?: string
}

/**
 * Edit lead fields and/or move its stage. LOST requires a non-empty lostReason
 * (OD1). CONVERTED cannot be set here. Any successful edit bumps lastActivityAt
 * (the anonymisation clock). Emits LEAD_STAGE_CHANGED / LEAD_LOST when the stage
 * moves, otherwise LEAD_UPDATED with a before/after diff.
 */
export async function updateLead(
  prisma: PrismaClient,
  actorId: string,
  leadId: string,
  input: UpdateLeadInput,
  ctx: ActorCtx,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.merchantLead.findUnique({ where: { id: leadId }, select: LEAD_SELECT })
    if (!existing) throw new AppError('LEAD_NOT_FOUND')
    if (existing.anonymisedAt) throw new AppError('LEAD_ANONYMISED')
    if (existing.convertedMerchantId) throw new AppError('LEAD_ALREADY_CONVERTED')

    const movingStage = input.stage !== undefined && input.stage !== existing.stage
    if (input.stage === 'CONVERTED') throw new AppError('LEAD_STAGE_NOT_DIRECTLY_SETTABLE')

    const goingLost = input.stage === 'LOST'
    const isLostNow = existing.stage === 'LOST'
    // A lead moved OUT of LOST back into a live lane: its Lost reason no longer
    // applies, so it is cleared (F3) and the clearing is noted in the audit diff.
    const revivingFromLost = isLostNow && input.stage !== undefined && isPipelineLane(input.stage)
    // A reason is required to enter LOST; it may arrive in this same call or
    // already be present (re-affirming LOST). Empty/whitespace does not count.
    const effectiveLostReason = input.lostReason ?? existing.lostReason
    if (goingLost && (!effectiveLostReason || effectiveLostReason.trim() === '')) {
      throw new AppError('LEAD_LOST_REASON_REQUIRED')
    }

    const data: Prisma.MerchantLeadUpdateInput = { lastActivityAt: new Date() }
    const assign = <K extends keyof UpdateLeadInput>(k: K) => {
      if (input[k] !== undefined) (data as Record<string, unknown>)[k as string] = input[k]
    }
    assign('businessName'); assign('categoryGuess'); assign('locationHint')
    assign('contactName'); assign('contactEmail'); assign('contactPhone')
    assign('nextAction'); assign('dueDate'); assign('assignedRepId')
    if (input.source !== undefined) {
      data.source = (input.source ?? null) as Prisma.MerchantLeadUpdateInput['source']
    }
    if (input.stage !== undefined) {
      data.stage = input.stage as Prisma.MerchantLeadUpdateInput['stage']
    }
    if (goingLost) {
      data.lostReason = effectiveLostReason
    } else if (revivingFromLost) {
      data.lostReason = null // F3: leaving LOST clears the now-irrelevant reason
    } else if (input.lostReason !== undefined && isLostNow) {
      // F4: a Lost lead that STAYS Lost can have its reason edited; previously
      // this was silently dropped (lostReason only written when entering LOST).
      data.lostReason = input.lostReason
    }

    const updated = await tx.merchantLead.update({ where: { id: leadId }, data, select: LEAD_SELECT })

    if (goingLost) {
      await writeAuditLogTx(tx, {
        entityId: leadId, entityType: 'lead', event: 'LEAD_LOST', actorId, actorType: 'ADMIN',
        before: { stage: existing.stage }, after: { stage: 'LOST' },
        reason: effectiveLostReason ?? undefined, metadata: { lostReason: effectiveLostReason },
        ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
      })
    } else if (movingStage) {
      // Stage move (incl. LOST -> lane revival). lostReason is non-PII, so its
      // clearing is recorded as a value in the diff when it changed.
      const before: Record<string, unknown> = { stage: existing.stage }
      const after: Record<string, unknown> = { stage: updated.stage }
      if (!sameLeadValue(existing.lostReason, updated.lostReason)) {
        before.lostReason = existing.lostReason
        after.lostReason = updated.lostReason
      }
      await writeAuditLogTx(tx, {
        entityId: leadId, entityType: 'lead', event: 'LEAD_STAGE_CHANGED', actorId, actorType: 'ADMIN',
        before, after,
        metadata: { from: existing.stage, to: updated.stage },
        ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
      })
    } else {
      // LEAD_UPDATED: a PII-FREE diff (F1). before/after carry ONLY the non-PII
      // fields that actually changed; metadata.changedFields lists EVERY changed
      // field name (PII names may appear here, values never do; see the
      // AUDIT_DIFF_FIELDS / PII_FIELDS note above, OD1 anonymisation).
      const before: Record<string, unknown> = {}
      const after: Record<string, unknown> = {}
      const changedFields: string[] = []
      for (const key of [...AUDIT_DIFF_FIELDS, ...PII_FIELDS]) {
        const b = (existing as Record<string, unknown>)[key]
        const a = (updated as Record<string, unknown>)[key]
        if (sameLeadValue(b, a)) continue
        changedFields.push(key)
        if (!(PII_FIELDS as readonly string[]).includes(key)) {
          before[key] = b
          after[key] = a
        }
      }
      await writeAuditLogTx(tx, {
        entityId: leadId, entityType: 'lead', event: 'LEAD_UPDATED', actorId, actorType: 'ADMIN',
        before, after, metadata: { changedFields },
        ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
      })
    }
    return updated
  })
}

export interface ConvertLeadInput {
  // The draft owner details. Pre-fillable from the lead in the UI, but supplied
  // and validated fresh at convert time (a lead's single contactName cannot be
  // trusted to split into first/last, and a lead may have no contact email).
  ownerEmail: string
  ownerFirstName: string
  ownerLastName: string
  tradingName?: string
  jobTitle?: string
}

export interface ConvertLeadResult {
  draft: CreateMerchantDraftResult
  leadId: string
  merchantId: string
}

/**
 * Convert a lead to a merchant draft. Draft-first ordering: createMerchantDraft
 * runs (its own atomic transaction, may throw EMAIL_ALREADY_EXISTS) BEFORE the
 * lead is stamped, so a failed draft never leaves a lead falsely marked
 * converted. Once the draft exists, the lead is stamped convertedMerchantId +
 * stage=CONVERTED and LEAD_CONVERTED is audited. Idempotency-guarded: a lead
 * already converted throws.
 */
export async function convertLead(
  prisma: PrismaClient,
  actorId: string,
  leadId: string,
  input: ConvertLeadInput,
  ctx: ActorCtx,
): Promise<ConvertLeadResult> {
  const lead = await prisma.merchantLead.findUnique({ where: { id: leadId }, select: LEAD_SELECT })
  if (!lead) throw new AppError('LEAD_NOT_FOUND')
  if (lead.anonymisedAt) throw new AppError('LEAD_ANONYMISED')
  if (lead.convertedMerchantId) throw new AppError('LEAD_ALREADY_CONVERTED')

  const draftInput: CreateMerchantDraftInput = {
    businessName: lead.businessName,
    tradingName: input.tradingName,
    ownerEmail: input.ownerEmail,
    ownerFirstName: input.ownerFirstName,
    ownerLastName: input.ownerLastName,
    jobTitle: input.jobTitle,
  }
  const draft = await createMerchantDraft(prisma, actorId, draftInput, ctx)

  await prisma.$transaction(async (tx) => {
    // Re-guard inside the transaction: a concurrent convert could have stamped
    // this lead between our read and here. updateMany with the null-guard makes
    // the second writer a no-op rather than double-stamping.
    const stamped = await tx.merchantLead.updateMany({
      where: { id: leadId, convertedMerchantId: null },
      data: { convertedMerchantId: draft.merchantId, stage: 'CONVERTED', lastActivityAt: new Date() },
    })
    if (stamped.count === 0) throw new AppError('LEAD_ALREADY_CONVERTED')
    await writeAuditLogTx(tx, {
      entityId: leadId, entityType: 'lead', event: 'LEAD_CONVERTED', actorId, actorType: 'ADMIN',
      before: { stage: lead.stage }, after: { stage: 'CONVERTED', merchantId: draft.merchantId },
      metadata: { merchantId: draft.merchantId, ownerEmail: input.ownerEmail },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    })
  })

  return { draft, leadId, merchantId: draft.merchantId }
}
