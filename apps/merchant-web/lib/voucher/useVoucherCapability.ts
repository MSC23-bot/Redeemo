'use client'

// Day-2 Vouchers B3 (spec §0 / §6) + shell wave: the SINGLE capability seam for
// voucher management. Originally v1 returned canManage:true for every session
// (pre-Staff & Access there was only the owner). The role model has landed, so
// this seam now consumes the server-derived viewerCapabilities.canManageVouchers
// (OWNER, or a BRANCH_MANAGER granted the manage-vouchers toggle). Every voucher
// surface routes its can-edit / can-create gating through here, so this file is
// still the only edit point.
//
// FAIL CLOSED: while the profile is loading (or on an older backend without the
// field) canManage is false - management affordances appear once the capability
// is positively known. `ready` lets a caller distinguish "loading" from "denied".
//
// INVARIANT (B-13): this is a DISPLAY-ONLY gate. Any privileged capability it
// unlocks (create / edit / submit / delete / duplicate) MUST ALSO be enforced
// server-side - the client gate only decides what to show, never what is allowed.
import { useSession } from '@/lib/auth/session'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'

export interface VoucherCapability {
  /** Can create / edit / submit / delete / duplicate custom vouchers. */
  canManage: boolean
  /** True once the profile fetch has settled (success or error). */
  ready: boolean
}

export function useVoucherCapability(): VoucherCapability {
  const session = useSession()
  const profile = useMerchantProfile(session.isAuthenticated)
  return {
    canManage: profile.data?.viewerCapabilities?.canManageVouchers === true,
    ready: profile.isSuccess || profile.isError,
  }
}
