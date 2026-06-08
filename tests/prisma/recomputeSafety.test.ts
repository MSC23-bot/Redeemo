import { describe, it, expect } from 'vitest'
import { requireRecomputeOptIn, requireRecomputeConfirm } from '../../prisma/seed-data/recomputeSafety'

// Fail-closed opt-in + target-confirm gates for the recompute runner. (DATABASE_URL
// validation + redaction are reused from referenceSeedSafety and covered by its own
// tests — D3.)

describe('recomputeSafety — fail-closed gates', () => {
  describe('requireRecomputeOptIn', () => {
    it('throws unless ALLOW_RECOMPUTE_COUNTS === "true"', () => {
      expect(() => requireRecomputeOptIn({})).toThrow(/ALLOW_RECOMPUTE_COUNTS/)
      expect(() => requireRecomputeOptIn({ ALLOW_RECOMPUTE_COUNTS: 'false' })).toThrow(/ALLOW_RECOMPUTE_COUNTS/)
      expect(() => requireRecomputeOptIn({ ALLOW_RECOMPUTE_COUNTS: '1' })).toThrow(/ALLOW_RECOMPUTE_COUNTS/)
      expect(() => requireRecomputeOptIn({ ALLOW_RECOMPUTE_COUNTS: 'TRUE' })).toThrow(/ALLOW_RECOMPUTE_COUNTS/)
      expect(() => requireRecomputeOptIn({ ALLOW_RECOMPUTE_COUNTS: 'true' })).not.toThrow()
    })
  })

  describe('requireRecomputeConfirm', () => {
    const target = 'db.example.neon.tech/neondb'
    it('throws when RECOMPUTE_CONFIRM is unset/blank', () => {
      expect(() => requireRecomputeConfirm({}, target)).toThrow(/RECOMPUTE_CONFIRM/)
      expect(() => requireRecomputeConfirm({ RECOMPUTE_CONFIRM: '   ' }, target)).toThrow(/RECOMPUTE_CONFIRM/)
    })
    it('throws when it does not match the target', () => {
      expect(() => requireRecomputeConfirm({ RECOMPUTE_CONFIRM: 'some-other-db' }, target)).toThrow(/does not match/)
    })
    it('passes when it matches the host (or db name)', () => {
      expect(() => requireRecomputeConfirm({ RECOMPUTE_CONFIRM: 'db.example.neon.tech' }, target)).not.toThrow()
      expect(() => requireRecomputeConfirm({ RECOMPUTE_CONFIRM: 'neondb' }, target)).not.toThrow()
    })
  })
})
