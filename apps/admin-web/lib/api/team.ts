/**
 * Team & Roles admin API.
 *
 * Typed wrappers for the SUPER_ADMIN-only team-management surface
 * (spec 2026-07-10-admin-capability-grants-field-role §6; backend
 * src/api/admin/team/routes.ts). Every route is gated on `admin:manage-team`
 * server-side; the admin-web mirror additionally gates the page/actions on
 * `can('admin:manage-team')` (two-layer rule, .claude/rules/admin-web.md).
 *
 *   GET    /api/v1/admin/team                     -> roster (S2 addition: the
 *                                                      one permitted additive
 *                                                      backend route for this
 *                                                      slice)
 *   POST   /api/v1/admin/team                      -> create an admin account
 *                                                      (random unusable
 *                                                      password; activates via
 *                                                      the password-reset flow
 *                                                      once email is live)
 *   PATCH  /api/v1/admin/team/:adminId/role         -> set base role
 *   POST   /api/v1/admin/team/:adminId/deactivate   -> deactivate (self-action
 *                                                      forbidden, 400)
 *   POST   /api/v1/admin/team/:adminId/grants       -> grant a curated
 *                                                      capability (400 if not
 *                                                      on the grantable list)
 *   POST   /api/v1/admin/team/:adminId/revoke       -> revoke an active grant
 *                                                      (404 if none active)
 *
 * Every response is Zod-validated so contract drift surfaces as a clear error
 * rather than an undefined-field crash. Errors throw `ApiError` from
 * `apiFetch` (EMAIL_ALREADY_EXISTS, CAPABILITY_NOT_GRANTABLE,
 * ADMIN_SELF_ACTION_FORBIDDEN, ADMIN_NOT_FOUND, GRANT_NOT_FOUND).
 */
import { z } from 'zod'
import { apiFetch } from './client'

// ── Shared shapes ──────────────────────────────────────────────────────────

// The base roles assignable via Team & Roles (mirrors the backend
// ASSIGNABLE_ROLE — SUPER_ADMIN is assigned out of band, never through this
// surface, so a grantee can never mint a peer superuser here).
export const ASSIGNABLE_ROLES = ['OPERATIONS', 'FINANCE', 'CONTENT', 'SUPPORT', 'FIELD'] as const
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

// ── Response schemas ──────────────────────────────────────────────────────────

const teamAdminSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  activeGrants: z.array(z.string()),
})
export type TeamAdmin = z.infer<typeof teamAdminSchema>

const listTeamResponseSchema = z.object({
  admins: z.array(teamAdminSchema),
})
export type ListTeamResponse = z.infer<typeof listTeamResponseSchema>

const createAdminResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
})
export type CreateAdminResponse = z.infer<typeof createAdminResponseSchema>

const setRoleResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string(),
  isActive: z.boolean(),
})
export type SetRoleResponse = z.infer<typeof setRoleResponseSchema>

const deactivateResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string(),
  isActive: z.boolean(),
})
export type DeactivateResponse = z.infer<typeof deactivateResponseSchema>

const grantResponseSchema = z.object({
  id: z.string(),
  capability: z.string(),
  grantedAt: z.string(),
  alreadyGranted: z.boolean(),
})
export type GrantResponse = z.infer<typeof grantResponseSchema>

const revokeResponseSchema = z.object({
  capability: z.string(),
  revokedCount: z.number(),
})
export type RevokeResponse = z.infer<typeof revokeResponseSchema>

// ── Request shapes ────────────────────────────────────────────────────────────

export interface CreateAdminAccountInput {
  email: string
  firstName: string
  lastName: string
  role: AssignableRole
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const teamApi = {
  /** Fetch every admin account + its active capability grants. No pagination. */
  list: async (): Promise<ListTeamResponse> => {
    const raw = await apiFetch<unknown>('/api/v1/admin/team', { auth: true })
    return listTeamResponseSchema.parse(raw)
  },

  /**
   * Create an admin account. Throws ApiError (EMAIL_ALREADY_EXISTS on a
   * duplicate email).
   */
  create: async (input: CreateAdminAccountInput): Promise<CreateAdminResponse> => {
    const raw = await apiFetch<unknown>('/api/v1/admin/team', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    })
    return createAdminResponseSchema.parse(raw)
  },

  /** Set an admin's base role (any AssignableRole, including FIELD). */
  setRole: async (adminId: string, role: AssignableRole): Promise<SetRoleResponse> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/team/${adminId}/role`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ role }),
    })
    return setRoleResponseSchema.parse(raw)
  },

  /**
   * Deactivate an admin account. Throws ApiError
   * (ADMIN_SELF_ACTION_FORBIDDEN, ADMIN_NOT_FOUND).
   */
  deactivate: async (adminId: string): Promise<DeactivateResponse> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/team/${adminId}/deactivate`, {
      method: 'POST',
      auth: true,
    })
    return deactivateResponseSchema.parse(raw)
  },

  /**
   * Grant a curated capability. `capability` should always be a value from
   * the GRANTABLE_CAPABILITIES mirror (lib/auth/session.ts) — the backend
   * allow-list is the real enforcement (CAPABILITY_NOT_GRANTABLE, 400, on
   * anything off it).
   */
  grant: async (adminId: string, capability: string): Promise<GrantResponse> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/team/${adminId}/grants`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ capability }),
    })
    return grantResponseSchema.parse(raw)
  },

  /** Revoke a capability grant. Throws ApiError (GRANT_NOT_FOUND). */
  revoke: async (adminId: string, capability: string): Promise<RevokeResponse> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/team/${adminId}/revoke`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ capability }),
    })
    return revokeResponseSchema.parse(raw)
  },
}
