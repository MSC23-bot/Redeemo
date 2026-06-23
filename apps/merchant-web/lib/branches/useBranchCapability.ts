'use client'

// Branches PR-1 F1 / §1.5: owner-vs-Branch-Manager signal. There is no membership
// role on the merchant session/JWT today, so PR-1 reuses the established merchant-
// web pattern (the Staff & Access page): derive `isOwner` from whether the owner-
// gated GET /staff query succeeds. A 403 with code INSUFFICIENT_PERMISSIONS means
// the caller is a scoped Branch Manager (read-only in PR-1). The backend 403 on
// every branch write is the real defence-in-depth boundary; this only drives which
// write controls render. `ready` is true once the query has SETTLED either way so
// write controls do not flash before the gate resolves.
import { useStaff } from '@/lib/staff/useStaff'
import { ApiError } from '@/lib/api/client'

export interface BranchCapability {
  isOwner: boolean
  ready: boolean
}

export function useBranchCapability(enabled: boolean): BranchCapability {
  const staff = useStaff(enabled)
  const staffForbidden =
    staff.isError && (staff.error as ApiError | undefined)?.code === 'INSUFFICIENT_PERMISSIONS'
  const isOwner = staff.isSuccess && !staffForbidden
  const ready = staff.isSuccess || staffForbidden
  return { isOwner, ready }
}
