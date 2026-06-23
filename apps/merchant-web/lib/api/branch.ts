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
    amenity: z.object({ id: z.string(), name: z.string() }).passthrough(),
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
    // PR-3: drives the real per-photo render (was blanket-"Approved" in PR-1). The
    // GET /branches/:id include ships `photos: true`, so every BranchPhoto column
    // (incl. moderationStatus) is on the payload.
    moderationStatus: photoModerationStatusSchema.optional(),
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
    latitude: z.number().optional(),
    longitude: z.number().optional(),
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

export const branchSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    isMainBranch: z.boolean().optional(),
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
    latitude: z.number().nullish(),
    longitude: z.number().nullish(),
    openingHours: z.array(branchOpeningHoursSchema).optional(),
    amenities: z.array(branchAmenityLinkSchema).optional(),
    photos: z.array(branchPhotoSchema).optional(),
    pendingEdits: z.array(branchPendingEditSchema).optional(), // PENDING-only on list + detail
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
}

export async function createBranch(body: BranchCreateBody): Promise<Branch> {
  const branch = await apiFetch('/api/v1/merchant/branches', {
    method: 'POST',
    auth: true,
    body: JSON.stringify(body),
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
export async function setBranchHours(branchId: string, hours: HoursPayloadRow[]): Promise<unknown> {
  return apiFetch(`/api/v1/merchant/branches/${branchId}/hours`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ hours }),
  })
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
