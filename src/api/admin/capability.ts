// Phase 2 Slice 1 M2 — admin capability enforcement foundation.
//
// AdminUser.role is one of: SUPER_ADMIN | OPERATIONS | FINANCE | CONTENT |
// SUPPORT (prisma `AdminRole`). The role is carried on the admin JWT as
// `request.user.adminRole` (set by the admin-auth plugin).
//
// Slice 1 wires ONLY `merchant:create-draft` to a route (M2). The other
// capabilities are declared here as the enforcement foundation and become
// load-bearing when their routes land (approval:* in M3/M5, merchant:suspend +
// branch:confirm-location in M4/M6). Declaring them now keeps the map the
// single source of truth.

export type AdminCapability =
  | 'merchant:create-draft'
  | 'approval:read'
  | 'approval:action'
  | 'merchant:suspend'
  | 'branch:confirm-location'

const ALL_SLICE1_CAPS: AdminCapability[] = [
  'merchant:create-draft',
  'approval:read',
  'approval:action',
  'merchant:suspend',
  'branch:confirm-location',
]

// Per-role grants. SUPER_ADMIN is the superuser (handled in `adminHasCapability`
// so it implicitly holds every CURRENT and FUTURE capability without map
// upkeep). OPERATIONS runs the merchant lifecycle. FINANCE/CONTENT/SUPPORT hold
// none of the Slice-1 capabilities.
const ROLE_CAPABILITIES: Record<string, AdminCapability[]> = {
  OPERATIONS: ALL_SLICE1_CAPS,
  FINANCE: [],
  CONTENT: [],
  SUPPORT: [],
}

export function adminHasCapability(role: string | undefined, cap: AdminCapability): boolean {
  if (!role) return false
  if (role === 'SUPER_ADMIN') return true
  return (ROLE_CAPABILITIES[role] ?? []).includes(cap)
}

/**
 * Fastify preHandler that 403s an admin lacking `cap`. Must run AFTER
 * `authenticateAdmin` (the admin-management plugin applies that hook to the
 * whole scope, so `request.user.adminRole` is populated by the time this runs).
 */
export function requireAdminCapability(cap: AdminCapability) {
  return async function (request: any, reply: any) {
    if (!adminHasCapability(request.user?.adminRole, cap)) {
      return reply.status(403).send({
        error: {
          code: 'ADMIN_CAPABILITY_DENIED',
          message: 'You do not have permission to perform this action.',
          statusCode: 403,
        },
      })
    }
  }
}
