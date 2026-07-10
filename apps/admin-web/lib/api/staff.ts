/**
 * Admin merchant staff read (Merchant 360 A4). Typed wrapper for the read-only
 * roster route:
 *
 *   GET /api/v1/admin/merchants/:id/staff   (cap merchant:read)
 *
 * Two curated arrays: portal `members` (MerchantMembership -> MerchantAdmin) and
 * branch `appLogins` (BranchUser). The backend NEVER returns a passwordHash, the
 * branch redemptionPin, OTP/session data, or tokens; this mirror declares only
 * the curated fields. Staff MUTATIONS on behalf (invite / role change / remove,
 * D44) are Phase C wizard scope + the OD4 capability decision, so there are no
 * write wrappers here.
 *
 * The response is Zod-validated so contract drift surfaces as a clear error.
 * Enum-ish fields use `.or(z.string())` for drift resilience (a new role /
 * status value surfaces as a known string rather than a parse crash).
 */
import { z } from 'zod'
import { apiFetch } from './client'

const branchRefSchema = z.object({ id: z.string(), name: z.string() })

export const staffMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(['OWNER', 'BRANCH_MANAGER', 'STAFF']).or(z.string()),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DELETED', 'SUSPENDED']).or(z.string()),
  allBranches: z.boolean(),
  canManageVouchers: z.boolean(),
  emailVerified: z.boolean(),
  branchScopes: z.array(branchRefSchema),
  appAccess: z.boolean(),
})
export type StaffMember = z.infer<typeof staffMemberSchema>

export const staffAppLoginSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DELETED', 'SUSPENDED']).or(z.string()),
  branch: branchRefSchema,
  appAccess: z.boolean(),
})
export type StaffAppLogin = z.infer<typeof staffAppLoginSchema>

export const adminStaffResponseSchema = z.object({
  members: z.array(staffMemberSchema),
  appLogins: z.array(staffAppLoginSchema),
})
export type AdminStaffResponse = z.infer<typeof adminStaffResponseSchema>

export const adminStaffApi = {
  /** Read the merchant's staff roster (portal members + branch app logins). */
  list: async (merchantId: string): Promise<AdminStaffResponse> => {
    const raw = await apiFetch<unknown>(
      `/api/v1/admin/merchants/${merchantId}/staff`,
      { auth: true }
    )
    return adminStaffResponseSchema.parse(raw)
  },
}
