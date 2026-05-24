import { describe, it, expect } from 'vitest'
import { deriveProximityBandFromDistance } from '../../../../src/api/customer/discovery/proximityBand'

// §DG post-T8 fixup — owner-locked unified proximity-band derivation.
// Same thresholds as the previous deriveFillerProximityBand helper, now used
// across ALL rails (Featured/Trending/Popular/NBC) not just NBC fillers.

describe('deriveProximityBandFromDistance', () => {
  it('returns null for null distance (no chip rendered)', () => {
    expect(deriveProximityBandFromDistance(null)).toBeNull()
  })

  it('IN_YOUR_AREA for distances < 8 miles (< 12 875 m)', () => {
    expect(deriveProximityBandFromDistance(0)).toBe('IN_YOUR_AREA')
    expect(deriveProximityBandFromDistance(1000)).toBe('IN_YOUR_AREA')   // 1 km
    expect(deriveProximityBandFromDistance(10_000)).toBe('IN_YOUR_AREA') // 6.2 mi
    expect(deriveProximityBandFromDistance(12_874)).toBe('IN_YOUR_AREA') // just under 8 mi
  })

  it('A_LITTLE_FURTHER for distances 8-25 miles (12 875 m to < 40 234 m)', () => {
    expect(deriveProximityBandFromDistance(12_875)).toBe('A_LITTLE_FURTHER')  // exactly 8 mi
    expect(deriveProximityBandFromDistance(15_000)).toBe('A_LITTLE_FURTHER')  // 9.3 mi
    expect(deriveProximityBandFromDistance(24_140)).toBe('A_LITTLE_FURTHER')  // ~15 mi
    expect(deriveProximityBandFromDistance(40_233)).toBe('A_LITTLE_FURTHER')  // just under 25 mi
  })

  it('NEAREST_ON_REDEEMO for distances >= 25 miles (>= 40 234 m)', () => {
    expect(deriveProximityBandFromDistance(40_234)).toBe('NEAREST_ON_REDEEMO')  // exactly 25 mi
    expect(deriveProximityBandFromDistance(100_000)).toBe('NEAREST_ON_REDEEMO') // 62 mi
    expect(deriveProximityBandFromDistance(250_000)).toBe('NEAREST_ON_REDEEMO') // 155 mi (London → Manchester)
    expect(deriveProximityBandFromDistance(1_000_000)).toBe('NEAREST_ON_REDEEMO') // 621 mi (UK extreme)
  })
})
