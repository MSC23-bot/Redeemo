import { z } from 'zod'
import { apiFetch } from './client'

// Staff & Access (v1) PR-C: the merchant-web Staff & Access API client. Calls the
// REAL merged PR-B backend (src/api/merchant/staff/* + the app-user actions on
// src/api/auth/merchant/branch-user.routes.ts). Direct browser->backend authed
// calls (Bearer access token via apiFetch auth:true). No BFF route is needed (no
// token issuance; the M1 BFF only handles refresh).
//
// Backend contracts (read the real code, do not guess) — locked PR-B shapes:
//   GET    /api/v1/merchant/staff                 -> { members: MemberRow[] }
//   POST   /api/v1/merchant/staff                 -> { memberId, inviteDelivery }
//   PATCH  /api/v1/merchant/staff/:id             -> { id }   (edit access)
//   POST   /api/v1/merchant/staff/:id/deactivate  -> { id }
//   POST   /api/v1/merchant/staff/:id/reactivate  -> { id }
//   DELETE /api/v1/merchant/staff/:id             -> { id }   (remove from team)
//   POST   /api/v1/merchant/staff/:id/resend-invite -> { memberId, inviteDelivery }
//   GET    /api/v1/merchant/staff/app-users       -> { branches: [...] }
//   POST   /api/v1/merchant/branches/:branchId/user/reset-password -> { message, temporaryPassword }
//   PATCH  /api/v1/merchant/branches/:branchId/user/deactivate     -> { message }
//   PATCH  /api/v1/merchant/branches/:branchId/user/reactivate     -> { message }
//
// Security invariants the client relies on (test-pinned server-side, mirrored here):
//   - The members + app-users payloads NEVER carry passwordHash (curated selects).
//   - `inviteDelivery` is a NON-SECRET status only; the API NEVER returns a claim
//     token / claim link. The schemas below deliberately have no token field.
//   - Member management is owner-only: a non-owner caller gets INSUFFICIENT_PERMISSIONS
//     (403) from the backend (the UI also hides management affordances, but the
//     server is the boundary).

// --- Members ----------------------------------------------------------------
// .passthrough() so a future backend field cannot break this client; the explicit
// keys are what we render. lastLoginAt is nullable (a not-yet-claimed member has
// never logged in).
export const memberRoleSchema = z.enum(['OWNER', 'BRANCH_MANAGER', 'STAFF'])
export type MemberRole = z.infer<typeof memberRoleSchema>

export const memberRowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    role: memberRoleSchema,
    status: z.string(),
    canManageVouchers: z.boolean(),
    allBranches: z.boolean(),
    branchIds: z.array(z.string()),
    claimed: z.boolean(),
    lastLoginAt: z.string().nullable(),
  })
  .passthrough()

export type MemberRow = z.infer<typeof memberRowSchema>

const membersListSchema = z.object({ members: z.array(memberRowSchema) })

export async function listStaff(): Promise<MemberRow[]> {
  const data = await apiFetch('/api/v1/merchant/staff', { method: 'GET', auth: true })
  return membersListSchema.parse(data).members
}

// --- Invite / edit / lifecycle ----------------------------------------------
// The invite body. Only filled keys are sent; the server zod-validates. canManageVouchers
// is server-overridden (only an OWNER caller can grant it, only to a BRANCH_MANAGER),
// so it is best-effort here and the backend is the source of truth.
export interface StaffInviteBody {
  email: string
  firstName: string
  lastName: string
  jobTitle?: string
  role: MemberRole
  allBranches: boolean
  branchIds?: string[]
  canManageVouchers?: boolean
}

// inviteDelivery is a NON-SECRET status: EMAIL_DARK (email master switch off, the
// member has a live claim token they have NOT received) or QUEUED (the invite email
// was queued for delivery once email is live). NEVER a token. See spec §5.1.2.
export const inviteResponseSchema = z.object({
  memberId: z.string(),
  inviteDelivery: z.enum(['EMAIL_DARK', 'QUEUED']),
})
export type InviteResponse = z.infer<typeof inviteResponseSchema>

export async function inviteStaff(body: StaffInviteBody): Promise<InviteResponse> {
  return inviteResponseSchema.parse(
    await apiFetch('/api/v1/merchant/staff', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(body),
    }),
  )
}

// The edit-access body (PATCH). Role + scope + voucher delegation.
export interface StaffUpdateBody {
  role: MemberRole
  allBranches: boolean
  branchIds?: string[]
  canManageVouchers?: boolean
}

export async function updateStaff(memberId: string, body: StaffUpdateBody): Promise<{ id: string }> {
  return z
    .object({ id: z.string() })
    .parse(
      await apiFetch(`/api/v1/merchant/staff/${memberId}`, {
        method: 'PATCH',
        auth: true,
        body: JSON.stringify(body),
      }),
    )
}

export async function deactivateStaff(memberId: string): Promise<{ id: string }> {
  return z
    .object({ id: z.string() })
    .parse(
      await apiFetch(`/api/v1/merchant/staff/${memberId}/deactivate`, { method: 'POST', auth: true }),
    )
}

export async function reactivateStaff(memberId: string): Promise<{ id: string }> {
  return z
    .object({ id: z.string() })
    .parse(
      await apiFetch(`/api/v1/merchant/staff/${memberId}/reactivate`, { method: 'POST', auth: true }),
    )
}

export async function removeStaff(memberId: string): Promise<{ id: string }> {
  return z
    .object({ id: z.string() })
    .parse(await apiFetch(`/api/v1/merchant/staff/${memberId}`, { method: 'DELETE', auth: true }))
}

export async function resendInvite(memberId: string): Promise<InviteResponse> {
  return inviteResponseSchema.parse(
    await apiFetch(`/api/v1/merchant/staff/${memberId}/resend-invite`, { method: 'POST', auth: true }),
  )
}

// --- App users (read) -------------------------------------------------------
// The locked B1b shape, consumed verbatim by the C3/C5 app-users surface.
// `appUserCount` drives the §5.3 disable-on->1 UI guard. NEVER passwordHash.
export const appUserSchema = z
  .object({
    id: z.string(),
    branchId: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    jobTitle: z.string().nullable(),
    email: z.string(),
    status: z.string(),
    lastLoginAt: z.string().nullable(),
  })
  .passthrough()

export type AppUser = z.infer<typeof appUserSchema>

export const appUserBranchSchema = z
  .object({
    branchId: z.string(),
    branchName: z.string(),
    appUserCount: z.number(),
    users: z.array(appUserSchema),
  })
  .passthrough()

export type AppUserBranch = z.infer<typeof appUserBranchSchema>

const appUsersListSchema = z.object({ branches: z.array(appUserBranchSchema) })
export type AppUsersList = z.infer<typeof appUsersListSchema>

export async function listBranchAppUsers(): Promise<AppUsersList> {
  return appUsersListSchema.parse(
    await apiFetch('/api/v1/merchant/staff/app-users', { method: 'GET', auth: true }),
  )
}

// --- App-user actions -------------------------------------------------------
// One-app-user-per-branch routes addressed by branchId (the backend resolves the
// single target and refuses with MULTIPLE_BRANCH_USERS when the branch has >1).
// The reset returns the one-time temporary password to relay to the staff member.
const resetResponseSchema = z
  .object({ message: z.string(), temporaryPassword: z.string() })
  .passthrough()
export type ResetResponse = z.infer<typeof resetResponseSchema>

export async function resetAppUserPassword(branchId: string): Promise<ResetResponse> {
  return resetResponseSchema.parse(
    await apiFetch(`/api/v1/merchant/branches/${branchId}/user/reset-password`, {
      method: 'POST',
      auth: true,
    }),
  )
}

export async function deactivateAppUser(branchId: string): Promise<{ message: string }> {
  return z
    .object({ message: z.string() })
    .passthrough()
    .parse(
      await apiFetch(`/api/v1/merchant/branches/${branchId}/user/deactivate`, {
        method: 'PATCH',
        auth: true,
      }),
    )
}

export async function reactivateAppUser(branchId: string): Promise<{ message: string }> {
  return z
    .object({ message: z.string() })
    .passthrough()
    .parse(
      await apiFetch(`/api/v1/merchant/branches/${branchId}/user/reactivate`, {
        method: 'PATCH',
        auth: true,
      }),
    )
}
