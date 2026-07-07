import { z } from 'zod'
import { apiFetch } from './client'
import type { HoursPayloadRow } from '@/components/onboarding/branch/lib/hoursModel'

// M2 F4: the branch-step API client. Calls the REAL merged backend
// (src/api/merchant/branch/* + the OPEN customer amenities endpoint). Direct
// browser->backend authed calls (Bearer access token) for the merchant routes;
// the amenity catalog read hits the customer no-auth endpoint (the merchant portal
// cannot present a customer JWT, and the route is no-auth by design).

// --- Branch read shape (list / get) -----------------------------------------
// We .passthrough() the row and pick only the fields the F4 prefill needs. The
// branch GET include carries openingHours / amenities / photos.
const branchOpeningHoursSchema = z
  .object({
    dayOfWeek: z.number(),
    openTime: z.string().nullable().optional(),
    closeTime: z.string().nullable().optional(),
    isClosed: z.boolean(),
  })
  .passthrough()

const branchAmenityLinkSchema = z
  .object({
    // iconUrl mirrors the catalogue Amenity shape (amenitySchema, further down):
    // the backend's branch include (`amenities: { include: { amenity: true } }`)
    // already ships the full Amenity row, so this was already on the wire - the
    // fidelity-polish per-amenity icon just adds a typed reader for it.
    amenity: z
      .object({ id: z.string(), name: z.string(), iconUrl: z.string().nullable().optional() })
      .passthrough(),
  })
  .passthrough()

// Branches PR-3 §7 / D-PR3-7: the photo moderation state. APPROVED is the SOLE
// customer-visible state (and the only one the merchant can instant-remove);
// PENDING / FLAGGED rows are not public. .passthrough() preserves any future key.
export const photoModerationStatusSchema = z.enum(['PENDING', 'APPROVED', 'FLAGGED'])

const branchPhotoSchema = z
  .object({
    id: z.string(),
    url: z.string(),
    // PR-3: drives the real per-photo render (was blanket-"Approved" in PR-1). REQUIRED
    // because the backend GUARANTEES it: BranchPhoto.moderationStatus is non-nullable
    // (Prisma @default(PENDING)) and GET /branches/:id ships the whole row via
    // `photos: true`, so every photo column (incl. moderationStatus) is always present.
    // Requiring it tightens the merchant-web contract so a PENDING/FLAGGED row can never
    // be mistaken for a live/approved one (P3 hardening).
    moderationStatus: photoModerationStatusSchema,
  })
  .passthrough()

// --- Pending edit (sensitive identity / photo review lane) -------------------
// PR-1 F1: mirrors the backend BranchPendingEdit model + the PendingEditStatus
// enum. The list + detail BRANCH_INCLUDE ships PENDING-only rows under
// `pendingEdits`; the edit-request[s] routes return the full row(s).
export const pendingEditStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'])

// proposedChanges is a partial bag of the branch SENSITIVE_FIELDS, plus the
// add/remove arrays used by includesPhotos (photo) edits. .passthrough() so any
// future server key does not break the parse.
const proposedChangesSchema = z
  .object({
    name: z.string().optional(),
    about: z.string().optional(),
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    city: z.string().optional(),
    postcode: z.string().optional(),
    logoUrl: z.string().optional(),
    bannerUrl: z.string().optional(),
    // Same Decimal-as-string coercion as branchSchema (a pending edit can carry
    // resolved coordinates serialized as strings).
    latitude: z.coerce.number().optional(),
    longitude: z.coerce.number().optional(),
    add: z.array(z.string()).optional(),
    remove: z.array(z.string()).optional(),
  })
  .passthrough()

export const branchPendingEditSchema = z
  .object({
    id: z.string(),
    branchId: z.string(),
    merchantId: z.string(),
    proposedChanges: proposedChangesSchema,
    includesPhotos: z.boolean(),
    status: pendingEditStatusSchema,
    reviewedBy: z.string().nullish(),
    reviewNote: z.string().nullish(),
    createdAt: z.string(),
    reviewedAt: z.string().nullish(),
  })
  .passthrough()

export type BranchPendingEdit = z.infer<typeof branchPendingEditSchema>

// --- Pending opening-hours (PR-4 cool-off staging) --------------------------
// Branches PR-4 (§3 / §6-data): the durable BranchOpeningHoursPending row that
// stages an hours change for the 2-hour customer cool-off. getBranch / listBranches
// surface AT MOST ONE PENDING row per branch (the backend `take:1` over the partial
// unique). proposedHours is the SAME single-window weekly payload the live hours use
// (Array<{ dayOfWeek, openTime?, closeTime?, isClosed }>), and effectiveAt is the
// go-live time (= stage time + 2h, serialized as an ISO string). status is always
// PENDING on this payload (PROMOTED / CANCELLED rows are not exposed). The merchant
// keeps seeing the LIVE openingHours table until promotion; this drives the
// "goes live at" banner. .passthrough() so any future server key does not break parse.
export const pendingHoursStatusSchema = z.enum(['PENDING', 'PROMOTED', 'CANCELLED'])

export const branchPendingHoursSchema = z
  .object({
    id: z.string(),
    proposedHours: z.array(branchOpeningHoursSchema),
    effectiveAt: z.string(),
    status: pendingHoursStatusSchema,
  })
  .passthrough()

export type BranchPendingHours = z.infer<typeof branchPendingHoursSchema>

// Branches PR-5 (§3a): the branch lifecycle axis (status-on-Branch staging). It is
// SEPARATE from isActive (the reversible suspend toggle) and deletedAt (permanent
// soft-delete). PENDING_CREATE = a subsequent branch awaiting admin create approval
// (customer-INVISIBLE, drives the awaiting-approval banner + Cancel); LIVE = a normal
// branch; PENDING_CLOSE = a close-requested branch still live until approval (drives
// the pending-close banner + Withdraw); CLOSED = close approved + soft-deleted
// (terminal, excluded from the live list). The backend defaults LIVE so older rows /
// list payloads without the field still parse, hence .nullish().
export const branchLifecycleStatusSchema = z.enum([
  'PENDING_CREATE',
  'LIVE',
  'PENDING_CLOSE',
  'CLOSED',
])

export type BranchLifecycleStatus = z.infer<typeof branchLifecycleStatusSchema>

export const branchSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    isMainBranch: z.boolean().optional(),
    // Wire hygiene (#377): the server-derived PIN set/not-set boolean. Optional
    // because an OLDER backend (pre-#377) omits it during deploy skew; consumers
    // go through the shared branchPinSet bridge (lib/branches/pinSet.ts), never
    // the legacy ciphertext field directly.
    redemptionPinSet: z.boolean().optional(),
    // D-BM1: the per-branch management capability hint (GET /branches/:id only;
    // absent on list rows and on older backends). NON-THROWING malformed-to-absent
    // contract: .catch(undefined) resolves any malformed-present block to absent
    // instead of failing the whole parse. Consumers NEVER read this raw - they go
    // through effectiveCanManage (lib/branches/capability.ts).
    viewerCapabilities: z.object({ canManage: z.boolean() }).optional().catch(undefined),
    // PR-5: the lifecycle axis (see branchLifecycleStatusSchema). getBranch /
    // listBranches now ship it; .nullish() keeps an older payload parsing cleanly.
    lifecycleStatus: branchLifecycleStatusSchema.nullish(),
    // PR-5: the merchant-supplied close reason, set on a close REQUEST (audit-only,
    // surfaced to the admin reviewer). Null/absent unless lifecycleStatus PENDING_CLOSE.
    closeReason: z.string().nullish(),
    addressLine1: z.string().nullish(),
    addressLine2: z.string().nullish(),
    city: z.string().nullish(),
    postcode: z.string().nullish(),
    phone: z.string().nullish(),
    email: z.string().nullish(),
    websiteUrl: z.string().nullish(),
    about: z.string().nullish(),
    logoUrl: z.string().nullish(),
    bannerUrl: z.string().nullish(),
    locationConfidence: z
      .enum(['MANUALLY_CONFIRMED', 'ADDRESS_GEOCODED', 'POSTCODE_CENTROID', 'NEEDS_REVIEW'])
      .nullish(),
    isActive: z.boolean().optional(),
    // Branches PR-7 (§3 / §6): the per-branch redemption-alerts opt-in (default false).
    // When ON, an in-store validation fans out an IN_APP VOUCHER_REDEEMED bell to the
    // merchant's active owner(s) + the branch's scope-covering Branch Managers (email
    // dark). getBranch / listBranches ship the column via the BRANCH_INCLUDE; .nullish()
    // keeps an older payload (pre-PR-7 backend) parsing cleanly.
    redemptionAlertsEnabled: z.boolean().nullish(),
    // latitude/longitude arrive as Prisma Decimal => JSON STRINGS on the wire
    // (e.g. "53.646307"). A plain z.number() REJECTS the string, so the moment a
    // postcode resolves to coordinates (every real UK address) the parse throws and
    // breaks createBranch (POST 201 -> "could not save" + orphan branch on retry),
    // listBranches ("could not load your branches"), and the onboarding prefill.
    // z.coerce.number() accepts the string; .nullish() still short-circuits null.
    latitude: z.coerce.number().nullish(),
    longitude: z.coerce.number().nullish(),
    openingHours: z.array(branchOpeningHoursSchema).optional(),
    amenities: z.array(branchAmenityLinkSchema).optional(),
    photos: z.array(branchPhotoSchema).optional(),
    pendingEdits: z.array(branchPendingEditSchema).optional(), // PENDING-only on list + detail
    // PR-4: the current staged opening-hours cool-off change. Backend `take:1` over
    // the partial unique, so this is an array of 0..1 PENDING rows. Optional so a
    // payload without it (older backend / list rows) still parses cleanly.
    pendingHours: z.array(branchPendingHoursSchema).optional(),
  })
  .passthrough()

export type Branch = z.infer<typeof branchSchema>

export async function listBranches(): Promise<Branch[]> {
  const rows = await apiFetch('/api/v1/merchant/branches', { method: 'GET', auth: true })
  return z.array(branchSchema).parse(rows)
}

// GET /api/v1/merchant/branches/:id (scoped via assertBranchAllowed): single
// branch, same shape as the list rows. Used by the detail page so deep-links /
// refresh resolve without depending on the list cache. 404 BRANCH_NOT_FOUND.
export async function getBranch(branchId: string): Promise<Branch> {
  const branch = await apiFetch(`/api/v1/merchant/branches/${branchId}`, {
    method: 'GET',
    auth: true,
  })
  return branchSchema.parse(branch)
}

// --- Create -----------------------------------------------------------------
// POST /api/v1/merchant/branches. The backend resolves location from the postcode
// itself (caller lat/lng are dropped), so F4 sends only the address + contact +
// banner + about. Only filled keys are sent; the backend requires name + address.
export interface BranchCreateBody {
  name: string
  addressLine1: string
  addressLine2?: string
  city: string
  postcode: string
  phone?: string
  email?: string
  websiteUrl?: string
  bannerUrl?: string
  about?: string
  // Branches PR-6 (§4b): the OPTIONAL opaque token from a Google location pick. The
  // backend resolves it server-side to the suggested coords + placeId (admin-review
  // metadata only); it NEVER carries lat/lng. Omitted when the merchant typed the
  // address manually, or when the token expired (the address still saves without it).
  candidateToken?: string
}

export async function createBranch(body: BranchCreateBody): Promise<Branch> {
  const branch = await apiFetch('/api/v1/merchant/branches', {
    method: 'POST',
    auth: true,
    body: JSON.stringify(body),
  })
  return branchSchema.parse(branch)
}

// --- Lifecycle: cancel a pending create -------------------------------------
// DELETE /api/v1/merchant/branches/:id/pending-create (Branches PR-5 §4a). OWNER-only
// on the backend. Hard-deletes the never-live PENDING_CREATE branch row + withdraws
// its BRANCH_CREATE approval (the branch never went live, so a hard cleanup is safe).
// Returns { ok: true }. 404 BRANCH_NOT_FOUND / 409 BRANCH_NOT_PENDING_CREATE.
export async function cancelPendingCreate(branchId: string): Promise<{ ok: true }> {
  await apiFetch(`/api/v1/merchant/branches/${branchId}/pending-create`, {
    method: 'DELETE',
    auth: true,
  })
  return { ok: true }
}

// --- Lifecycle: request to close a branch -----------------------------------
// POST /api/v1/merchant/branches/:id/close-request, body { reason } (Branches PR-5
// §4b). OWNER-only. The backend enforces BRANCH_IS_MAIN (cannot close the main branch)
// + BRANCH_LAST_ACTIVE (cannot close the last active branch) AT REQUEST TIME, sets
// lifecycleStatus PENDING_CLOSE + closeReason, and creates a BRANCH_CLOSE approval. The
// branch STAYS live + customer-visible until an admin approves. Returns the updated
// branch (lifecycleStatus PENDING_CLOSE). 409 BRANCH_CLOSE_REQUEST_EXISTS when one is
// already open.
export async function requestBranchClose(branchId: string, reason: string): Promise<Branch> {
  const branch = await apiFetch(`/api/v1/merchant/branches/${branchId}/close-request`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ reason }),
  })
  return branchSchema.parse(branch)
}

// --- Lifecycle: withdraw a pending close ------------------------------------
// DELETE /api/v1/merchant/branches/:id/close-request (Branches PR-5 §4b). OWNER-only.
// Reverts lifecycleStatus -> LIVE + clears closeReason + removes the BRANCH_CLOSE
// approval. The branch was live throughout. Returns the updated branch (LIVE). 404
// BRANCH_CLOSE_REQUEST_NOT_FOUND when there is no open close request.
export async function withdrawBranchClose(branchId: string): Promise<Branch> {
  const branch = await apiFetch(`/api/v1/merchant/branches/${branchId}/close-request`, {
    method: 'DELETE',
    auth: true,
  })
  return branchSchema.parse(branch)
}

// --- Update -----------------------------------------------------------------
// PATCH /api/v1/merchant/branches/:id. Persists the editable branch DETAIL fields
// on an EXISTING (reused) branch so onboarding edits are not silently dropped. The
// backend writes phone/email/websiteUrl directly, and the sensitive identity fields
// (name/about/address/banner) directly too while the application is in the draft
// window (a postcode change re-resolves lat/lng server-side). Only the provided keys
// are sent. Returns the updated branch.
export interface BranchUpdateBody {
  name?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  postcode?: string
  phone?: string
  email?: string
  websiteUrl?: string
  bannerUrl?: string
  about?: string
  /** PR-1 F8: set this branch as the merchant's main branch (atomic single-main). */
  isMainBranch?: boolean
  // Branches PR-6 (§4b): the OPTIONAL Google-pick token (see BranchCreateBody). Used
  // on the draft-window direct sensitive-edit path; resolved to admin-review metadata
  // server-side. NEVER lat/lng.
  candidateToken?: string
}

export async function updateBranch(branchId: string, body: BranchUpdateBody): Promise<Branch> {
  const branch = await apiFetch(`/api/v1/merchant/branches/${branchId}`, {
    method: 'PATCH',
    auth: true,
    body: JSON.stringify(body),
  })
  return branchSchema.parse(branch)
}

// --- Reviewed identity edits (sensitive fields) -----------------------------
// For a LIVE merchant, sensitive identity fields route through the edit-request
// lane (admin review) rather than a direct PATCH. The body is the SENSITIVE
// subset; the backend resolves location from postcode (do NOT send lat/lng).
export interface BranchEditRequestBody {
  name?: string
  about?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  postcode?: string
  logoUrl?: string
  bannerUrl?: string
  // Branches PR-6 (§4b): the OPTIONAL Google-pick token (see BranchCreateBody). On a
  // LIVE branch the address change rides the reviewed edit lane; the backend resolves
  // the token to admin-review metadata staged in the BranchPendingEdit. NEVER lat/lng.
  candidateToken?: string
}

// POST /api/v1/merchant/branches/:id/edit-request → BranchPendingEdit.
// 409 PENDING_EDIT_EXISTS when one is already in review.
export async function createBranchEditRequest(
  branchId: string,
  changes: BranchEditRequestBody,
): Promise<BranchPendingEdit> {
  const pendingEdit = await apiFetch(`/api/v1/merchant/branches/${branchId}/edit-request`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify(changes),
  })
  return branchPendingEditSchema.parse(pendingEdit)
}

// GET /api/v1/merchant/branches/:id/edit-requests → ALL statuses; the caller
// filters status === 'PENDING'.
export async function listBranchEditRequests(branchId: string): Promise<BranchPendingEdit[]> {
  const list = await apiFetch(`/api/v1/merchant/branches/${branchId}/edit-requests`, {
    method: 'GET',
    auth: true,
  })
  return z.array(branchPendingEditSchema).parse(list)
}

// DELETE /api/v1/merchant/branches/:id/edit-requests/:editId → withdraws (status
// WITHDRAWN). 404 PENDING_EDIT_NOT_FOUND.
export async function withdrawBranchEditRequest(
  branchId: string,
  editId: string,
): Promise<BranchPendingEdit> {
  const result = await apiFetch(
    `/api/v1/merchant/branches/${branchId}/edit-requests/${editId}`,
    { method: 'DELETE', auth: true },
  )
  return branchPendingEditSchema.parse(result)
}

// --- Opening hours ----------------------------------------------------------
// POST /api/v1/merchant/branches/:id/hours, body { hours }. Single-period-per-day;
// closed rows OMIT openTime/closeTime. Server-validated by B4.
//
// PR-4: the POST is now STAGE-not-apply on the backend. It writes a durable
// BranchOpeningHoursPending row (effectiveAt = now + 2h) and returns it; the live
// hours stay unchanged until a worker promotes the row after the 2-hour customer
// cool-off. setBranchHours is the untyped onboarding caller (the onboarding flow
// fires it during the draft window and ignores the response). stageBranchHours is
// the typed PR-4 day-2 caller that parses the staged pending record so the
// merchant-web banner renders it immediately. Both hit the same route.
export async function setBranchHours(branchId: string, hours: HoursPayloadRow[]): Promise<unknown> {
  return apiFetch(`/api/v1/merchant/branches/${branchId}/hours`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ hours }),
  })
}

// STAGE a day-2 hours change (PR-4 §6). A second stage SUPERSEDES the prior PENDING
// row (the backend cancels it and re-stages with a fresh effectiveAt). Server-enforced
// auth: OWNER any branch / assigned BRANCH_MANAGER / STAFF denied. Returns the staged
// pending record (proposed weekly hours + effectiveAt go-live time).
export async function stageBranchHours(
  branchId: string,
  hours: HoursPayloadRow[],
): Promise<BranchPendingHours> {
  const res = await apiFetch(`/api/v1/merchant/branches/${branchId}/hours`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ hours }),
  })
  return branchPendingHoursSchema.parse(res)
}

// CANCEL the staged change: DELETE /api/v1/merchant/branches/:id/hours/pending.
// Marks the branch's PENDING row CANCELLED before it promotes; the live hours are
// untouched (they only ever change on promotion). 404 PENDING_HOURS_NOT_FOUND when
// there is no PENDING row (e.g. it already promoted or was cancelled in another tab).
// Returns { ok: true }. Same branch-management WRITE boundary as the stage write.
export async function cancelPendingHours(branchId: string): Promise<{ ok: true }> {
  await apiFetch(`/api/v1/merchant/branches/${branchId}/hours/pending`, {
    method: 'DELETE',
    auth: true,
  })
  return { ok: true }
}

// --- Redemption alerts (PR-7 per-branch opt-in) -----------------------------
// PATCH /api/v1/merchant/branches/:id/redemption-alerts, body { enabled }. Sets the
// per-branch redemption-alerts opt-in. When ON, an in-store validation fans out an
// IN_APP VOUCHER_REDEEMED bell to the merchant's active owner(s) + the branch's
// scope-covering Branch Managers; email stays dark. Same branch-management WRITE
// boundary as the hours / amenities writes (server: resolveMerchantContext +
// assertCanManageBranch; OWNER any branch / assigned BRANCH_MANAGER / STAFF denied;
// suspended merchant -> MERCHANT_SUSPENDED). Returns the updated branch.
export async function setRedemptionAlerts(branchId: string, enabled: boolean): Promise<Branch> {
  const branch = await apiFetch(`/api/v1/merchant/branches/${branchId}/redemption-alerts`, {
    method: 'PATCH',
    auth: true,
    body: JSON.stringify({ enabled }),
  })
  return branchSchema.parse(branch)
}

// --- Amenities --------------------------------------------------------------
// Catalog read: GET /api/v1/customer/categories/:id/amenities (OPEN, no auth). The
// category id is the merchant's primaryCategoryId (subcategory); the backend unions
// the subcategory rules with the parent top-level rules.
const amenitySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    iconUrl: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .passthrough()

export type Amenity = z.infer<typeof amenitySchema>

export async function getBranchAmenities(categoryId: string): Promise<Amenity[]> {
  const res = await apiFetch<{ amenities: unknown }>(
    `/api/v1/customer/categories/${categoryId}/amenities`,
    { method: 'GET' },
  )
  return z.array(amenitySchema).parse(res.amenities)
}

// Write: POST /api/v1/merchant/branches/:id/amenities, body { amenityIds } (full
// replace).
export async function setBranchAmenities(branchId: string, amenityIds: string[]): Promise<unknown> {
  return apiFetch(`/api/v1/merchant/branches/${branchId}/amenities`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ amenityIds }),
  })
}

// --- PIN --------------------------------------------------------------------
// GET /api/v1/merchant/branches/:id/pin (decrypted) -> { pin: string | null }.
// PUT /api/v1/merchant/branches/:id/pin, body { pin } (4 numeric digits).
const pinSchema = z.object({ pin: z.string().nullable() }).passthrough()

export async function getBranchPin(branchId: string): Promise<{ pin: string | null }> {
  return pinSchema.parse(
    await apiFetch(`/api/v1/merchant/branches/${branchId}/pin`, { method: 'GET', auth: true }),
  )
}

export async function setBranchPin(branchId: string, pin: string): Promise<unknown> {
  return apiFetch(`/api/v1/merchant/branches/${branchId}/pin`, {
    method: 'PUT',
    auth: true,
    body: JSON.stringify({ pin }),
  })
}

// POST /api/v1/merchant/branches/:id/pin/send → dispatch the PIN to branch staff
// (SMS live, email dark). Errors: PIN_NOT_CONFIGURED, BRANCH_NOT_FOUND.
export async function sendBranchPin(branchId: string): Promise<{ message: string }> {
  const res = await apiFetch(`/api/v1/merchant/branches/${branchId}/pin/send`, {
    method: 'POST',
    auth: true,
  })
  return z.object({ message: z.string() }).passthrough().parse(res)
}

// --- Photos -----------------------------------------------------------------
// Branch photos have two write lanes:
//   1. Add-via-review (governed): upload the asset (PR-3 §6c branch-scoped upload),
//      then submit the URL through the edit-request lane (PR-3 §6a). The admin
//      approves -> the URL becomes a live APPROVED BranchPhoto row.
//   2. Instant removal (PR-3 §6b): an APPROVED photo is deleted by its row ID,
//      immediately out of the customer APPROVED set. OWNER-only on the backend.

// POST /api/v1/merchant/branches/:id/photos/upload : branch-scoped photo-asset
// upload (PR-3 §6c). Multipart FormData; the API client leaves Content-Type unset
// so the browser sets the multipart boundary, and attaches the bearer token. The
// backend gates by branch assignment (assertBranchAllowed), NOT the voucher
// canManageVouchers gate. Returns the stored public URL. The asset is not bound to
// the branch until the edit-request is submitted + admin-approved.
export async function uploadBranchPhoto(branchId: string, file: File): Promise<{ url: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await apiFetch<{ url: string }>(
    `/api/v1/merchant/branches/${branchId}/photos/upload`,
    { method: 'POST', auth: true, body: form },
  )
  return z.object({ url: z.string() }).passthrough().parse(res)
}

// POST /api/v1/merchant/branches/:id/photos/edit-request, body { add?, remove? }.
// The governed add-via-review lane: each add URL surfaces to admin as a PENDING
// edit (includesPhotos:true), and becomes a live APPROVED photo only on approval.
// 409 PENDING_EDIT_EXISTS when one is already in review.
export async function requestBranchPhotoEdit(branchId: string, addUrls: string[]): Promise<unknown> {
  return apiFetch(`/api/v1/merchant/branches/${branchId}/photos/edit-request`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ add: addUrls }),
  })
}

// DELETE /api/v1/merchant/branches/:id/photos/:photoId : instant removal of a LIVE
// (APPROVED) photo by its BranchPhoto ID (PR-3 §6b, remove-by-ID never by URL).
// OWNER-only on the backend. 404 BRANCH_PHOTO_NOT_FOUND, 409 PHOTO_NOT_REMOVABLE.
export async function removeBranchPhoto(branchId: string, photoId: string): Promise<unknown> {
  return apiFetch(`/api/v1/merchant/branches/${branchId}/photos/${photoId}`, {
    method: 'DELETE',
    auth: true,
  })
}
