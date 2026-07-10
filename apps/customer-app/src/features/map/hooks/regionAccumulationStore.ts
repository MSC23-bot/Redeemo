// Map Phase 2 S2 — region-accumulation cache (the pan-back fix).
//
// The owner's twice-reported felt pain: pan Huddersfield → London → back,
// and Huddersfield's pins vanish for a beat before refetching. React
// Query's per-viewport cache (keyed on the quantized bbox, `useInAreaBranches`)
// already makes the SECOND visit to an unchanged viewport a cache hit
// once its `staleTime` (120s) hasn't expired — but a `useQuery` cache
// entry only renders when its OWN key is the one currently active. Pan
// away and the London bbox becomes the active key; Huddersfield's cached
// entry sits inert until the camera lands back on that EXACT quantized
// bbox again.
//
// This module is a small, map-scoped ACCUMULATION layer *on top of* that
// per-viewport cache: every successful viewport fetch also gets recorded
// here as a `{bbox, branches, fetchedAt}` tile. Rendering then reads the
// UNION of every stored tile that intersects the CURRENT raw viewport —
// so panning back to Huddersfield shows its pins the instant the camera
// re-enters that area, from this store, while `useInAreaBranches`
// refetches quietly underneath (React Query's own staleTime/refetch
// behaviour is untouched; this module never intercepts or replaces it).
//
// Design notes:
//   - Bounded FIFO/LRU store (`TILE_CAP` tiles) — a delete+re-set on
//     every write pushes the touched key to the end of the Map's
//     insertion order, so eviction (when over cap) drops the LEAST
//     recently written/re-confirmed tile, not strictly the oldest by
//     wall-clock. Good enough for a bounded "recently visited areas"
//     cache; a full LRU-on-read (also touching on GET) was considered
//     but rejected as unnecessary complexity for ~20 tiles.
//   - TTL (`TTL_MS`) — a tile older than this is never surfaced, even if
//     the store hasn't hit its cap. Prevents an old accumulated tile from
//     silently going stale-forever if the user never revisits it (which
//     would otherwise sit in the union render indefinitely since nothing
//     ever evicts a tile except the FIFO cap).
//   - Freshest tile wins per branch id when multiple stored tiles overlap
//     and both contain the same branch (e.g. two overlapping pans both
//     saw the same pin) — see `getAccumulatedBranches`.
//   - Honesty rule (owner lock): this store is populated ONLY from the
//     UNFILTERED in-area path. `MapScreen` only calls `recordAccumulatedTile`
//     when `hasNonScopeFilters === false`, and `useAccumulatedBranches`
//     bypasses the store entirely (returns the live query's branches
//     verbatim) whenever the hybrid hook has switched to the filtered
//     `/search` path. Accumulated pins from a PREVIOUS unfiltered fetch
//     must never bleed into a filtered view and imply they match the
//     active filters.
//   - Sign-out: `clearAccumulatedBranches()` is called from
//     `clearAllQueries()` in `lib/query-client.ts` so a subsequent user
//     session never renders the previous user's remembered pins (the
//     store lives outside React Query's cache, so it needs its own
//     explicit hook into that lifecycle).

import { quantizeBbox, type BoundingBox } from '../utils/bboxQuantize'
import type { BranchTile } from '@/lib/api/discovery'

export type AccumulatedTile = {
  key:       string
  bbox:      BoundingBox
  branches:  BranchTile[]
  fetchedAt: number
}

// Cap chosen so a session of realistic panning (a city centre + a
// handful of nearby town visits) fits comfortably without unbounded
// growth. Deliberately small — this is a "recently seen" cache, not a
// full offline dataset.
const TILE_CAP = 20

// 10 minutes — matches the "remembered but visibly refreshing" framing
// in the task brief. Long enough that a quick back-and-forth pan still
// benefits; short enough that a tile from earlier in a long session
// doesn't silently masquerade as current.
const TTL_MS = 10 * 60 * 1000

let store = new Map<string, AccumulatedTile>()

function tileKey(bbox: BoundingBox): string {
  return `${bbox.minLat}:${bbox.maxLat}:${bbox.minLng}:${bbox.maxLng}`
}

// Exported (not just an internal helper) — `useAccumulatedBranches` also
// uses this to decide whether the LIVE query's current data still
// belongs to the current viewport before merging it into the render
// union (see that hook's doc comment for why).
export function bboxesIntersect(a: BoundingBox, b: BoundingBox): boolean {
  return a.minLat <= b.maxLat && a.maxLat >= b.minLat && a.minLng <= b.maxLng && a.maxLng >= b.minLng
}

/**
 * Records one successful viewport fetch. `rawBbox` is quantized (same
 * 3dp grid as `useInAreaBranches`) before being used as the tile's key
 * AND stored bbox, so the tile's coverage always matches what the
 * backend actually guaranteed for that request (not a jittery raw
 * camera float).
 */
export function recordAccumulatedTile(rawBbox: BoundingBox, branches: BranchTile[], now = Date.now()): void {
  const bbox = quantizeBbox(rawBbox)
  const key  = tileKey(bbox)
  // Delete-then-set pushes this key to the end of the Map's insertion
  // order (JS Maps preserve insertion order) — cheap recency signal for
  // the FIFO/LRU-ish eviction below.
  store.delete(key)
  store.set(key, { key, bbox, branches, fetchedAt: now })
  while (store.size > TILE_CAP) {
    const oldestKey = store.keys().next().value
    if (oldestKey === undefined) break
    store.delete(oldestKey)
  }
}

/**
 * Returns the union of every non-expired stored tile that intersects
 * `viewportBbox`, deduped by branch id — the freshest tile's copy of a
 * branch wins when more than one overlapping tile contains it.
 */
export function getAccumulatedBranches(viewportBbox: BoundingBox, now = Date.now()): BranchTile[] {
  const merged = new Map<string, { branch: BranchTile; fetchedAt: number }>()
  for (const tile of store.values()) {
    if (now - tile.fetchedAt > TTL_MS) continue
    if (!bboxesIntersect(tile.bbox, viewportBbox)) continue
    for (const branch of tile.branches) {
      const existing = merged.get(branch.id)
      if (!existing || tile.fetchedAt >= existing.fetchedAt) {
        merged.set(branch.id, { branch, fetchedAt: tile.fetchedAt })
      }
    }
  }
  return Array.from(merged.values()).map((v) => v.branch)
}

/**
 * Wipes every stored tile. Called from `clearAllQueries()` (sign-out /
 * forced session-expiry) so a subsequent user can never see a previous
 * user's remembered pins — the store lives outside React Query's cache
 * so it isn't covered by `queryClient.clear()` alone.
 */
export function clearAccumulatedBranches(): void {
  store.clear()
}

// Test-only introspection — not part of the module's product-facing API.
export function __getAccumulatedTileCountForTests(): number {
  return store.size
}
