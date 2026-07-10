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

    recordAccumulatedTile(overlapA, [staleBranch], 1000)
    recordAccumulatedTile(overlapB, [freshBranch], 2000)

    // A viewport intersecting BOTH tiles must surface exactly one copy of
    // the shared branch — the freshest (fetchedAt=2000) one.
    const viewport = { minLat: 51.49, maxLat: 51.51, minLng: -0.13, maxLng: -0.09 }
    const result = getAccumulatedBranches(viewport, 3000)
    expect(result).toHaveLength(1)
    expect(result[0]!.branchName).toBe('New Name')
  })

  it('expires a tile past the TTL (10 minutes)', () => {
    const branch = makeBranchTile({ id: 'brn-hud-1' })
    const recordedAt = 0
    recordAccumulatedTile(huddersfieldBbox, [branch], recordedAt)

    // Just under 10 minutes — still fresh.
    expect(getAccumulatedBranches(huddersfieldBbox, 9 * 60 * 1000).length).toBe(1)

    // Just over 10 minutes — expired, no longer surfaced.
    expect(getAccumulatedBranches(huddersfieldBbox, 11 * 60 * 1000).length).toBe(0)
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
    recordAccumulatedTile(huddersfieldBbox, [makeBranchTile({ id: 'brn-hud-1' })], 1000)
    recordAccumulatedTile(huddersfieldBbox, [makeBranchTile({ id: 'brn-hud-1', branchName: 'Refreshed' })], 5000)
    expect(__getAccumulatedTileCountForTests()).toBe(1)
    const result = getAccumulatedBranches(huddersfieldBbox, 5000)
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
})
