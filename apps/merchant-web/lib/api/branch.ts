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

const branchPhotoSchema = z.object({ id: z.string(), url: z.string() }).passthrough()

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
    bannerUrl: z.string().nullish(),
    openingHours: z.array(branchOpeningHoursSchema).optional(),
    amenities: z.array(branchAmenityLinkSchema).optional(),
    photos: z.array(branchPhotoSchema).optional(),
  })
  .passthrough()

export type Branch = z.infer<typeof branchSchema>

export async function listBranches(): Promise<Branch[]> {
  const rows = await apiFetch('/api/v1/merchant/branches', { method: 'GET', auth: true })
  return z.array(branchSchema).parse(rows)
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

// --- Photos -----------------------------------------------------------------
// The ONLY backend branch-photo write is the governed edit-request lane:
// POST /api/v1/merchant/branches/:id/photos/edit-request, body { add?, remove? }.
// There is no direct branch-photo write, so onboarding photos go through this lane
// and surface to admin as a PENDING edit. The F4 UI labels them "pending review".
export async function requestBranchPhotoEdit(branchId: string, addUrls: string[]): Promise<unknown> {
  return apiFetch(`/api/v1/merchant/branches/${branchId}/photos/edit-request`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ add: addUrls }),
  })
}
