import { z } from 'zod'
import { apiFetch, ApiError } from './client'
import { getAccessToken } from '@/lib/auth/tokenStore'

// My Account (§BP-ACC): the logged-in MerchantAdmin PERSON row (distinct from
// lib/api/profile.ts, which is the BUSINESS/Merchant entity). Backend:
// src/api/merchant/account/{routes,service}.ts.
//
// GET/PATCH /account + GET /account/sessions are regular per-person resource
// routes (like GET/PATCH /merchant/profile), NOT token-issuing merchant-auth
// flows - they follow the SAME direct browser->backend apiFetch convention as
// getMerchantProfile/updateMerchantProfile (Bearer access token, `auth: true`),
// rather than going through the Next BFF route handlers reserved for the
// cookie-bearing /merchant-auth/* flows (login/otp/register/refresh/logout).
export const merchantAccountSchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    jobTitle: z.string().nullish(),
    email: z.string(),
    phone: z.string().nullish(),
    phoneCountryCode: z.string().nullish(),
    emailVerified: z.boolean(),
    // Derived from the audit trail server-side; null when the password has
    // never been changed/reset (e.g. a draft-claim-only account).
    passwordChangedAt: z.string().nullish(),
  })
  .passthrough()
export type MerchantAccount = z.infer<typeof merchantAccountSchema>

export async function getMerchantAccount(): Promise<MerchantAccount> {
  return merchantAccountSchema.parse(await apiFetch('/api/v1/merchant/account', { method: 'GET', auth: true }))
}

// PATCH /account only ever accepts firstName/lastName/jobTitle (§BP-ACC "Your
// details -> Edit" scope) - email/phone are separate confirmed-change steps,
// staged honestly in the UI rather than routed through this call.
export interface MerchantAccountUpdateBody {
  firstName: string
  lastName: string
  jobTitle?: string | null
}

export async function updateMerchantAccount(body: MerchantAccountUpdateBody): Promise<MerchantAccount> {
  return merchantAccountSchema.parse(
    await apiFetch('/api/v1/merchant/account', { method: 'PATCH', auth: true, body: JSON.stringify(body) }),
  )
}

export const merchantSessionSchema = z
  .object({
    deviceType: z.string(),
    // The backend always selects this key (never absent), just possibly null -
    // .nullable() (not .nullish()) so the inferred type matches
    // formatSessionDeviceLabel's `string | null` parameter exactly.
    deviceName: z.string().nullable(),
    userAgent: z.string(),
    // Present on the wire (the backend selects it) but deliberately UNUSED by
    // every UI consumer: there is no geo-IP lookup anywhere in this codebase, so
    // showing a raw IP (or worse, inventing a city from it) would not be an
    // honest staged placeholder, just fabrication. Kept in the schema only so an
    // unexpected shape change is never silently swallowed by .passthrough().
    ipAddress: z.string(),
    lastActiveAt: z.string(),
    createdAt: z.string(),
    isCurrent: z.boolean(),
  })
  .passthrough()
export type MerchantSession = z.infer<typeof merchantSessionSchema>

export async function getMerchantSessions(): Promise<MerchantSession[]> {
  const data = await apiFetch<{ sessions: unknown[] }>('/api/v1/merchant/account/sessions', {
    method: 'GET',
    auth: true,
  })
  return z.array(merchantSessionSchema).parse(data.sessions ?? [])
}

// --- Change password / sign out of all other sessions (§BP-ACC) -------------
// Both live under /api/v1/merchant/auth/* alongside login/otp/register/refresh/
// logout - EVERY route in that namespace is BFF-fronted (lib/auth/bff.ts), so
// these two follow the same convention for namespace consistency, even though
// neither issues new session material or touches the httpOnly cookie: the Next
// route handlers at /api/merchant-auth/change-password and
// /api/merchant-auth/logout-all are thin authenticated passthroughs that forward
// the caller's in-memory bearer token (never persisted server-side by these
// routes) plus a same-origin CSRF guard, mirroring the existing /logout handler.
async function bffAuthedPost(path: string, body?: unknown): Promise<unknown> {
  const token = getAccessToken()
  const res = await fetch(`/api/merchant-auth/${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data)
  return data
}

const messageSchema = z.object({ message: z.string() }).passthrough()

export async function changeMerchantPassword(body: {
  currentPassword: string
  newPassword: string
}): Promise<{ message: string }> {
  return messageSchema.parse(await bffAuthedPost('change-password', body))
}

const logoutAllResultSchema = z.object({ message: z.string(), revokedCount: z.number() }).passthrough()

export async function logoutAllOtherSessions(): Promise<{ message: string; revokedCount: number }> {
  return logoutAllResultSchema.parse(await bffAuthedPost('logout-all'))
}
