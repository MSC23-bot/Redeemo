import { describe, it, expect } from 'vitest'
import { resolveScope } from '../../../src/api/lib/scope'

describe('resolveScope', () => {
  it('returns nearby when lat/lng present and scope=nearby', () => {
    const r = resolveScope({ scope: 'nearby', lat: 51.5, lng: -0.1, profileCity: 'London' })
    expect(r).toEqual({ scope: 'nearby', resolvedArea: 'Nearby', radiusMiles: 2 })
  })

  it('returns city when scope=city', () => {
    const r = resolveScope({ scope: 'city', lat: 51.5, lng: -0.1, profileCity: 'London' })
    expect(r.scope).toBe('city')
    expect(r.resolvedArea).toBe('London')
  })

  it('returns region when scope=region', () => {
    const r = resolveScope({ scope: 'region', lat: 51.5, lng: -0.1, profileCity: 'London' })
    expect(r).toEqual({ scope: 'region', resolvedArea: 'Wider area', radiusMiles: 25 })
  })

  it('returns platform when scope=platform', () => {
    const r = resolveScope({ scope: 'platform', lat: null, lng: null, profileCity: null })
    expect(r).toEqual({ scope: 'platform', resolvedArea: 'United Kingdom', radiusMiles: null })
  })

  it('falls back to city when no location and profileCity present', () => {
    const r = resolveScope({ scope: 'nearby', lat: null, lng: null, profileCity: 'Manchester' })
    expect(r.scope).toBe('city')
    expect(r.resolvedArea).toBe('Manchester')
  })

  it('falls back to platform when no location and no profileCity', () => {
    const r = resolveScope({ scope: 'nearby', lat: null, lng: null, profileCity: null })
    expect(r.scope).toBe('platform')
  })
})
