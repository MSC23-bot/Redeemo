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
//
// Map P2 W1.1 (F12): the cap stays GLOBAL across category namespaces
// (see `tileKey`) so total memory stays bounded no matter how many
// categories a session browses; eviction drops the least-recently-
// written tile REGARDLESS of which namespace it belongs to.
const TILE_CAP = 20

// 10 minutes — matches the "remembered but visibly refreshing" framing
// in the task brief. Long enough that a quick back-and-forth pan still
// benefits; short enough that a tile from earlier in a long session
// doesn't silently masquerade as current.
const TTL_MS = 10 * 60 * 1000

let store = new Map<string, AccumulatedTile>()

// ── Map P2 W1.1 (F12) — category-namespaced tile keys ────────────────
//
// Walkthrough F12: with the Restaurant subcategory filter active, a
// Gift Shop pin still rendered. Root cause: `categoryId` is deliberately
// NOT a non-scope filter (both the in-area route and /search accept it),
// so the unfiltered in-area path + this accumulation layer stay enabled
// while a category filter is active. The in-area QUERY carries
// `categoryId` (fresh fetches are correctly filtered), but tiles here
// were keyed by bbox ONLY — so a tile fetched under "All" (or another
// category) kept contributing its non-matching branches to the render
// union.
//
// Fix at this seam: the active `categoryId` becomes part of the tile
// key (null = the "All" namespace). Reads only union tiles from the
// active category's namespace, so switching category never mixes cached
// branches across categories, and switching BACK to a previously-
// browsed category still gets its warm per-category cache. The
// filter-mode honesty lock for NON-scope filters is untouched: the hook
// still bypasses this store entirely when `/search` is active.
function tileKey(categoryId: string | null, bbox: BoundingBox): string {
  return `${categoryId ?? 'all'}|${bbox.minLat}:${bbox.maxLat}:${bbox.minLng}:${bbox.maxLng}`
}

// ── Map P2 W1.1 (F13) — canonical branch identity ────────────────────
//
// Walkthrough F13 (residual F1 teleport): the W1 marker memoization
// assumed stable branch OBJECT identity, but this store rebuilt branch
// objects whenever a tile refreshed (`store.set` on refetch replaces
// `tile.branches` with freshly parsed objects; the freshest-wins merge
// can also flip which tile's copy of a branch wins). Same id, new
// reference: the memoized frozen marker re-rendered and could still
// teleport.
//
// Fix layer 1 (layer 2 is MapPins' primitive-field memo comparator):
// keep ONE canonical object per branch id. When a refreshed tile
// delivers a branch whose RENDER-RELEVANT content is unchanged, reuse
// the previous object reference; only swap the reference when content
// genuinely changed.
//
// RENDER-RELEVANT fields (everything the pin / name chip / carousel
// card / list row actually consume from an accumulated tile):
//   - id
//   - branchLatitude / branchLongitude   (pin + chip position, camera)
//   - branchName                          (chip label, card/list title)
//   - merchant.primaryCategory?.id        (glyph + colour tree-walk key)
//   - merchant.primaryCategory?.pinColour (pin colour, chip dot)
//   - merchant.voucherCount               (carousel aggregate line; the
//                                          W2 ticket lockup)
//   - merchant.maxEstimatedSaving         (card save)
//   - merchant.totalEstimatedSaving       (lockup "Save £X" per owner
//                                          decision 2026-07-18 W2a R4;
//                                          carousel aggregate savings)
//   - isOpenNow / closesAtLocal           (open-hours summary on cards)
//
// DELIBERATELY EXCLUDED (a change in these alone keeps the OLD object):
//   - distance / distanceMetres / proximityBand / supplyRung: viewport-
//     relative outputs that change on every refetch from a different
//     camera position (the F6 family). Including them would hand every
//     refresh a new reference and defeat identity stabilisation
//     entirely; keeping the previous object's values is no less honest
//     while F6's user-relative distance fix is pending.
//   - isFavourited: hearts are owned by the favourites query cache
//     (FavouriteHeart/useFavourite), updated optimistically app-wide;
//     the tile snapshot is only a seed.
//   - avgRating / reviewCount / matchContext / highlights / descriptor
//     and other card copy: slow-moving; a stale beat until the next
//     genuine content change is far cheaper than re-rendering frozen
//     markers on every refetch.
function renderRelevantEqual(a: BranchTile, b: BranchTile): boolean {
  return (
    a.id === b.id &&
    a.branchLatitude === b.branchLatitude &&
    a.branchLongitude === b.branchLongitude &&
    a.branchName === b.branchName &&
    (a.merchant.primaryCategory?.id ?? null) === (b.merchant.primaryCategory?.id ?? null) &&
    (a.merchant.primaryCategory?.pinColour ?? null) === (b.merchant.primaryCategory?.pinColour ?? null) &&
    a.merchant.voucherCount === b.merchant.voucherCount &&
    a.merchant.maxEstimatedSaving === b.merchant.maxEstimatedSaving &&
    a.merchant.totalEstimatedSaving === b.merchant.totalEstimatedSaving &&
    a.isOpenNow === b.isOpenNow &&
    a.closesAtLocal === b.closesAtLocal
  )
}

// One canonical object per branch id. Written only from the record path
// (`internBranch`); pruned when tiles are evicted so it never outgrows
// the branches the capped tile store actually references.
const canonicalById = new Map<string, BranchTile>()

// Record-path interning (MUTATES the registry): returns the canonical
// reference when the incoming copy is render-equivalent, else promotes
// the incoming object to be the new canonical one.
function internBranch(branch: BranchTile): BranchTile {
  const prev = canonicalById.get(branch.id)
  if (prev && renderRelevantEqual(prev, branch)) return prev
  canonicalById.set(branch.id, branch)
  return branch
}

/**
 * Pure (non-mutating) canonical lookup for RENDER-time use: returns the
 * canonical reference when one exists and is render-equivalent to the
 * given copy, else the given copy unchanged. `useAccumulatedBranches`
 * maps the LIVE query's branches through this in its render union, so a
 * live refetch (or a pan onto a different quantized-bbox cache entry)
 * that changed nothing render-relevant hands the marker layer the SAME
 * references it already froze bitmaps for.
 */
export function canonicalizeBranch(branch: BranchTile): BranchTile {
  const prev = canonicalById.get(branch.id)
  if (prev && renderRelevantEqual(prev, branch)) return prev
  return branch
}

// Drop canonical entries no longer referenced by any stored tile (run
// after evictions so the registry stays bounded by the tile cap).
function pruneCanonical(): void {
  const referenced = new Set<string>()
  for (const tile of store.values()) {
    for (const b of tile.branches) referenced.add(b.id)
  }
  for (const id of canonicalById.keys()) {
    if (!referenced.has(id)) canonicalById.delete(id)
  }
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
 *
 * Map P2 W1.1: `categoryId` (F12) is the category the fetch was made
 * WITH (null = unfiltered "All") — it namespaces the tile key. The
 * branches are interned through the canonical registry (F13) so an
 * unchanged branch keeps its previous object reference across refreshes.
 */
export function recordAccumulatedTile(
  rawBbox:    BoundingBox,
  branches:   BranchTile[],
  categoryId: string | null = null,
  now = Date.now(),
): void {
  const bbox = quantizeBbox(rawBbox)
  const key  = tileKey(categoryId, bbox)
  // Delete-then-set pushes this key to the end of the Map's insertion
  // order (JS Maps preserve insertion order) — cheap recency signal for
  // the FIFO/LRU-ish eviction below.
  store.delete(key)
  store.set(key, { key, bbox, branches: branches.map(internBranch), fetchedAt: now })
  let evicted = false
  while (store.size > TILE_CAP) {
    const oldestKey = store.keys().next().value
    if (oldestKey === undefined) break
    store.delete(oldestKey)
    evicted = true
  }
  if (evicted) pruneCanonical()
}

/**
 * Returns the union of every non-expired stored tile in the ACTIVE
 * category's namespace (F12: null = "All") that intersects
 * `viewportBbox`, deduped by branch id — the freshest tile's copy of a
 * branch wins when more than one overlapping tile contains it.
 */
export function getAccumulatedBranches(
  viewportBbox: BoundingBox,
  categoryId:   string | null = null,
  now = Date.now(),
): BranchTile[] {
  const namespace = `${categoryId ?? 'all'}|`
  const merged = new Map<string, { branch: BranchTile; fetchedAt: number }>()
  for (const tile of store.values()) {
    if (!tile.key.startsWith(namespace)) continue
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
 * Wipes every stored tile (and the F13 canonical-identity registry).
 * Called from `clearAllQueries()` (sign-out / forced session-expiry) so
 * a subsequent user can never see a previous user's remembered pins —
 * the store lives outside React Query's cache so it isn't covered by
 * `queryClient.clear()` alone.
 */
export function clearAccumulatedBranches(): void {
  store.clear()
  canonicalById.clear()
}

// Test-only introspection — not part of the module's product-facing API.
export function __getAccumulatedTileCountForTests(): number {
  return store.size
}
