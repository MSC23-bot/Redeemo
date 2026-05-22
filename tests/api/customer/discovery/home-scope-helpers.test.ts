// tests/api/customer/discovery/home-scope-helpers.test.ts
import { describe, it, expect } from 'vitest'
import { resolveScopeForHomeRail } from '../../../../src/api/customer/discovery/homeScope'
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
