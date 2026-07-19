import { readFileSync } from 'fs'
import { join } from 'path'
import { reflectThumbX, THUMB_SPRING } from '@/design-system/motion/SegmentedControl'

// Map W2b rounds 6-7 — WALL PHYSICS. Every landing (edge and interior)
// takes the IDENTICAL spring; containment is the worklet REFLECTION
// (round 7: the round-6 hard clamp flattened the spring's outward
// half-cycles into dead pauses at the wall). These pin both halves.
describe('SegmentedControl — wall physics', () => {
  describe('reflectThumbX (the wall)', () => {
    const SEG_W = 80
    const COUNT = 4
    const MAX = (COUNT - 1) * SEG_W // 240

    it('passes interior positions through unchanged', () => {
      expect(reflectThumbX(0, SEG_W, COUNT)).toBe(0)
      expect(reflectThumbX(120, SEG_W, COUNT)).toBe(120)
      expect(reflectThumbX(MAX, SEG_W, COUNT)).toBe(MAX)
    })

    it('REFLECTS overshoot at the lower wall: below 0 maps to the mirrored inward position', () => {
      // Overshoot 14 past the left wall renders 14 INSIDE the track —
      // the outward half-cycle becomes visible inward movement, so the
      // spring's oscillation reads as a decaying bounce with no dead time.
      expect(reflectThumbX(-14, SEG_W, COUNT)).toBe(14)
      expect(reflectThumbX(-1, SEG_W, COUNT)).toBe(1)
    })

    it('REFLECTS overshoot at the upper wall likewise', () => {
      expect(reflectThumbX(MAX + 14, SEG_W, COUNT)).toBe(MAX - 14)
      expect(reflectThumbX(MAX + 1, SEG_W, COUNT)).toBe(MAX - 1)
    })

    it('safety bound: pathological overshoot never reflects past the adjacent segment (one segmentWidth of travel)', () => {
      // Lower wall — even a wild overshoot caps at one segment inward.
      expect(reflectThumbX(-SEG_W - 50, SEG_W, COUNT)).toBe(SEG_W)
      // Upper wall — likewise, capped at MAX - segmentWidth.
      expect(reflectThumbX(MAX + SEG_W + 50, SEG_W, COUNT)).toBe(MAX - SEG_W)
    })
  })

  // "Same spring path" pin — comparator-level via the source: ONE
  // withSpring call using the ONE exported config, and none of the
  // round-4/5 special-casing primitives (overshootClamping, withSequence,
  // edge-index branches) anywhere in the file. A future edit that
  // reintroduces per-landing choreography fails here by design.
  describe('one spring for every landing (no choreography branch)', () => {
    // CODE only — block/line comments stripped so the pin can't trip on
    // its own documentation (the header narrates the round-4/5 history).
    const source = readFileSync(
      join(__dirname, '../../../src/design-system/motion/SegmentedControl.tsx'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    it('exactly one withSpring call, driven by the single THUMB_SPRING config', () => {
      expect(source.match(/withSpring\(/g)).toHaveLength(1)
      expect(source).toContain('withSpring(target, THUMB_SPRING)')
      expect(THUMB_SPRING).toEqual({ damping: 20, stiffness: 220 })
    })

    it('no overshootClamping, no withSequence, no edge-index motion branch', () => {
      expect(source).not.toContain('overshootClamping')
      expect(source).not.toContain('withSequence')
      expect(source).not.toContain('isEdge')
    })

    it('the reduce-motion jump is the only withTiming (single jump, no phases)', () => {
      expect(source.match(/withTiming\(/g)).toHaveLength(1)
      expect(source).toContain("withTiming(target, { duration: 0 })")
    })
  })
})
