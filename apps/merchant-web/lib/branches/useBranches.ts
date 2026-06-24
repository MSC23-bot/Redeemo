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
  createBranch,
  cancelPendingCreate,
  requestBranchClose,
  withdrawBranchClose,
  createBranchEditRequest,
  withdrawBranchEditRequest,
  sendBranchPin,
  requestBranchPhotoEdit,
  removeBranchPhoto,
  stageBranchHours,
  cancelPendingHours,
  setRedemptionAlerts,
  type Branch,
  type BranchCreateBody,
  type BranchUpdateBody,
  type BranchEditRequestBody,
} from '@/lib/api/branch'
import type { HoursPayloadRow } from '@/components/onboarding/branch/lib/hoursModel'

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

// PR-5 §6: create a branch (OWNER-only on the backend). The FIRST/main branch is
// created INSTANT-LIVE; every subsequent branch comes back lifecycleStatus
// PENDING_CREATE (customer-invisible, awaiting admin approval). Invalidating
// ['branches'] surfaces the new row; ['branch', id] primes the detail page so the
// awaiting-approval banner renders immediately. The caller surfaces the backend
// validation messages (e.g. POSTCODE_NOT_FOUND) calmly.
export function useCreateBranch() {
  const invalidate = useInvalidateBranch()
  return useMutation({
    mutationFn: (body: BranchCreateBody) => createBranch(body),
    onSuccess: (data) => invalidate(data.id),
  })
}

// PR-5 §4a: cancel a pending-create branch (OWNER-only). Hard-deletes the never-live
// branch + withdraws its BRANCH_CREATE approval. Invalidating drops the row from the
// list + the detail cache. A stale/missing pending (BRANCH_NOT_PENDING_CREATE /
// BRANCH_NOT_FOUND) surfaces as a mutation error the caller handles calmly.
export function useCancelPendingCreate() {
  const invalidate = useInvalidateBranch()
  return useMutation({
    mutationFn: (id: string) => cancelPendingCreate(id),
    onSuccess: (_data, id) => invalidate(id),
  })
}

// PR-5 §4b: request to close a branch (OWNER-only). The branch STAYS live; the backend
// sets lifecycleStatus PENDING_CLOSE + closeReason and creates a BRANCH_CLOSE approval.
// Invalidating ['branch', id] re-reads getBranch (now PENDING_CLOSE) so the pending-close
// banner appears. The backend BRANCH_IS_MAIN / BRANCH_LAST_ACTIVE / BRANCH_CLOSE_REQUEST_EXISTS
// errors surface to the caller (the close modal explains them calmly).
export function useRequestBranchClose() {
  const invalidate = useInvalidateBranch()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => requestBranchClose(id, reason),
    onSuccess: (data) => invalidate(data.id),
  })
}

// PR-5 §4b: withdraw a pending close request (OWNER-only). Reverts lifecycleStatus ->
// LIVE + clears closeReason + removes the BRANCH_CLOSE approval. Invalidating re-reads
// getBranch (now LIVE) so the pending-close banner disappears. A stale/missing request
// (BRANCH_CLOSE_REQUEST_NOT_FOUND) surfaces as a mutation error the caller handles calmly.
export function useWithdrawBranchClose() {
  const invalidate = useInvalidateBranch()
  return useMutation({
    mutationFn: (id: string) => withdrawBranchClose(id),
    onSuccess: (data) => invalidate(data.id),
  })
}

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

// PR-3 §7: submit a branch-photo add-via-review request (after the asset upload).
// Invalidates so the new "In review" thumbnail + counter appear immediately.
export function useRequestBranchPhotoEdit() {
  const invalidate = useInvalidateBranch()
  return useMutation({
    mutationFn: ({ id, addUrls }: { id: string; addUrls: string[] }) =>
      requestBranchPhotoEdit(id, addUrls),
    onSuccess: (_data, { id }) => invalidate(id),
  })
}

// PR-3 §7 / §6b: instant-remove an APPROVED branch photo by its row ID (owner-only
// on the backend). Invalidates so the live gallery drops the photo.
export function useRemoveBranchPhoto() {
  const invalidate = useInvalidateBranch()
  return useMutation({
    mutationFn: ({ id, photoId }: { id: string; photoId: string }) =>
      removeBranchPhoto(id, photoId),
    onSuccess: (_data, { id }) => invalidate(id),
  })
}

// PR-4 §6: STAGE an opening-hours change for the 2-hour customer cool-off. The edit
// does NOT go live immediately; the backend stages a durable pending row and a worker
// promotes it after the window. Invalidating ['branch', id] re-reads getBranch, whose
// payload now carries the pendingHours row, so the "goes live at" banner appears.
export function useStageBranchHours() {
  const invalidate = useInvalidateBranch()
  return useMutation({
    mutationFn: ({ id, hours }: { id: string; hours: HoursPayloadRow[] }) =>
      stageBranchHours(id, hours),
    onSuccess: (_data, { id }) => invalidate(id),
  })
}

// PR-4 §6: cancel/withdraw a staged opening-hours change before it promotes.
// Invalidating ['branch', id] re-reads getBranch (now with no pendingHours row) so the
// banner disappears. A stale/missing pending (PENDING_HOURS_NOT_FOUND, e.g. it already
// promoted) surfaces as a mutation error the caller handles calmly.
export function useCancelPendingHours() {
  const invalidate = useInvalidateBranch()
  return useMutation({
    mutationFn: (id: string) => cancelPendingHours(id),
    onSuccess: (_data, id) => invalidate(id),
  })
}

// PR-7 §6: set the per-branch redemption-alerts opt-in. Same branch-management WRITE
// boundary as the hours toggle (server-enforced: OWNER any / assigned BRANCH_MANAGER /
// STAFF denied; suspended -> MERCHANT_SUSPENDED). Invalidating ['branches'] + ['branch',
// id] re-reads the branch so the toggle reflects the persisted redemptionAlertsEnabled.
// The bound branchId is captured at hook-call time so the toggle mutates a single branch.
export function useSetRedemptionAlerts(branchId: string) {
  const invalidate = useInvalidateBranch()
  return useMutation({
    mutationFn: (enabled: boolean) => setRedemptionAlerts(branchId, enabled),
    onSuccess: () => invalidate(branchId),
  })
}
