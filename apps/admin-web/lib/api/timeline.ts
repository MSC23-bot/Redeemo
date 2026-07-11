/**
 * Admin merchant-timeline API.
 *
 * Typed wrapper for the read-only merchant timeline endpoint:
 *
 *   GET /api/v1/admin/merchants/:id/timeline
 *     -> merchant lifecycle state + a merged, newest-first feed of merchant
 *        AuditLog actions interleaved with the OWNER's lifecycle emails.
 *
 * The backend already merges + sorts the items newest-first by `at` and strips
 * every sensitive field (payload, branch-PIN emails, recipient routing). Email
 * rows carry only id/type/subject/status/channel/at; the frontend maps the raw
 * `event` (action) and `type` (email) strings to friendly labels.
 *
 * Every response is validated with Zod so contract drift surfaces as a clear
 * error rather than an undefined-field crash.
 */
import { z } from 'zod'
import { apiFetch } from './client'

// ── Response schemas ──────────────────────────────────────────────────────────

export const communicationStatusSchema = z.enum(['QUEUED', 'SENT', 'FAILED', 'BOUNCED'])
export const communicationChannelSchema = z.enum(['EMAIL', 'SMS', 'PUSH'])

export const timelineActionSchema = z.object({
  kind: z.literal('action'),
  id: z.string(),
  at: z.string(),
  event: z.string(),
  actorType: z.string().nullable(),
  actorName: z.string().nullable(),
  reason: z.string().nullable(),
  // Team & Roles S4 (spec §5.3): true only on a MERCHANT_GO_LIVE row that was
  // a self-approval. Optional (not `.default()`) so existing fixtures/tests
  // that predate this field keep parsing unchanged; the backend always sends
  // a concrete boolean on every action item.
  selfOnboarded: z.boolean().optional(),
})

export const timelineEmailSchema = z.object({
  kind: z.literal('email'),
  id: z.string(),
  at: z.string(),
  type: z.string(),
  subject: z.string().nullable(),
  status: communicationStatusSchema,
  channel: communicationChannelSchema,
})

export const timelineItemSchema = z.discriminatedUnion('kind', [
  timelineActionSchema,
  timelineEmailSchema,
])

export const timelineStateSchema = z.object({
  status: z.string(),
  onboardingStep: z.string().nullable(),
  verificationStatus: z.string(),
})

export const merchantTimelineSchema = z.object({
  items: z.array(timelineItemSchema),
  state: timelineStateSchema.nullable(),
  emailsResolvedViaOwner: z.boolean(),
})

export type CommunicationStatusValue = z.infer<typeof communicationStatusSchema>
export type CommunicationChannelValue = z.infer<typeof communicationChannelSchema>
export type TimelineActionItem = z.infer<typeof timelineActionSchema>
export type TimelineEmailItem = z.infer<typeof timelineEmailSchema>
export type TimelineItem = z.infer<typeof timelineItemSchema>
export type MerchantTimeline = z.infer<typeof merchantTimelineSchema>

// ── API calls ─────────────────────────────────────────────────────────────────

export const timelineApi = {
  /** Fetch the read-only communication + activity timeline for one merchant. */
  get: async (merchantId: string): Promise<MerchantTimeline> => {
    const raw = await apiFetch<unknown>(
      `/api/v1/admin/merchants/${merchantId}/timeline`,
      { auth: true }
    )
    return merchantTimelineSchema.parse(raw)
  },
}
