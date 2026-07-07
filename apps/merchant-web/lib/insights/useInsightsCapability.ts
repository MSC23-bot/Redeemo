'use client'

// The SINGLE capability seam for viewing business-analytics surfaces (the Insights
// module + the per-voucher analytics section on the voucher detail page). Consumes
// the server-derived viewerCapabilities.canViewInsights (OWNER + BRANCH_MANAGER true;
// STAFF false), the SAME signal the shell nav uses to show/hide the Insights nav.
//
// FAIL CLOSED: while the profile is loading (or on an older backend without the
// field) canViewInsights is false - analytics affordances appear only once the
// capability is positively known. `ready` lets a caller distinguish "loading" from
// "denied".
//
// DISPLAY-ONLY gate: the analytics endpoint independently enforces the same policy
// server-side (assertMerchantActive + assertInsightsAccess in
// src/api/merchant/voucher/analytics.ts). This client gate only decides what to show.
import { useSession } from '@/lib/auth/session'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'

export interface InsightsCapability {
  /** Can view business-analytics surfaces (Insights + per-voucher analytics). */
  canViewInsights: boolean
  /** True once the profile fetch has settled (success or error). */
  ready: boolean
}

export function useInsightsCapability(): InsightsCapability {
  const session = useSession()
  const profile = useMerchantProfile(session.isAuthenticated)
  return {
    canViewInsights: profile.data?.viewerCapabilities?.canViewInsights === true,
    ready: profile.isSuccess || profile.isError,
  }
}
