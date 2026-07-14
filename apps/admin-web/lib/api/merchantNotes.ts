/**
 * Internal per-merchant admin notes (Merchant 360 Tab 8, D51; backend packet
 * 2026-07-13, PR #510, owner-locked OD2). Typed wrappers for the note routes:
 *
 *   GET    /api/v1/admin/merchants/:id/notes                 -> list newest-first,
 *                                                               each with its event
 *                                                               history (oldest-first)
 *   POST   /api/v1/admin/merchants/:id/notes                 -> add (body <= 4000), 201
 *   PATCH  /api/v1/admin/merchants/:id/notes/:noteId         -> edit OWN + ACTIVE body
 *   POST   /api/v1/admin/merchants/:id/notes/:noteId/retract -> retract OWN + ACTIVE
 *                                                               (reason required <= 500)
 *
 * Every route is gated server-side on the UNIVERSAL `merchant:notes` capability
 * (held by every admin role; OD2). The admin-web mirror also gates the tab on
 * `can('merchant:notes')` as defence-in-depth (two-layer rule,
 * .claude/rules/admin-web.md); the backend `requireAdminCapability` stays the
 * real enforcement.
 *
 * Errors throw `ApiError` from `apiFetch`, carrying `.code`:
 *   NOTE_NOT_FOUND                (404) note id not found for this merchant
 *   NOTE_NOT_AUTHOR               (403) edit/retract attempted on another admin's note
 *   NOTE_NOT_ACTIVE               (409) edit/retract attempted on a retracted note
 *   NOTE_RETRACT_REASON_REQUIRED  (400) retract with an empty/whitespace reason
 *   MERCHANT_NOT_FOUND            (404) unknown merchant id
 * Human copy for each lives in NamedGateBanner (features/review/NamedGateBanner).
 *
 * Every response is Zod-validated so contract drift surfaces as a clear error
 * rather than an undefined-field crash. The `status` / `action` enum-ish fields
 * use `.or(z.string())` for drift resilience (a new value surfaces as a known
 * string rather than a parse crash), matching the staff/team mirrors. Dates are
 * ISO strings (Fastify JSON-serialises the Prisma `DateTime` columns).
 */
import { z } from 'zod'
import { apiFetch } from './client'

const BODY_MAX = 4000
const REASON_MAX = 500

// ── Response schemas ──────────────────────────────────────────────────────────

export const merchantNoteEventSchema = z.object({
  id: z.string(),
  noteId: z.string(),
  action: z.enum(['ADDED', 'EDITED', 'RETRACTED']).or(z.string()),
  actorAdminId: z.string(),
  // priorBody is deliberately NOT rendered in v1 (see NotesTab); kept in the
  // shape so the contract is honest about what the event carries.
  priorBody: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
})
export type MerchantNoteEvent = z.infer<typeof merchantNoteEventSchema>

export const merchantNoteSchema = z.object({
  id: z.string(),
  merchantId: z.string(),
  authorAdminId: z.string(),
  body: z.string(),
  status: z.enum(['ACTIVE', 'RETRACTED']).or(z.string()),
  editedAt: z.string().nullable(),
  retractedById: z.string().nullable(),
  retractedAt: z.string().nullable(),
  retractedReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  events: z.array(merchantNoteEventSchema),
})
export type MerchantNote = z.infer<typeof merchantNoteSchema>

// The list route returns a bare newest-first array of notes-with-events.
export const merchantNotesResponseSchema = z.array(merchantNoteSchema)
export type MerchantNotesResponse = z.infer<typeof merchantNotesResponseSchema>

// ── API calls ─────────────────────────────────────────────────────────────────

export const BODY_LIMIT = BODY_MAX
export const REASON_LIMIT = REASON_MAX

export const merchantNotesApi = {
  /** List a merchant's notes, newest first, each with its event history. */
  list: async (merchantId: string): Promise<MerchantNotesResponse> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/merchants/${merchantId}/notes`, {
      auth: true,
    })
    return merchantNotesResponseSchema.parse(raw)
  },

  /** Add a note (author = the acting admin). Throws ApiError (MERCHANT_NOT_FOUND). */
  add: async (merchantId: string, body: string): Promise<MerchantNote> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/merchants/${merchantId}/notes`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ body }),
    })
    return merchantNoteSchema.parse(raw)
  },

  /**
   * Edit an OWN + ACTIVE note's body. The prior version is kept in the note's
   * event history server-side. Throws ApiError (NOTE_NOT_FOUND, NOTE_NOT_AUTHOR,
   * NOTE_NOT_ACTIVE).
   */
  edit: async (merchantId: string, noteId: string, body: string): Promise<MerchantNote> => {
    const raw = await apiFetch<unknown>(
      `/api/v1/admin/merchants/${merchantId}/notes/${noteId}`,
      { method: 'PATCH', auth: true, body: JSON.stringify({ body }) }
    )
    return merchantNoteSchema.parse(raw)
  },

  /**
   * Retract (soft-delete) an OWN + ACTIVE note. A non-empty reason is REQUIRED.
   * Throws ApiError (NOTE_NOT_FOUND, NOTE_NOT_AUTHOR, NOTE_NOT_ACTIVE,
   * NOTE_RETRACT_REASON_REQUIRED).
   */
  retract: async (merchantId: string, noteId: string, reason: string): Promise<MerchantNote> => {
    const raw = await apiFetch<unknown>(
      `/api/v1/admin/merchants/${merchantId}/notes/${noteId}/retract`,
      { method: 'POST', auth: true, body: JSON.stringify({ reason }) }
    )
    return merchantNoteSchema.parse(raw)
  },
}
