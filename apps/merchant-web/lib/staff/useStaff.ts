'use client'

// Staff & Access (v1) PR-C C2: the React Query hooks for the Staff & Access module.
// Reads are keyed ['staff'] (portal members) + ['branchAppUsers'] (the read-only
// app-user surface); every mutation invalidates the cache it changes on success.
// Mirrors the portal's existing useQuery/useMutation pattern (queryKey arrays +
// invalidateQueries on success). Server is the authorization boundary; these hooks
// only drive the UI.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listStaff,
  inviteStaff,
  updateStaff,
  deactivateStaff,
  reactivateStaff,
  removeStaff,
  resendInvite,
  listBranchAppUsers,
  resetAppUserPassword,
  deactivateAppUser,
  reactivateAppUser,
  type StaffInviteBody,
  type StaffUpdateBody,
} from '@/lib/api/staff'

export const STAFF_KEY = ['staff'] as const
export const APP_USERS_KEY = ['branchAppUsers'] as const

// Portal members. Only fetched once authenticated + the page is the owner surface
// (the page passes `enabled`). A non-owner caller gets a 403 from the backend.
export function useStaff(enabled: boolean) {
  return useQuery({
    queryKey: STAFF_KEY,
    queryFn: listStaff,
    enabled,
    staleTime: 30_000,
  })
}

// Read-only app-user surface (BranchUsers grouped by branch, with appUserCount).
export function useBranchAppUsers(enabled: boolean) {
  return useQuery({
    queryKey: APP_USERS_KEY,
    queryFn: listBranchAppUsers,
    enabled,
    staleTime: 30_000,
  })
}

// --- Member mutations (invalidate ['staff']) --------------------------------

export function useInviteStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: StaffInviteBody) => inviteStaff(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: STAFF_KEY }),
  })
}

export function useUpdateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ memberId, body }: { memberId: string; body: StaffUpdateBody }) =>
      updateStaff(memberId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: STAFF_KEY }),
  })
}

export function useDeactivateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (memberId: string) => deactivateStaff(memberId),
    onSuccess: () => qc.invalidateQueries({ queryKey: STAFF_KEY }),
  })
}

export function useReactivateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (memberId: string) => reactivateStaff(memberId),
    onSuccess: () => qc.invalidateQueries({ queryKey: STAFF_KEY }),
  })
}

export function useRemoveStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (memberId: string) => removeStaff(memberId),
    onSuccess: () => qc.invalidateQueries({ queryKey: STAFF_KEY }),
  })
}

export function useResendInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (memberId: string) => resendInvite(memberId),
    onSuccess: () => qc.invalidateQueries({ queryKey: STAFF_KEY }),
  })
}

// --- App-user mutations (invalidate ['branchAppUsers']) ---------------------
// All addressed by branchId (one-app-user-per-branch v1 shape). The reset returns
// the one-time temporary password for the owner to relay to the staff member.

export function useResetAppUserPassword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (branchId: string) => resetAppUserPassword(branchId),
    onSuccess: () => qc.invalidateQueries({ queryKey: APP_USERS_KEY }),
  })
}

export function useDeactivateAppUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (branchId: string) => deactivateAppUser(branchId),
    onSuccess: () => qc.invalidateQueries({ queryKey: APP_USERS_KEY }),
  })
}

export function useReactivateAppUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (branchId: string) => reactivateAppUser(branchId),
    onSuccess: () => qc.invalidateQueries({ queryKey: APP_USERS_KEY }),
  })
}
