/**
 * MerchantLead recruitment pipeline API (packet 2026-07-12, OD1; backend
 * src/api/admin/leads/routes.ts). The "front half" of onboarding: capture a
 * prospect, move it through the Lead -> Contacted -> Visit booked lanes, then
 * either Lose it (reason required, audited) or Convert it to a merchant draft.
 *
 * Every route is gated on `lead:manage` server-side (FIELD baseline + the
 * grantable path); convert additionally requires `merchant:create-draft`. The
 * admin-web mirror gates the section/actions on the SAME capabilities (two-layer
 * rule, .claude/rules/admin-web.md); the backend `requireAdminCapability` is the
 * real enforcement.
 *
 *   GET    /api/v1/admin/leads                 -> Lead[] (live lanes by default;
 *                                                 pass includeTerminal=true to
 *                                                 include CONVERTED / LOST). The
 *                                                 stage / source / overdue /
 *                                                 includeTerminal params are
 *                                                 serialised as the LITERAL
 *                                                 strings 'true' / 'false' (the
 *                                                 backend rejects Boolean-coerced
 *                                                 tokens: Boolean('false') is
 *                                                 truthy, so ?overdue=false would
 *                                                 otherwise wrongly mean true).
 *   POST   /api/v1/admin/leads                 -> { lead, duplicateWarning }
 *                                                 (dedupe warns, never blocks).
 *   PATCH  /api/v1/admin/leads/:leadId          -> Lead (field edits and/or a
 *                                                 stage move; LOST needs a reason).
 *   POST   /api/v1/admin/leads/:leadId/convert  -> { draft, leadId, merchantId }
 *                                                 (creates the merchant draft,
 *                                                 stamps the lead).
 *
 * Every response is Zod-validated so contract drift surfaces as a clear error
 * rather than an undefined-field crash. Errors throw `ApiError` from `apiFetch`
 * (LEAD_NOT_FOUND, LEAD_LOST_REASON_REQUIRED, LEAD_STAGE_NOT_DIRECTLY_SETTABLE,
 * LEAD_ALREADY_CONVERTED, LEAD_ANONYMISED, EMAIL_ALREADY_EXISTS on convert).
 */
import { z } from 'zod'
import { apiFetch } from './client'

// ── Shared enums (mirror the backend SOURCE / stage unions) ─────────────────

export const LEAD_SOURCES = [
  'REP_VISIT',
  'INBOUND_ENQUIRY',
  'PHONE',
  'SOCIAL',
  'EMAIL_CAMPAIGN',
  'CUSTOMER_REQUEST',
] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]

// The three live lanes plus the two terminal states. CONVERTED is never set via
// a plain edit (only the convert route reaches it); LOST is set via PATCH.
export const LEAD_STAGES = ['LEAD', 'CONTACTED', 'VISIT_BOOKED', 'CONVERTED', 'LOST'] as const
export type LeadStage = (typeof LEAD_STAGES)[number]

// The PATCH-settable stages: the three lanes plus LOST. CONVERTED is excluded
// (reached only via the convert route).
export const PATCH_STAGES = ['LEAD', 'CONTACTED', 'VISIT_BOOKED', 'LOST'] as const
export type PatchStage = (typeof PATCH_STAGES)[number]

// ── Response schemas ──────────────────────────────────────────────────────────

// Dates are ISO strings over the wire (Prisma Date -> JSON string). `.or(z.string())`
// on the enums keeps a future backend enum addition from hard-failing the parse.
const leadSchema = z.object({
  id: z.string(),
  businessName: z.string(),
  categoryGuess: z.string().nullable(),
  locationHint: z.string().nullable(),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  source: z.enum(LEAD_SOURCES).or(z.string()).nullable(),
  stage: z.enum(LEAD_STAGES).or(z.string()),
  nextAction: z.string().nullable(),
  dueDate: z.string().nullable(),
  assignedRepId: z.string().nullable(),
  lostReason: z.string().nullable(),
  convertedMerchantId: z.string().nullable(),
  lastActivityAt: z.string(),
  anonymisedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Lead = z.infer<typeof leadSchema>

const listLeadsResponseSchema = z.array(leadSchema)

const duplicateWarningSchema = z
  .object({
    count: z.number(),
    sample: z.array(
      z.object({
        id: z.string(),
        businessName: z.string(),
        locationHint: z.string().nullable(),
      })
    ),
  })
  .nullable()
export type DuplicateWarning = z.infer<typeof duplicateWarningSchema>

const createLeadResponseSchema = z.object({
  lead: leadSchema,
  duplicateWarning: duplicateWarningSchema,
})
export type CreateLeadResponse = z.infer<typeof createLeadResponseSchema>

const merchantDraftSchema = z.object({
  merchantId: z.string(),
  ownerAdminId: z.string(),
  ownerEmail: z.string(),
  passwordSetupRequired: z.boolean(),
})

const convertLeadResponseSchema = z.object({
  draft: merchantDraftSchema,
  leadId: z.string(),
  merchantId: z.string(),
})
export type ConvertLeadResponse = z.infer<typeof convertLeadResponseSchema>

// ── Request shapes ────────────────────────────────────────────────────────────

export interface ListLeadsParams {
  stage?: LeadStage
  assignedRepId?: string
  source?: LeadSource
  overdue?: boolean
  includeTerminal?: boolean
}

export interface CreateLeadInput {
  businessName: string
  categoryGuess?: string
  locationHint?: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  source?: LeadSource
  nextAction?: string
  dueDate?: string
  assignedRepId?: string
}

// PATCH body: every field optional. Nullable fields accept null to CLEAR them
// (the backend transforms an empty string to null); a field left undefined is
// untouched. `stage` moves a lane or enters LOST (LOST needs `lostReason`).
export interface UpdateLeadInput {
  businessName?: string
  categoryGuess?: string | null
  locationHint?: string | null
  contactName?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  source?: LeadSource | null
  nextAction?: string | null
  dueDate?: string | null
  assignedRepId?: string | null
  stage?: PatchStage
  lostReason?: string
}

export interface ConvertLeadInput {
  ownerEmail: string
  ownerFirstName: string
  ownerLastName: string
  tradingName?: string
  jobTitle?: string
}

// ── API calls ─────────────────────────────────────────────────────────────────

const PREFIX = '/api/v1/admin/leads'

export const leadsApi = {
  /**
   * List the pipeline. With no params the backend returns the live lanes only
   * (LEAD / CONTACTED / VISIT_BOOKED); pass `includeTerminal: true` for the
   * Converted / Lost view. Booleans are serialised as the LITERAL 'true' /
   * 'false' the backend's `z.enum(['true','false'])` parser expects.
   */
  list: async (params?: ListLeadsParams): Promise<Lead[]> => {
    const qs = new URLSearchParams()
    if (params?.stage !== undefined) qs.set('stage', params.stage)
    if (params?.assignedRepId !== undefined) qs.set('assignedRepId', params.assignedRepId)
    if (params?.source !== undefined) qs.set('source', params.source)
    if (params?.overdue !== undefined) qs.set('overdue', params.overdue ? 'true' : 'false')
    if (params?.includeTerminal !== undefined) {
      qs.set('includeTerminal', params.includeTerminal ? 'true' : 'false')
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    const raw = await apiFetch<unknown>(`${PREFIX}${suffix}`, { auth: true })
    return listLeadsResponseSchema.parse(raw)
  },

  /** Capture a prospect. Returns the created lead + a non-blocking duplicate warning. */
  create: async (input: CreateLeadInput): Promise<CreateLeadResponse> => {
    const raw = await apiFetch<unknown>(PREFIX, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    })
    return createLeadResponseSchema.parse(raw)
  },

  /**
   * Edit fields and/or move stage. Throws ApiError (LEAD_NOT_FOUND,
   * LEAD_LOST_REASON_REQUIRED, LEAD_STAGE_NOT_DIRECTLY_SETTABLE,
   * LEAD_ALREADY_CONVERTED, LEAD_ANONYMISED).
   */
  update: async (leadId: string, input: UpdateLeadInput): Promise<Lead> => {
    const raw = await apiFetch<unknown>(`${PREFIX}/${leadId}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(input),
    })
    return leadSchema.parse(raw)
  },

  /**
   * Convert a lead to a merchant draft. Throws ApiError (LEAD_NOT_FOUND,
   * LEAD_ALREADY_CONVERTED, LEAD_ANONYMISED, EMAIL_ALREADY_EXISTS).
   */
  convert: async (leadId: string, input: ConvertLeadInput): Promise<ConvertLeadResponse> => {
    const raw = await apiFetch<unknown>(`${PREFIX}/${leadId}/convert`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    })
    return convertLeadResponseSchema.parse(raw)
  },
}
