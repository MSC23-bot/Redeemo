import { describe, it, expect } from 'vitest'
import { classifyTier, NEARBY_RADIUS_MILES } from '../../../src/api/lib/ranking'

describe('classifyTier', () => {
  const merchantWithBranches = (branches: { city: string; latitude: number | null; longitude: number | null }[]) =>
    ({ branches: branches.map(b => ({ ...b, isActive: true })) }) as any

  it('returns NEARBY when nearest branch is within NEARBY_RADIUS_MILES of user coords', () => {
    const m = merchantWithBranches([{ city: 'London', latitude: 51.5074, longitude: -0.1278 }])
    expect(classifyTier(m, { userLat: 51.5074, userLng: -0.1278, profileCity: null })).toBe('NEARBY')
  })

  it('returns CITY when no NEARBY match but a branch matches profileCity (case-insensitive)', () => {
    const m = merchantWithBranches([{ city: 'London', latitude: 51.5074, longitude: -0.1278 }])
    expect(classifyTier(m, { userLat: null, userLng: null, profileCity: 'london' })).toBe('CITY')
  })

  it('returns DISTANT when no coords and no profileCity match', () => {
    const m = merchantWithBranches([{ city: 'Manchester', latitude: 53.4808, longitude: -2.2426 }])
    expect(classifyTier(m, { userLat: null, userLng: null, profileCity: 'London' })).toBe('DISTANT')
  })

  it('returns DISTANT when no location data at all', () => {
    const m = merchantWithBranches([{ city: 'London', latitude: 51.5074, longitude: -0.1278 }])
    expect(classifyTier(m, { userLat: null, userLng: null, profileCity: null })).toBe('DISTANT')
  })

  it('returns NEARBY when at least one branch is in radius (multi-branch)', () => {
    const m = merchantWithBranches([
      { city: 'Manchester', latitude: 53.4808, longitude: -2.2426 },
      { city: 'London',     latitude: 51.5074, longitude: -0.1278 },
    ])
    expect(classifyTier(m, { userLat: 51.5074, userLng: -0.1278, profileCity: null })).toBe('NEARBY')
  })

  it('exposes NEARBY_RADIUS_MILES as a constant', () => {
    expect(NEARBY_RADIUS_MILES).toBe(2)
  })
})
