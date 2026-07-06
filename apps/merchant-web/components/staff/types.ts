// Staff & Access (v1) PR-C: the normalized person-row shape the unified table
// renders. The Staff & Access surface presents portal members (MerchantMembership)
// and app users (BranchUser) in one prototype-shaped table; the backend serves them
// as two SEPARATE endpoints (the Option-C split backend, D2), so the page maps both
// onto this union. The email<->app correlation is display-only and never drives
// authorization (spec §7 #7).
import type { MemberRow, AppUser } from '@/lib/api/staff'
import type { MemberRole } from '@/lib/api/staff'

export type PersonKind = 'portal' | 'app'

export interface PortalPerson {
  kind: 'portal'
  /** The MerchantMembership id (the staff-route address). */
  id: string
  name: string
  email: string
  role: MemberRole
  status: string
  canManageVouchers: boolean
  allBranches: boolean
  branchIds: string[]
  claimed: boolean
  lastLoginAt: string | null
  /** Whether this membership is the only active owner (drives last-owner locks). */
  isLastActiveOwner: boolean
  /** Optional, shows under the member's role chip. Absent on older payloads. */
  jobTitle?: string | null
  raw: MemberRow
}

export interface AppPerson {
  kind: 'app'
  /** The BranchUser id (display only; actions address the branch). */
  id: string
  name: string
  email: string
  status: string
  jobTitle: string | null
  branchId: string
  branchName: string
  /** App users at this branch; the §5.3 disable-on->1 guard reads this. */
  appUserCount: number
  lastLoginAt: string | null
  raw: AppUser
}

export type Person = PortalPerson | AppPerson
