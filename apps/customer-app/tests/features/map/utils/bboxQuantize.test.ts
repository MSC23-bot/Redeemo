// Map in-area reliability slice — pins the bbox quantization contract:
// mins floor, maxs ceil, exactly 3dp, and idempotent (re-quantizing an
// already-quantized bbox is a no-op). See bboxQuantize.ts for the
// cache-hit rationale.

import { quantizeBbox } from '@/features/map/utils/bboxQuantize'

describe('quantizeBbox', () => {
  it('floors minLat/minLng down to 3 decimal places', () => {
    const result = quantizeBbox({
      minLat: 51.400999, maxLat: 51.6, minLng: -0.200999, maxLng: 0,
    })
    expect(result.minLat).toBeCloseTo(51.4, 5)
    expect(result.minLng).toBeCloseTo(-0.201, 5)
  })

  it('ceils maxLat/maxLng up to 3 decimal places', () => {
    const result = quantizeBbox({
      minLat: 51.4, maxLat: 51.600001, minLng: -0.2, maxLng: 0.000001,
    })
    expect(result.maxLat).toBeCloseTo(51.601, 5)
    expect(result.maxLng).toBeCloseTo(0.001, 5)
  })

  it('always grows the bbox outward, never shrinks it', () => {
    const raw = { minLat: 51.40001, maxLat: 51.59999, minLng: -0.20001, maxLng: -0.00001 }
    const result = quantizeBbox(raw)
    expect(result.minLat).toBeLessThanOrEqual(raw.minLat)
    expect(result.maxLat).toBeGreaterThanOrEqual(raw.maxLat)
    expect(result.minLng).toBeLessThanOrEqual(raw.minLng)
    expect(result.maxLng).toBeGreaterThanOrEqual(raw.maxLng)
  })

  it('produces values with at most 3 decimal places', () => {
    const result = quantizeBbox({
      minLat: 51.123456, maxLat: 51.654321, minLng: -0.987654, maxLng: 0.123456,
    })
    for (const v of Object.values(result)) {
      const decimals = (String(v).split('.')[1] ?? '').length
      expect(decimals).toBeLessThanOrEqual(3)
    }
  })

  it('is idempotent — quantizing an already-quantized bbox is a no-op', () => {
    const once  = quantizeBbox({ minLat: 51.400999, maxLat: 51.600001, minLng: -0.200999, maxLng: 0.000001 })
    const twice = quantizeBbox(once)
    expect(twice).toEqual(once)
  })

  it('leaves an already-3dp bbox unchanged', () => {
    const exact = { minLat: 51.4, maxLat: 51.6, minLng: -0.2, maxLng: 0 }
    expect(quantizeBbox(exact)).toEqual(exact)
  })

  it('two nearby raw bboxes within the same grid cell quantize to the same bbox', () => {
    const a = quantizeBbox({ minLat: 51.40001, maxLat: 51.40501, minLng: -0.20001, maxLng: -0.19501 })
    const b = quantizeBbox({ minLat: 51.40002, maxLat: 51.40502, minLng: -0.20002, maxLng: -0.19502 })
    expect(a).toEqual(b)
  })
})
