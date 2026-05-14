// tests/api/lib/ladderProfiles.test.ts
//
// Plan 4 M2.2 — pure-data ladder-profile matrix.
//
// Pins the 5 × 3 NEARBY-radius matrix, the 5 × 3 max-rung matrix, the
// 8 × 3 proximityBand matrix, and the canonical 8-rung order. See:
//   docs/superpowers/specs/2026-05-13-plan-4-location-model-uk-enrichment-design.md §5.1–§5.3
//   docs/superpowers/plans/2026-05-13-plan-4-location-model-uk-enrichment.md  Task M2.2

import { describe, it, expect } from 'vitest'
import {
  getNearbyRadiusMiles,
  getMaxRung,
  getProximityBand,
  deriveDensityClass,
  RUNG_ORDER,
} from '../../../src/api/lib/ladderProfiles'

describe('ladderProfiles', () => {
  describe('deriveDensityClass', () => {
    it('METRO_CORE / CITY → URBAN', () => {
      expect(deriveDensityClass('METRO_CORE')).toBe('URBAN')
      expect(deriveDensityClass('CITY')).toBe('URBAN')
    })
    it('LARGE_TOWN / TOWN → SUBURBAN', () => {
      expect(deriveDensityClass('LARGE_TOWN')).toBe('SUBURBAN')
      expect(deriveDensityClass('TOWN')).toBe('SUBURBAN')
    })
    it('SMALL_TOWN / VILLAGE / HAMLET / UNKNOWN → RURAL', () => {
      expect(deriveDensityClass('SMALL_TOWN')).toBe('RURAL')
      expect(deriveDensityClass('VILLAGE')).toBe('RURAL')
      expect(deriveDensityClass('HAMLET')).toBe('RURAL')
      expect(deriveDensityClass('UNKNOWN')).toBe('RURAL')
    })
  })

  describe('getNearbyRadiusMiles', () => {
    it('LOCAL_TIGHT × URBAN/SUBURBAN/RURAL → 1.5 / 4 / 7', () => {
      expect(getNearbyRadiusMiles('LOCAL_TIGHT', 'URBAN')).toBe(1.5)
      expect(getNearbyRadiusMiles('LOCAL_TIGHT', 'SUBURBAN')).toBe(4)
      expect(getNearbyRadiusMiles('LOCAL_TIGHT', 'RURAL')).toBe(7)
    })
    it('DESTINATION_WIDE × URBAN/SUBURBAN/RURAL → 15 / 25 / 35', () => {
      expect(getNearbyRadiusMiles('DESTINATION_WIDE', 'URBAN')).toBe(15)
      expect(getNearbyRadiusMiles('DESTINATION_WIDE', 'SUBURBAN')).toBe(25)
      expect(getNearbyRadiusMiles('DESTINATION_WIDE', 'RURAL')).toBe(35)
    })
  })

  describe('getMaxRung', () => {
    it('LOCAL_TIGHT × URBAN → LAD', () => {
      expect(getMaxRung('LOCAL_TIGHT', 'URBAN')).toBe('LAD')
    })
    it('MIXED_NORMAL × RURAL → COUNTRY', () => {
      expect(getMaxRung('MIXED_NORMAL', 'RURAL')).toBe('COUNTRY')
    })
    it('DESTINATION_WIDE × URBAN → NATIONAL', () => {
      expect(getMaxRung('DESTINATION_WIDE', 'URBAN')).toBe('NATIONAL')
    })
  })

  describe('getProximityBand', () => {
    it('NEARBY → "NEARBY" in all densities', () => {
      expect(getProximityBand('NEARBY', 'URBAN')).toBe('NEARBY')
      expect(getProximityBand('NEARBY', 'SUBURBAN')).toBe('NEARBY')
      expect(getProximityBand('NEARBY', 'RURAL')).toBe('NEARBY')
    })
    it('LAD → "A_LITTLE_FURTHER" in URBAN, "IN_YOUR_AREA" in SUBURBAN/RURAL', () => {
      expect(getProximityBand('LAD', 'URBAN')).toBe('A_LITTLE_FURTHER')
      expect(getProximityBand('LAD', 'SUBURBAN')).toBe('IN_YOUR_AREA')
      expect(getProximityBand('LAD', 'RURAL')).toBe('IN_YOUR_AREA')
    })
    it('NATIONAL → "NEAREST_ON_REDEEMO" in all densities', () => {
      expect(getProximityBand('NATIONAL', 'URBAN')).toBe('NEAREST_ON_REDEEMO')
      expect(getProximityBand('NATIONAL', 'SUBURBAN')).toBe('NEAREST_ON_REDEEMO')
      expect(getProximityBand('NATIONAL', 'RURAL')).toBe('NEAREST_ON_REDEEMO')
    })
  })

  describe('RUNG_ORDER', () => {
    it('has 8 rungs in the correct order', () => {
      expect(RUNG_ORDER).toEqual([
        'NEARBY', 'CATCHMENT', 'POST_TOWN', 'LAD',
        'COUNTY', 'REGION', 'COUNTRY', 'NATIONAL',
      ])
    })
  })
})
