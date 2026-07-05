'use client'

// D-BM1: owner-vs-Branch-Manager signal, derived from the profile
// viewerCapabilities.role (the SAME source Quick-Actions and the shell nav use).
// This RETIRES the PR-1 stopgap that probed the owner-gated GET /staff for a
// 403 - the role has been on the profile since #364, and one source of truth
// removes the silent-divergence risk between surfaces. Fail-closed: an absent
// or unknown role reads as not-owner. `ready` is true once the profile query
// has settled either way so write controls do not flash before the gate
// resolves. The backend asserts remain the real boundary on every write.
import { useSession } from '@/lib/auth/session'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'

export interface BranchCapability {
  isOwner: boolean
  ready: boolean
  /** The raw profile role (fail-closed null when absent/unresolved). */
  role: string | null
}

export function useBranchCapability(enabled: boolean): BranchCapability {
  const session = useSession()
  const profile = useMerchantProfile(enabled && session.isAuthenticated)
  const role = profile.data?.viewerCapabilities?.role ?? null
  return {
    isOwner: role === 'OWNER',
    ready: profile.isSuccess || profile.isError,
    role,
  }
}
