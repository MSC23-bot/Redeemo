import { readFileSync } from 'fs'
import { join } from 'path'
import { clampThumbX, THUMB_SPRING } from '@/design-system/motion/SegmentedControl'

// Map W2b round 6 — WALL PHYSICS. Every landing (edge and interior) takes
// the IDENTICAL spring; containment is the worklet clamp, not motion
// special-casing. These pin both halves.
describe('SegmentedControl — round 6 wall physics', () => {
  describe('clampThumbX (the wall)', () => {
    const SEG_W = 80
    const COUNT = 4
    const MAX = (COUNT - 1) * SEG_W // 240

    it('passes interior positions through unchanged', () => {
      expect(clampThumbX(0, SEG_W, COUNT)).toBe(0)
      expect(clampThumbX(120, SEG_W, COUNT)).toBe(120)
      expect(clampThumbX(MAX, SEG_W, COUNT)).toBe(MAX)
    })

    it('clamps spring overshoot at BOTH walls: below 0 and above (count-1) x segmentWidth', () => {
      // Left wall — overshoot past the first segment presses against 0.
      expect(clampThumbX(-14, SEG_W, COUNT)).toBe(0)
      // Right wall — overshoot past the last segment presses against MAX.
      expect(clampThumbX(MAX + 14, SEG_W, COUNT)).toBe(MAX)
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
