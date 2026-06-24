'use client'

// Branches PR-1 F1: the React Query hooks for the Branches module. Reads are
// keyed ['branches'] (overview list) + ['branch', id] (detail). Every mutation
// invalidates BOTH caches on success so the overview cards/rows and the detail
// page stay in sync. Mirrors lib/staff/useStaff.ts (queryKey arrays +
// invalidateQueries on success). The server is the authorization boundary; these
// hooks only drive the UI.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listBranches,
  getBranch,
  updateBranch,
  setBranchAmenities,
  setBranchPin,
  createBranchEditRequest,
  withdrawBranchEditRequest,
  sendBranchPin,
  type Branch,
  type BranchUpdateBody,
  type BranchEditRequestBody,
} from '@/lib/api/branch'

export const BRANCHES_KEY = ['branches'] as const

const branchKey = (id: string) => ['branch', id] as const

// Overview list (GET /branches). The detail rows are derived from the same
// payload; the dedicated useBranch read backs deep-links / refresh.
export function useBranches() {
  return useQuery<Branch[]>({
    queryKey: BRANCHES_KEY,
    queryFn: listBranches,
    staleTime: 30_000,
  })
}

// Single branch (GET /branches/:id). Disabled when no id is set.
export function useBranch(id: string) {
  return useQuery<Branch>({
    queryKey: branchKey(id),
    queryFn: () => getBranch(id),
    enabled: !!id,
    staleTime: 30_000,
  })
}

// Shared success handler: invalidate the list + the specific branch detail.
function useInvalidateBranch() {
  const qc = useQueryClient()
  return (id: string) => {
    qc.invalidateQueries({ queryKey: BRANCHES_KEY })
    qc.invalidateQueries({ queryKey: branchKey(id) })
  }
}

// --- Mutations (each invalidates ['branches'] + ['branch', id]) -------------

// F4: instant-save of the DIRECT contact fields (phone / email / websiteUrl).
export function useUpdateBranchContact() {
  const invalidate = useInvalidateBranch()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: BranchUpdateBody }) => updateBranch(id, body),
    onSuccess: (_data, { id }) => invalidate(id),
  })
}

// F5: full-replace amenities.
export function useSetAmenities() {
  const invalidate = useInvalidateBranch()
  return useMutation({
    mutationFn: ({ id, amenityIds }: { id: string; amenityIds: string[] }) =>
      setBranchAmenities(id, amenityIds),
    onSuccess: (_data, { id }) => invalidate(id),
  })
}

// F8: promote this branch to main (atomic single-main on the backend).
export function useSetMainBranch() {
  const invalidate = useInvalidateBranch()
  return useMutation({
    mutationFn: (id: string) => updateBranch(id, { isMainBranch: true }),
    onSuccess: (_data, id) => invalidate(id),
  })
}

// F6: change the 4-digit PIN.
export function useSetBranchPin() {
  const invalidate = useInvalidateBranch()
  return useMutation({
    mutationFn: ({ id, pin }: { id: string; pin: string }) => setBranchPin(id, pin),
    onSuccess: (_data, { id }) => invalidate(id),
  })
}

// F7: submit a reviewed identity edit-request.
export function useCreateBranchEditRequest() {
  const invalidate = useInvalidateBranch()
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: BranchEditRequestBody }) =>
      createBranchEditRequest(id, changes),
    onSuccess: (_data, { id }) => invalidate(id),
  })
}

// F7: withdraw a pending edit-request.
export function useWithdrawBranchEditRequest() {
  const invalidate = useInvalidateBranch()
  return useMutation({
    mutationFn: ({ id, editId }: { id: string; editId: string }) =>
      withdrawBranchEditRequest(id, editId),
    onSuccess: (_data, { id }) => invalidate(id),
  })
}

// F6: dispatch the PIN to branch staff.
export function useSendBranchPin() {
  const invalidate = useInvalidateBranch()
  return useMutation({
    mutationFn: (id: string) => sendBranchPin(id),
    onSuccess: (_data, id) => invalidate(id),
  })
}
