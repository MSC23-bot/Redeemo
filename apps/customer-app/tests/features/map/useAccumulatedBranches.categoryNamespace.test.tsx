// Map P2 W1.1 (F12 + F13) — hook-level coverage for the category-
// namespaced accumulation and the canonical-identity live merge.
//
// The store's own unit coverage lives in regionAccumulationStore.test.ts;
// this file exercises the HOOK seam: the frozen liveResultCategoryId
// pairing (keepPreviousData race), the cross-category live-merge gate,
// and the canonicalisation of live branches in the render union. The
// full MapScreen integration is covered by MapScreen.accumulation.test.tsx.

import { renderHook } from '@testing-library/react-native'
import { useAccumulatedBranches } from '@/features/map/hooks/useAccumulatedBranches'
import { makeBranchTile } from '../../fixtures/branchTile'
import type { BranchTile } from '@/lib/api/discovery'

// Huddersfield-ish bbox (used as both fetch and viewport bbox: the hook
// distinguishes them only for the pan-race case, not exercised here).
const bbox = { minLat: 53.64, maxLat: 53.66, minLng: -1.79, maxLng: -1.77 }

type HookProps = {
  liveBranches: BranchTile[] | undefined
  categoryId:   string | null
}

function renderAccumulation(initial: HookProps) {
  return renderHook(
    ({ liveBranches, categoryId }: HookProps) =>
      useAccumulatedBranches(bbox, bbox, liveBranches, true, categoryId),
    { initialProps: initial },
  )
}

describe('useAccumulatedBranches — F12 category namespacing at the hook seam', () => {
  it('the owner-screenshot scenario: a Gift Shop branch cached under "All" does not render under the Restaurant filter (even mid-keepPreviousData)', () => {
    const giftShop = makeBranchTile({ id: 'brn-gift', branchName: 'The Kraft Store' })
    const allLive = [giftShop]

    // 1. Unfiltered browse: live fetch under "All" renders + records.
    const { result, rerender } = renderAccumulation({ liveBranches: allLive, categoryId: null })
    expect(result.current.map((b) => b.id)).toEqual(['brn-gift'])

    // 2. User taps the Restaurant category. keepPreviousData means the
    //    live query STILL holds the old "All" result (same array ref)
    //    while the filtered fetch is in flight. Pre-W1.1 this window plus
    //    the bbox-only tile keys leaked the Gift Shop pin into the
    //    Restaurant view (F12). Now: the accumulated union reads the
    //    empty 'cat-restaurant' namespace, and the stale live data is
    //    excluded because it was fetched FOR a different category.
    rerender({ liveBranches: allLive, categoryId: 'cat-restaurant' })
    expect(result.current).toEqual([])

    // 3. The Restaurant fetch lands (new array): renders + records under
    //    the restaurant namespace.
    const restaurant = makeBranchTile({ id: 'brn-rest', branchName: 'Karaara' })
    const restaurantLive = [restaurant]
    rerender({ liveBranches: restaurantLive, categoryId: 'cat-restaurant' })
    expect(result.current.map((b) => b.id)).toEqual(['brn-rest'])

    // 4. Switch BACK to "All" (live still holds the restaurant result
    //    during its own in-flight window): the warm "All" namespace
    //    serves the Gift Shop instantly; the restaurant live data is
    //    excluded from the union until its All-fetch lands (it was
    //    fetched FOR cat-restaurant), so nothing cross-category mixes.
    rerender({ liveBranches: restaurantLive, categoryId: null })
    expect(result.current.map((b) => b.id)).toEqual(['brn-gift'])
  })

  it('switching back to a previously-browsed category serves its OWN warm namespace', () => {
    const restaurantLive = [makeBranchTile({ id: 'brn-rest' })]
    const { result, rerender } = renderAccumulation({ liveBranches: restaurantLive, categoryId: 'cat-restaurant' })
    expect(result.current.map((b) => b.id)).toEqual(['brn-rest'])

    const giftLive = [makeBranchTile({ id: 'brn-gift' })]
    rerender({ liveBranches: giftLive, categoryId: 'cat-gift' })
    expect(result.current.map((b) => b.id)).toEqual(['brn-gift'])

    // Back to restaurant: keepPreviousData means the live query STILL
    // holds the gift result (SAME array reference: passing a fresh
    // array here would wrongly simulate a landed restaurant fetch). The
    // warm restaurant namespace serves; the stale gift live data is
    // correctly excluded (it was fetched FOR cat-gift).
    rerender({ liveBranches: giftLive, categoryId: 'cat-restaurant' })
    expect(result.current.map((b) => b.id)).toEqual(['brn-rest'])
  })
})

describe('useAccumulatedBranches — F13 canonical identity through the live merge', () => {
  it('a live refetch delivering a content-identical NEW object surfaces the PREVIOUS canonical reference', () => {
    const original = makeBranchTile({ id: 'brn-1', branchName: 'Karaara' })
    const { result, rerender } = renderAccumulation({ liveBranches: [original], categoryId: null })
    expect(result.current[0]).toBe(original)

    // Refetch: fresh parse, identical render-relevant content.
    const clone = makeBranchTile({ id: 'brn-1', branchName: 'Karaara' })
    expect(clone).not.toBe(original)
    rerender({ liveBranches: [clone], categoryId: null })

    expect(result.current).toHaveLength(1)
    expect(result.current[0]).toBe(original) // canonical reference reused
  })

  it('a live refetch with genuinely changed content surfaces the NEW object', () => {
    const original = makeBranchTile({ id: 'brn-1', branchName: 'Karaara' })
    const { result, rerender } = renderAccumulation({ liveBranches: [original], categoryId: null })

    const renamed = makeBranchTile({ id: 'brn-1', branchName: 'Karaara Renamed' })
    rerender({ liveBranches: [renamed], categoryId: null })

    expect(result.current).toHaveLength(1)
    expect(result.current[0]!.branchName).toBe('Karaara Renamed')
  })
})
