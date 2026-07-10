// Staff & Access (v1) PR-C: pure display helpers + constants for the Staff &
// Access module. House style: no em-dashes (use ':' ';' '()' '·'); brand tokens
// for colour live in the components, not here.
import type { MemberRole } from '@/lib/api/staff'

// Hardcoded caps (spec §2 / §6): the prototype's placeholders. Raising = "contact
// Redeemo" (no in-product upgrade). These are NOT per-merchant configurable in v1.
export const PORTAL_CAP = 8
export const APP_CAP = 20

// Search appears when there are more than this many people (spec §2 / §6).
export const SEARCH_THRESHOLD = 4

export const ROLE_LABEL: Record<MemberRole, string> = {
  OWNER: 'Owner',
  BRANCH_MANAGER: 'Branch manager',
  STAFF: 'Staff',
}

// Per-role Can / Cannot detail, sourced from the prototype ROLE_DETAIL region and
// the §4.3 route-guard matrix (the shipped v1 authorization, not the prototype's
// wider BM branch-write which v1 safe-denies). Surfaced in the Add/Edit drawer.
export interface RoleDetail {
  can: string[]
  cannot: string[]
}

export const ROLE_DETAIL: Record<MemberRole, RoleDetail> = {
  OWNER: {
    can: [
      'Manage everything: team, branches, vouchers, and business details',
      'Invite and manage other portal members',
      'See and validate redemptions across every branch',
    ],
    cannot: ['Nothing is restricted for an owner'],
  },
  BRANCH_MANAGER: {
    can: [
      'View vouchers and see redemptions for their branches',
      'Validate redemption codes at their branches',
      'Manage vouchers across the business (only when you grant it)',
      'Edit their assigned branches, including branch PINs',
    ],
    cannot: [
      'Manage the team or invite members',
      'Edit business details',
    ],
  },
  STAFF: {
    can: ['View vouchers', 'Validate redemption codes at their branches'],
    cannot: [
      'Manage vouchers, the team, branches, or business details',
      'Be granted voucher management',
    ],
  },
}

// "Active {ago}" vs "Last seen {ago}" framing: a never-logged-in member reads as
// not-yet-active; a member with a lastLoginAt reads as last seen. The relative
// string itself is produced by formatRelativeTime (reused from notifications).
export function lastSeenLabel(lastLoginAt: string | null): { prefix: string; value: string | null } {
  if (!lastLoginAt) return { prefix: 'Not signed in yet', value: null }
  return { prefix: 'Last seen', value: lastLoginAt }
}

// Branch-coverage summary for the table. allBranches -> "All branches"; a single
// branch -> its name (resolved by the caller from the branch list); N branches ->
// "N branches". Returns a descriptor the component renders.
export function branchCoverageLabel(
  allBranches: boolean,
  branchIds: string[],
  branchNameById: (id: string) => string | undefined,
): string {
  if (allBranches) return 'All branches'
  if (branchIds.length === 0) return 'No branches'
  if (branchIds.length === 1) return branchNameById(branchIds[0]) ?? '1 branch'
  return `${branchIds.length} branches`
}

// Member status pill copy. Backend statuses are ACTIVE / INACTIVE / DELETED
// (DELETED is filtered out server-side, so it should not appear). A not-yet-claimed
// member (claimed === false) reads as "Invite pending" regardless of ACTIVE.
export function memberStatusLabel(status: string, claimed: boolean): string {
  if (status === 'INACTIVE') return 'Deactivated'
  if (!claimed) return 'Invite pending'
  return 'Active'
}
