import { describe, it, expect } from 'vitest'
import { haversineMetres } from '../../../src/api/shared/haversine'

describe('haversineMetres', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineMetres(51.5074, -0.1278, 51.5074, -0.1278)).toBe(0)
  })

  it('returns ~556000m between London and Edinburgh (within 5%)', () => {
    const dist = haversineMetres(51.5074, -0.1278, 55.9533, -3.1883)
    expect(dist).toBeGreaterThan(528200)
    expect(dist).toBeLessThan(583800)
  })

  it('returns ~1000m for ~1km difference in latitude', () => {
    // 1 degree latitude ≈ 111320m, so 0.009° ≈ 1002m
    const dist = haversineMetres(51.5000, -0.1278, 51.5090, -0.1278)
    expect(dist).toBeGreaterThan(900)
    expect(dist).toBeLessThan(1100)
  })

  it('returns a number (not NaN) for any valid coordinates', () => {
    const dist = haversineMetres(0, 0, 90, 180)
    expect(Number.isFinite(dist)).toBe(true)
  })
})
