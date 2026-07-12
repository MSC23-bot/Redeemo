// Map Phase 2 S2 Task 1 — region-accumulation cache, store unit tests.
//
// `regionAccumulationStore` is a module-level singleton (intentionally —
// it must survive MapScreen remounts in production). `tests/setup.ts`
// resets it in a global `afterEach`, so no explicit reset is needed here,
// but each `it()` uses geographically distinct bboxes to stay
// order-independent regardless.

import {
  recordAccumulatedTile,
  getAccumulatedBranches,
  clearAccumulatedBranches,
  canonicalizeBranch,
  __getAccumulatedTileCountForTests,
} from '@/features/map/hooks/regionAccumulationStore'
import { makeBranchTile } from '../../fixtures/branchTile'

// Huddersfield-ish bbox
const huddersfieldBbox = { minLat: 53.64, maxLat: 53.66, minLng: -1.79, maxLng: -1.77 }
// London-ish bbox — does not intersect Huddersfield.
const londonBbox = { minLat: 51.49, maxLat: 51.51, minLng: -0.14, maxLng: -0.12 }

describe('regionAccumulationStore', () => {
  beforeEach(() => clearAccumulatedBranches())

  it('getAccumulatedBranches returns [] when the store is empty', () => {
    expect(getAccumulatedBranches(huddersfieldBbox)).toEqual([])
  })

  it('records a tile and surfaces its branches for an intersecting viewport', () => {
    const branch = makeBranchTile({ id: 'brn-hud-1' })
    recordAccumulatedTile(huddersfieldBbox, [branch])
    const result = getAccumulatedBranches(huddersfieldBbox)
    expect(result.map((b) => b.id)).toEqual(['brn-hud-1'])
  })

  it('does NOT surface a tile for a non-intersecting viewport', () => {
    const branch = makeBranchTile({ id: 'brn-hud-1' })
    recordAccumulatedTile(huddersfieldBbox, [branch])
    expect(getAccumulatedBranches(londonBbox)).toEqual([])
  })

  it('the pan-back scenario: Huddersfield tile survives a London detour and reappears on pan-back', () => {
    const huddersfieldBranch = makeBranchTile({ id: 'brn-hud-1' })
    const londonBranch       = makeBranchTile({ id: 'brn-ldn-1' })
    recordAccumulatedTile(huddersfieldBbox, [huddersfieldBranch])
    recordAccumulatedTile(londonBbox, [londonBranch])

    // Pan back to Huddersfield — its tile is still there, rendered from
    // the store WITHOUT needing a fresh fetch to resolve.
    const result = getAccumulatedBranches(huddersfieldBbox)
    expect(result.map((b) => b.id)).toEqual(['brn-hud-1'])
  })

  it('dedupes overlapping tiles by branch id, freshest tile wins', () => {
    const overlapA = { minLat: 51.49, maxLat: 51.51, minLng: -0.14, maxLng: -0.10 }
    const overlapB = { minLat: 51.49, maxLat: 51.51, minLng: -0.12, maxLng: -0.08 }
    const staleBranch = makeBranchTile({ id: 'shared', branchName: 'Old Name' })
    const freshBranch  = makeBranchTile({ id: 'shared', branchName: 'New Name' })

    recordAccumulatedTile(overlapA, [staleBranch], null, 1000)
    recordAccumulatedTile(overlapB, [freshBranch], null, 2000)

    // A viewport intersecting BOTH tiles must surface exactly one copy of
    // the shared branch — the freshest (fetchedAt=2000) one.
    const viewport = { minLat: 51.49, maxLat: 51.51, minLng: -0.13, maxLng: -0.09 }
    const result = getAccumulatedBranches(viewport, null, 3000)
    expect(result).toHaveLength(1)
    expect(result[0]!.branchName).toBe('New Name')
  })

  it('expires a tile past the TTL (10 minutes)', () => {
    const branch = makeBranchTile({ id: 'brn-hud-1' })
    const recordedAt = 0
    recordAccumulatedTile(huddersfieldBbox, [branch], null, recordedAt)

    // Just under 10 minutes — still fresh.
    expect(getAccumulatedBranches(huddersfieldBbox, null, 9 * 60 * 1000).length).toBe(1)

    // Just over 10 minutes — expired, no longer surfaced.
    expect(getAccumulatedBranches(huddersfieldBbox, null, 11 * 60 * 1000).length).toBe(0)
  })

  it('caps the store at 20 tiles (FIFO eviction of the least-recently-written tile)', () => {
    for (let i = 0; i < 25; i++) {
      const bbox = { minLat: i, maxLat: i + 0.01, minLng: i, maxLng: i + 0.01 }
      recordAccumulatedTile(bbox, [makeBranchTile({ id: `brn-${i}` })])
    }
    expect(__getAccumulatedTileCountForTests()).toBe(20)

    // The earliest-written tiles (0..4) were evicted; tile 0's branch is
    // no longer surfaced even though its own bbox still "exists".
    const evictedBbox = { minLat: 0, maxLat: 0.01, minLng: 0, maxLng: 0.01 }
    expect(getAccumulatedBranches(evictedBbox)).toEqual([])

    // The most recently written tile (24) is still present.
    const survivingBbox = { minLat: 24, maxLat: 24.01, minLng: 24, maxLng: 24.01 }
    expect(getAccumulatedBranches(survivingBbox).map((b) => b.id)).toEqual(['brn-24'])
  })

  it('re-recording the SAME bbox refreshes its recency (does not create a duplicate tile)', () => {
    recordAccumulatedTile(huddersfieldBbox, [makeBranchTile({ id: 'brn-hud-1' })], null, 1000)
    recordAccumulatedTile(huddersfieldBbox, [makeBranchTile({ id: 'brn-hud-1', branchName: 'Refreshed' })], null, 5000)
    expect(__getAccumulatedTileCountForTests()).toBe(1)
    const result = getAccumulatedBranches(huddersfieldBbox, null, 5000)
    expect(result).toHaveLength(1)
    expect(result[0]!.branchName).toBe('Refreshed')
  })

  it('clearAccumulatedBranches wipes every stored tile (sign-out lifecycle)', () => {
    recordAccumulatedTile(huddersfieldBbox, [makeBranchTile({ id: 'brn-hud-1' })])
    expect(__getAccumulatedTileCountForTests()).toBe(1)
    clearAccumulatedBranches()
    expect(__getAccumulatedTileCountForTests()).toBe(0)
    expect(getAccumulatedBranches(huddersfieldBbox)).toEqual([])
  })

  it('recording quantizes the raw bbox before storing (matches useInAreaBranches request coverage)', () => {
    // floor/ceil to 3dp: quantized = {minLat:53.6, maxLat:53.65, minLng:-1.801, maxLng:-1.75}
    const rawBbox = { minLat: 53.6001, maxLat: 53.6499, minLng: -1.8001, maxLng: -1.7501 }
    recordAccumulatedTile(rawBbox, [makeBranchTile({ id: 'brn-hud-1' })])
    // A viewport that sits ONLY in the outward-rounded quantization
    // margin (between the quantized minLng -1.801 and the raw minLng
    // -1.8001) — it intersects the QUANTIZED stored bbox but would NOT
    // intersect the raw one, proving the store quantizes before
    // keying/storing (mirrors `useInAreaBranches`'s request coverage —
    // mins floored, maxs ceiled, never shrunk).
    const quantizedOnlyViewport = { minLat: 53.61, maxLat: 53.62, minLng: -1.8009, maxLng: -1.8002 }
    expect(getAccumulatedBranches(quantizedOnlyViewport).map((b) => b.id)).toEqual(['brn-hud-1'])
  })

  // ──────────────────────────────────────────────────────────────────────
  // Map P2 W1.1 (F12) — category-namespaced tiles.
  //
  // Walkthrough F12: with the Restaurant subcategory filter active, a
  // Gift Shop pin still rendered. Tiles were keyed by bbox only, so a
  // tile fetched under "All" (or another category) kept contributing its
  // non-matching branches to the render union. Tiles are now namespaced
  // by the categoryId the fetch was made WITH (null = "All").
  // ──────────────────────────────────────────────────────────────────────
  describe('F12: category namespacing', () => {
    it('a tile recorded under "All" (null) is NOT surfaced while a category filter is active', () => {
      // The exact owner-screenshot shape: a Gift Shop branch cached from
      // unfiltered browsing must not leak into the Restaurant view.
      recordAccumulatedTile(huddersfieldBbox, [makeBranchTile({ id: 'brn-gift-shop' })], null)
      expect(getAccumulatedBranches(huddersfieldBbox, 'cat-restaurant')).toEqual([])
    })

    it('a tile recorded under one category is NOT surfaced under another category', () => {
      recordAccumulatedTile(huddersfieldBbox, [makeBranchTile({ id: 'brn-gift-shop' })], 'cat-gift')
      expect(getAccumulatedBranches(huddersfieldBbox, 'cat-restaurant')).toEqual([])
      expect(getAccumulatedBranches(huddersfieldBbox, null)).toEqual([])
    })

    it('switching BACK to a previously-browsed category still gets its warm per-category cache', () => {
      recordAccumulatedTile(huddersfieldBbox, [makeBranchTile({ id: 'brn-rest-1' })], 'cat-restaurant')
      recordAccumulatedTile(huddersfieldBbox, [makeBranchTile({ id: 'brn-all-1' })], null)
      // Browse restaurant -> All -> back to restaurant: the restaurant
      // namespace still serves instantly, and only ITS branches.
      expect(getAccumulatedBranches(huddersfieldBbox, 'cat-restaurant').map((b) => b.id)).toEqual(['brn-rest-1'])
      expect(getAccumulatedBranches(huddersfieldBbox, null).map((b) => b.id)).toEqual(['brn-all-1'])
    })

    it('the SAME bbox under different categories stores distinct tiles (no key collision)', () => {
      recordAccumulatedTile(huddersfieldBbox, [makeBranchTile({ id: 'brn-a' })], 'cat-a')
      recordAccumulatedTile(huddersfieldBbox, [makeBranchTile({ id: 'brn-b' })], 'cat-b')
      expect(__getAccumulatedTileCountForTests()).toBe(2)
    })

    it('a category id that is a prefix of another does not cross-match (delimiter safety)', () => {
      recordAccumulatedTile(huddersfieldBbox, [makeBranchTile({ id: 'brn-a' })], 'cat-1')
      expect(getAccumulatedBranches(huddersfieldBbox, 'cat-12')).toEqual([])
    })

    it('TTL applies unchanged inside a category namespace', () => {
      recordAccumulatedTile(huddersfieldBbox, [makeBranchTile({ id: 'brn-a' })], 'cat-a', 0)
      expect(getAccumulatedBranches(huddersfieldBbox, 'cat-a', 9 * 60 * 1000)).toHaveLength(1)
      expect(getAccumulatedBranches(huddersfieldBbox, 'cat-a', 11 * 60 * 1000)).toHaveLength(0)
    })

    it('the 20-tile cap is GLOBAL across namespaces: eviction drops the oldest tile regardless of category', () => {
      // 10 "All" tiles first, then 15 category tiles: total 25 recorded,
      // cap 20, so the 5 OLDEST (all from the "All" namespace) evict even
      // though the category namespace alone is under the cap.
      for (let i = 0; i < 10; i++) {
        const bbox = { minLat: i, maxLat: i + 0.01, minLng: i, maxLng: i + 0.01 }
        recordAccumulatedTile(bbox, [makeBranchTile({ id: `brn-all-${i}` })], null)
      }
      for (let i = 0; i < 15; i++) {
        const bbox = { minLat: 40 + i, maxLat: 40 + i + 0.01, minLng: 40 + i, maxLng: 40 + i + 0.01 }
        recordAccumulatedTile(bbox, [makeBranchTile({ id: `brn-cat-${i}` })], 'cat-a')
      }
      expect(__getAccumulatedTileCountForTests()).toBe(20)
      // Oldest "All" tiles (0..4) evicted; "All" tile 5 survives.
      expect(getAccumulatedBranches({ minLat: 0, maxLat: 0.01, minLng: 0, maxLng: 0.01 }, null)).toEqual([])
      expect(getAccumulatedBranches({ minLat: 5, maxLat: 5.01, minLng: 5, maxLng: 5.01 }, null).map((b) => b.id)).toEqual(['brn-all-5'])
      // Every category tile survives (they are the 15 newest).
      expect(getAccumulatedBranches({ minLat: 40, maxLat: 40.01, minLng: 40, maxLng: 40.01 }, 'cat-a').map((b) => b.id)).toEqual(['brn-cat-0'])
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // Map P2 W1.1 (F13) — canonical branch identity.
  //
  // A tile refresh used to replace every branch object with a freshly
  // parsed copy (same id, new reference), re-rendering memoized frozen
  // markers (the residual F1 teleport). The store now interns a canonical
  // object per branch id and reuses it while render-relevant content is
  // unchanged.
  // ──────────────────────────────────────────────────────────────────────
  describe('F13: canonical branch identity', () => {
    it('a tile refresh with render-identical payload preserves the previous object reference', () => {
      const original = makeBranchTile({ id: 'brn-hud-1', branchName: 'Karaara' })
      recordAccumulatedTile(huddersfieldBbox, [original], null, 1000)
      // Refetch delivers a NEW object with identical render-relevant content
      // (fresh zod parse -> fresh reference; the F13 churn shape).
      const refreshedCopy = makeBranchTile({ id: 'brn-hud-1', branchName: 'Karaara' })
      expect(refreshedCopy).not.toBe(original)
      recordAccumulatedTile(huddersfieldBbox, [refreshedCopy], null, 2000)

      const result = getAccumulatedBranches(huddersfieldBbox, null, 2000)
      expect(result).toHaveLength(1)
      expect(result[0]).toBe(original) // SAME reference: memoized markers bail out
    })

    it('a genuine render-relevant content change swaps to the new object reference', () => {
      const original = makeBranchTile({ id: 'brn-hud-1', branchName: 'Karaara' })
      recordAccumulatedTile(huddersfieldBbox, [original], null, 1000)
      const renamed = makeBranchTile({ id: 'brn-hud-1', branchName: 'Karaara Renamed' })
      recordAccumulatedTile(huddersfieldBbox, [renamed], null, 2000)

      const result = getAccumulatedBranches(huddersfieldBbox, null, 2000)
      expect(result).toHaveLength(1)
      expect(result[0]).toBe(renamed)
      expect(result[0]!.branchName).toBe('Karaara Renamed')
    })

    it('identity is stable across OVERLAPPING tiles containing the same branch (freshest-wins no longer flips references)', () => {
      const overlapA = { minLat: 51.49, maxLat: 51.51, minLng: -0.14, maxLng: -0.10 }
      const overlapB = { minLat: 51.49, maxLat: 51.51, minLng: -0.12, maxLng: -0.08 }
      const original = makeBranchTile({ id: 'shared', branchName: 'Same Content' })
      const copy     = makeBranchTile({ id: 'shared', branchName: 'Same Content' })
      recordAccumulatedTile(overlapA, [original], null, 1000)
      recordAccumulatedTile(overlapB, [copy], null, 2000)
      const viewport = { minLat: 51.49, maxLat: 51.51, minLng: -0.13, maxLng: -0.09 }
      const result = getAccumulatedBranches(viewport, null, 3000)
      expect(result).toHaveLength(1)
      // The fresher tile B interned to the SAME canonical object, so the
      // freshest-wins merge cannot flip the reference under the marker.
      expect(result[0]).toBe(original)
    })

    it('canonicalizeBranch (render-time, non-mutating): returns the canonical reference for an equal copy, the given copy for changed content', () => {
      const original = makeBranchTile({ id: 'brn-live', branchName: 'Live One' })
      recordAccumulatedTile(huddersfieldBbox, [original], null, 1000)

      const equalCopy = makeBranchTile({ id: 'brn-live', branchName: 'Live One' })
      expect(canonicalizeBranch(equalCopy)).toBe(original)

      const changedCopy = makeBranchTile({ id: 'brn-live', branchName: 'Live One Renamed' })
      expect(canonicalizeBranch(changedCopy)).toBe(changedCopy)
      // Non-mutating: the canonical registry still holds the original, so
      // an equal copy STILL canonicalises to it afterwards.
      expect(canonicalizeBranch(equalCopy)).toBe(original)
    })

    it('viewport-relative field changes alone (distance) deliberately KEEP the previous object (F6 family exclusion)', () => {
      const original = makeBranchTile({ id: 'brn-hud-1', distance: 500, distanceMetres: 500 })
      recordAccumulatedTile(huddersfieldBbox, [original], null, 1000)
      const movedCameraCopy = makeBranchTile({ id: 'brn-hud-1', distance: 90, distanceMetres: 90 })
      recordAccumulatedTile(huddersfieldBbox, [movedCameraCopy], null, 2000)
      const result = getAccumulatedBranches(huddersfieldBbox, null, 2000)
      expect(result[0]).toBe(original)
    })

    it('clearAccumulatedBranches also wipes the canonical registry (sign-out isolation)', () => {
      const original = makeBranchTile({ id: 'brn-hud-1' })
      recordAccumulatedTile(huddersfieldBbox, [original], null, 1000)
      clearAccumulatedBranches()
      const postClearCopy = makeBranchTile({ id: 'brn-hud-1' })
      // No canonical entry survives sign-out: the copy is returned as-is.
      expect(canonicalizeBranch(postClearCopy)).toBe(postClearCopy)
    })
  })
})
