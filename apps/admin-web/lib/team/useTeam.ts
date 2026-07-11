'use client'

/**
 * useTeam: React Query hooks for the Team & Roles admin-web screen (S2).
 *
 *   useTeamRoster       : the roster read (GET /admin/team). `enabled` is
 *                         gated by the caller on `can('admin:manage-team')`
 *                         so a role without the capability never fires the
 *                         request — the backend `requireAdminCapability`
 *                         stays the enforcement.
 *   useCreateAdmin       : create an admin account. Invalidates the roster on
 *                         success (a new row appears without a manual refetch).
 *   useSetAdminRole      : change an admin's base role.
 *   useDeactivateAdmin   : deactivate an admin account.
 *   useGrantCapability   : grant a curated capability.
 *   useRevokeCapability  : revoke an active capability grant.
 *
 * The mutations mirror useMerchantActions.ts's invalidation convention: on
 * SUCCESS the roster is invalidated so the new state renders; on ERROR it is
 * ALSO invalidated for setRole/deactivate/grant/revoke (a stale-state error —
 * e.g. ADMIN_NOT_FOUND, GRANT_NOT_FOUND — means the server state moved on, so
 * the UI should refetch). create does not invalidate on error: nothing was
 * created, so there is nothing stale to resync.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { teamApi } from '@/lib/api/team'
import type {
  AssignableRole,
  CreateAdminAccountInput,
  CreateAdminResponse,
  DeactivateResponse,
  GrantResponse,
  ListTeamResponse,
  RevokeResponse,
  SetRoleResponse,
} from '@/lib/api/team'

export const TEAM_KEY = ['admin-team'] as const

export type UseTeamRosterResult = {
  data: ListTeamResponse | undefined
  isLoading: boolean
  isError: boolean
  isFetching: boolean
  refetch: () => void
}

export function useTeamRoster(options?: { enabled?: boolean }): UseTeamRosterResult {
  const query = useQuery({
    queryKey: TEAM_KEY,
    queryFn: () => teamApi.list(),
    enabled: options?.enabled ?? true,
    placeholderData: (prev) => prev,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: query.refetch,
  }
}

function useInvalidateTeam() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: TEAM_KEY })
  }
}

export function useCreateAdmin() {
  const invalidate = useInvalidateTeam()
  return useMutation<CreateAdminResponse, Error, CreateAdminAccountInput>({
    mutationFn: (input) => teamApi.create(input),
    onSuccess: invalidate,
  })
}

export function useSetAdminRole(adminId: string) {
  const invalidate = useInvalidateTeam()
  return useMutation<SetRoleResponse, Error, AssignableRole>({
    mutationFn: (role) => teamApi.setRole(adminId, role),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export function useDeactivateAdmin(adminId: string) {
  const invalidate = useInvalidateTeam()
  return useMutation<DeactivateResponse, Error, void>({
    mutationFn: () => teamApi.deactivate(adminId),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export function useGrantCapability(adminId: string) {
  const invalidate = useInvalidateTeam()
  return useMutation<GrantResponse, Error, string>({
    mutationFn: (capability) => teamApi.grant(adminId, capability),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export function useRevokeCapability(adminId: string) {
  const invalidate = useInvalidateTeam()
  return useMutation<RevokeResponse, Error, string>({
    mutationFn: (capability) => teamApi.revoke(adminId, capability),
    onSuccess: invalidate,
    onError: invalidate,
  })
}
