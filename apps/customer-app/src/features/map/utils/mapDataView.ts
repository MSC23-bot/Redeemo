// PR-3 fixup-1 (2026-05-20) — Codex #1 regression hardening.
//
// Map renders `branches[]` from both `useInAreaBranches` (InAreaResponse)
// and `useSearch` with bbox (SearchResponse — when filters force a
// hybrid-hook flip).  Their meta envelopes differ:
//
//   - SearchResponse:  `meta` (merchant-aligned) + `branchMeta` (branch-
//                       aligned, optional) + `total` (merchant) +
//                       `totalBranches` (branch, optional)
//   - InAreaResponse:  `meta` (single shape; both arrays computed from
//                       the same MC-gated SQL — coherent by construction)
//
// When Map renders the BRANCH arm, the meta read MUST follow the branch
// side or we recreate the PR #112 meta/list-mismatch bug class for the
// `<MapEmptyArea>` empty-state classification + `<ViewportLocalityBadge>`.
// `branchMeta ?? meta` resolves cleanly in both cases:
//   - SearchResponse: prefers branchMeta (correct for branch arm)
//   - InAreaResponse: branchMeta is undefined → falls through to meta
//                     (correct — single coherent envelope on this route)
//
// Same pattern for `total`: `totalBranches ?? branches.length`.
//   - SearchResponse: prefers totalBranches when paginated
//   - InAreaResponse: totalBranches is undefined (route doesn't paginate,
//                     limit-capped) → falls through to branches.length

import type { BranchTile } from '@/lib/api/discovery'

type AnyMeta = {
  resolvedArea?:     string
  nearbyCount?:      number
  cityCount?:        number
  distantCount?:     number
  emptyStateReason?: 'none' | 'expanded_to_wider' | 'no_uk_supply'
  effectiveLocality?: { id: string; name: string } | null
}

type AnyResponse = {
  branches?:      BranchTile[]
  totalBranches?: number
  total?:         number
  meta?:          AnyMeta
  branchMeta?:    AnyMeta
}

export type MapDataView = {
  branches: BranchTile[]
  total:    number
  meta:     AnyMeta | undefined
}

/**
 * Extracts the branch-aligned view from either an InAreaResponse or a
 * SearchResponse-with-bbox.  Always returns `{ branches, total, meta }`
 * where meta is the BRANCH-aligned envelope when available (search-arm),
 * or the only envelope (in-area arm).
 */
export function mapDataView(data: unknown): MapDataView {
  const d = (data ?? undefined) as AnyResponse | undefined
  const branches = d?.branches ?? []
  return {
    branches,
    total: d?.totalBranches ?? branches.length,
    meta:  d?.branchMeta ?? d?.meta,
  }
}
