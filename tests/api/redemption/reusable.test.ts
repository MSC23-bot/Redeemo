import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REUSABLE_COOLDOWN_SECONDS,
  MIN_REUSABLE_COOLDOWN_SECONDS,
  effectiveCooldownSeconds,
  computeAvailableAgainAt,
} from '../../../src/api/redemption/reusable'

describe('REUSABLE constants + helpers', () => {
  describe('constants', () => {
    it('DEFAULT_REUSABLE_COOLDOWN_SECONDS is 4 hours (14400s)', () => {
      expect(DEFAULT_REUSABLE_COOLDOWN_SECONDS).toBe(4 * 60 * 60)
    })

    it('MIN_REUSABLE_COOLDOWN_SECONDS is 30 minutes (1800s)', () => {
      expect(MIN_REUSABLE_COOLDOWN_SECONDS).toBe(30 * 60)
    })
  })

  describe('effectiveCooldownSeconds', () => {
    it('returns DEFAULT when cooldownSeconds is null', () => {
      expect(effectiveCooldownSeconds({ cooldownSeconds: null })).toBe(14400)
    })

    it('returns merchant value when >= floor', () => {
      expect(effectiveCooldownSeconds({ cooldownSeconds: 3600 })).toBe(3600)
      expect(effectiveCooldownSeconds({ cooldownSeconds: 1800 })).toBe(1800)
      expect(effectiveCooldownSeconds({ cooldownSeconds: 86400 })).toBe(86400)
    })

    it('clamps merchant value to floor when below MIN', () => {
      // Defense in depth — should be unreachable in practice due to Zod + DB CHECK,
      // but the runtime clamp is the non-bypassable safety net.
      expect(effectiveCooldownSeconds({ cooldownSeconds: 0 })).toBe(1800)
      expect(effectiveCooldownSeconds({ cooldownSeconds: 60 })).toBe(1800)
      expect(effectiveCooldownSeconds({ cooldownSeconds: 1799 })).toBe(1800)
    })
  })

  describe('computeAvailableAgainAt', () => {
    it('returns null when lastRedeemedAt is null', () => {
      expect(computeAvailableAgainAt(null, { cooldownSeconds: null })).toBeNull()
    })

    it('returns lastRedeemedAt + effectiveCooldown (default 4h)', () => {
      const last = new Date('2026-05-12T12:00:00Z')
      const result = computeAvailableAgainAt(last, { cooldownSeconds: null })
      expect(result).not.toBeNull()
      expect(result!.toISOString()).toBe('2026-05-12T16:00:00.000Z')
    })

    it('returns lastRedeemedAt + merchant cooldown', () => {
      const last = new Date('2026-05-12T12:00:00Z')
      const result = computeAvailableAgainAt(last, { cooldownSeconds: 1800 })
      expect(result!.toISOString()).toBe('2026-05-12T12:30:00.000Z')
    })

    it('clamps when merchant cooldown is below floor', () => {
      const last = new Date('2026-05-12T12:00:00Z')
      const result = computeAvailableAgainAt(last, { cooldownSeconds: 60 })
      // Clamped to 1800 → +30min
      expect(result!.toISOString()).toBe('2026-05-12T12:30:00.000Z')
    })

    it('handles 7-day cooldown correctly', () => {
      const last = new Date('2026-05-12T12:00:00Z')
      const result = computeAvailableAgainAt(last, { cooldownSeconds: 7 * 24 * 60 * 60 })
      expect(result!.toISOString()).toBe('2026-05-19T12:00:00.000Z')
    })
  })
})
