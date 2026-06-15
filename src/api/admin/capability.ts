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
//
// `merchant:read` (admin follow-up WP2) gates the read-only merchants directory
// (list + search) + the bell click-through + the future admin-edit surfaces. It
// is intentionally distinct from the destructive `merchant:suspend` (so a
// directory-read role need not also hold the takedown action) AND from
// `approval:read` (the directory surfaces ALL merchants, not just those with a
// pending approval, so coupling it to the approval workflow would be a semantic
// mismatch).

export type AdminCapability =
  | 'merchant:create-draft'
  | 'merchant:read'
  | 'approval:read'
  | 'approval:action'
  | 'merchant:suspend'
  | 'branch:confirm-location'
  // Option B B1: gates applying a merchant-requested identity edit
  // (MERCHANT_IDENTITY_EDIT / BRANCH_IDENTITY_EDIT). Distinct from the
  // onboarding-only `approval:action` so an edit-applier role need not also
  // hold the go-live/reject actions. OPERATIONS + SUPER_ADMIN hold it.
  | 'approval:apply-edit'
  // Option B B2.1: gates the admin direct-edit-on-behalf routes (PATCH a
  // merchant's / branch's simple-DIRECT fields). Distinct from B1's
  // `approval:apply-edit`: B1 APPLIES a merchant-REQUESTED identity edit;
  // B2.1 is the admin EDITING directly on the merchant's behalf. OPERATIONS +
  // SUPER_ADMIN hold it.
  | 'merchant:edit'
  // Option B B2.2: gates the admin edit of a merchant's registered identity
  // fields (vatNumber / companyNumber). Intentionally NOT in ALL_SLICE1_CAPS: it
  // is held ONLY by SUPER_ADMIN (via the superuser short-circuit in
  // adminHasCapability). OPERATIONS does NOT hold it, because identity edits are
  // a higher bar than the websiteUrl / branch-contact edits gated by merchant:edit.
  | 'merchant:edit-identity'
  // Option B B2.3: gates the admin edit of a merchant's primaryCategoryId.
  // NOT in ALL_SLICE1_CAPS -> SUPER_ADMIN-only (via the superuser short-circuit).
  // Category change has RMV-provisioning side effects (it discards DRAFT RMVs and
  // reprovisions 2 mandatory vouchers), so it sits at the same higher bar as
  // merchant:edit-identity.
  | 'merchant:edit-category'

const ALL_SLICE1_CAPS: AdminCapability[] = [
  'merchant:create-draft',
  'merchant:read',
  'approval:read',
  'approval:action',
  'merchant:suspend',
  'branch:confirm-location',
  'approval:apply-edit',
  'merchant:edit',
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
