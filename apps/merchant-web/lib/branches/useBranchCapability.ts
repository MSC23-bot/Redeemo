'use client'

// D-BM1: owner-vs-Branch-Manager signal, derived from the profile
// viewerCapabilities.role (the SAME source Quick-Actions and the shell nav use)
// WITH a temporary owner-only compatibility fallback for deployment skew.
//
// SKEW REALITY (correction round): the live Railway backend can predate #364
// and emit NO viewerCapabilities.role while Vercel auto-deploys this frontend.
// Treating an absent role as a settled non-owner would strip the REAL owner of
// branch-management controls until a separately gated backend deployment. So:
//
//   1. An explicit modern role is ALWAYS authoritative - OWNER, BRANCH_MANAGER
//      and STAFF never invoke the fallback.
//   2. ONLY when the profile request SUCCEEDED and carries no role (old
//      backend) does the legacy owner-probe fire: the assertOwner-gated
//      GET /merchant/staff. Probe 200 establishes OWNER and nothing else.
//   3. Probe 403 establishes only non-owner (NEVER Branch Manager - STAFF
//      receives the identical denial, so inferring BM would over-grant).
//   4. Probe network/server errors fail closed to null role and no controls.
//   5. The fallback can never grant BM or STAFF controls; an old backend also
//      never emits the per-branch canManage block, so effectiveCanManage's BM
//      arm cannot fire either. Owners are preserved; nobody is widened.
//
// REMOVAL TRIGGER: delete the legacy probe (and this comment) only after a
// CONFIRMED Railway backend deployment carrying the #364 profile-role
// contract. The long-term design remains probe-free (one role source).
//
// `ready` is true once the modern role OR the required fallback has settled
// either way, so write controls do not flash before the gate resolves. The
// backend asserts remain the real boundary on every write regardless.
import { useSession } from '@/lib/auth/session'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'
import { useStaff } from '@/lib/staff/useStaff'

export interface BranchCapability {
  isOwner: boolean
  ready: boolean
  /** The effective role (modern profile role, or 'OWNER' via the legacy probe; fail-closed null otherwise). */
  role: string | null
}

export function useBranchCapability(enabled: boolean): BranchCapability {
  const session = useSession()
  const profileEnabled = enabled && session.isAuthenticated
  const profile = useMerchantProfile(profileEnabled)
  const modernRole = profile.data?.viewerCapabilities?.role ?? null

  // Fallback fires ONLY for: enabled + authenticated + profile SUCCEEDED +
  // role absent (an old backend). A failed profile request stays fail-closed
  // (no probe, no controls); modern roles never reach here.
  const needsLegacyProbe = profileEnabled && profile.isSuccess && modernRole === null
  const staff = useStaff(needsLegacyProbe)

  // 200 => OWNER only. 403 AND any other error => null (non-owner, fail closed).
  const legacyRole = needsLegacyProbe && staff.isSuccess ? 'OWNER' : null
  const role = modernRole ?? legacyRole

  const ready = !profileEnabled
    ? false
    : profile.isError
      ? true
      : profile.isSuccess
        ? modernRole !== null || staff.isSuccess || staff.isError
        : false

  return { isOwner: role === 'OWNER', ready, role }
}
