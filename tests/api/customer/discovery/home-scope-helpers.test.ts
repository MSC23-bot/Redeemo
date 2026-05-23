// tests/api/customer/discovery/home-scope-helpers.test.ts
import { describe, it, expect } from 'vitest'
import { resolveScopeForHomeRail, appendStrictLocalityTail, appendPermissiveTail } from '../../../../src/api/customer/discovery/homeScope'
import type { SupplyRung } from '../../../../src/api/lib/ladderProfiles'

const empty: Record<SupplyRung, number> = {
  NEARBY: 0, CATCHMENT: 0, POST_TOWN: 0, LAD: 0, COUNTY: 0, REGION: 0, COUNTRY: 0, NATIONAL: 0,
}

describe('resolveScopeForHomeRail', () => {
  it('featured local supply → no cascade, scope=city', () => {
    const res = resolveScopeForHomeRail('featured', { ...empty, NEARBY: 1 })
    expect(res.scopeExpanded).toBe(false)
    expect(res.scope).toBe('city')
    expect(res.retainedRungs.has('NEARBY')).toBe(true)
    expect(res.retainedRungs.has('LAD')).toBe(false)
  })
  it('featured no local but distant supply → cascade, scope=platform', () => {
    const res = resolveScopeForHomeRail('featured', { ...empty, COUNTY: 1 })
    expect(res.scopeExpanded).toBe(true)
    expect(res.scope).toBe('platform')
    expect(res.retainedRungs.has('COUNTY')).toBe(true)
  })
  it('featured no supply at all → sentinel (caller hides rail)', () => {
    const res = resolveScopeForHomeRail('featured', empty)
    expect(res.scope).toBe('city')
    expect(res.scopeExpanded).toBe(false)
  })
  it('trending strict NEARBY+CITY, no cascade', () => {
    const res = resolveScopeForHomeRail('trending', { ...empty, COUNTY: 3 })
    expect(res.scopeExpanded).toBe(false)
    expect(res.retainedRungs.has('COUNTY')).toBe(false)
    expect(res.retainedRungs.has('NEARBY')).toBe(true)
  })
  it('nearbyByCategory strict NEARBY+CITY, no cascade', () => {
    const res = resolveScopeForHomeRail('nearbyByCategory', { ...empty, COUNTRY: 5 })
    expect(res.retainedRungs.has('COUNTRY')).toBe(false)
    expect(res.retainedRungs.has('CATCHMENT')).toBe(true)
  })
  it('popular all tiers', () => {
    const res = resolveScopeForHomeRail('popular', { ...empty, NATIONAL: 1 })
    expect(res.retainedRungs.has('NATIONAL')).toBe(true)
    expect(res.scope).toBe('platform')
  })
})

type TailCandidate = {
  id: string
  localityId: string | null
  localityName: string | null
  postTown: string | null
}

const effLoc = { locality: { id: 'loc_huddersfield', name: 'Huddersfield' } }
const rankedTiles = [{ id: 'r1' }, { id: 'r2' }] as any[]

describe('appendStrictLocalityTail (§6.4.1 identity ladder)', () => {
  it('passes via localityId match', () => {
    const cand: TailCandidate = { id: 'b1', localityId: 'loc_huddersfield', localityName: null, postTown: null }
    const out = appendStrictLocalityTail(rankedTiles, [cand], effLoc)
    expect(out.length).toBe(3)
    expect(out[2].id).toBe('b1')
  })
  it('passes via localityName case-insensitive', () => {
    const cand: TailCandidate = { id: 'b1', localityId: null, localityName: 'huddersfield', postTown: null }
    const out = appendStrictLocalityTail(rankedTiles, [cand], effLoc)
    expect(out.length).toBe(3)
  })
  it('passes via postTown case-insensitive', () => {
    const cand: TailCandidate = { id: 'b1', localityId: null, localityName: null, postTown: 'HUDDERSFIELD' }
    const out = appendStrictLocalityTail(rankedTiles, [cand], effLoc)
    expect(out.length).toBe(3)
  })
  it('fails all three checks → excluded', () => {
    const cand: TailCandidate = { id: 'b1', localityId: 'loc_other', localityName: 'Leeds', postTown: 'Leeds' }
    const out = appendStrictLocalityTail(rankedTiles, [cand], effLoc)
    expect(out.length).toBe(2)
    expect(out.map(t => t.id)).not.toContain('b1')
  })
  it('null effLoc → tail dropped (defensive)', () => {
    const cand: TailCandidate = { id: 'b1', localityId: 'loc_huddersfield', localityName: 'Huddersfield', postTown: 'Huddersfield' }
    const out = appendStrictLocalityTail(rankedTiles, [cand], null)
    expect(out.length).toBe(2)
  })
})

describe('appendPermissiveTail (§6.4.2 platform-claim rails)', () => {
  it('appends all candidates regardless of locality', () => {
    const ranked = [{ id: 'r1' }] as any[]
    const cands  = [{ id: 't1' }, { id: 't2' }] as any[]
    const out    = appendPermissiveTail(ranked, cands)
    expect(out.map(t => t.id)).toEqual(['r1', 't1', 't2'])
  })
  it('empty candidates → ranked unchanged', () => {
    const ranked = [{ id: 'r1' }] as any[]
    const out    = appendPermissiveTail(ranked, [])
    expect(out.length).toBe(1)
  })
})
