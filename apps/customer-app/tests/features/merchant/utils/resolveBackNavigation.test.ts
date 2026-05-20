import { resolveBackNavigation } from '@/features/merchant/utils/resolveBackNavigation'

describe('resolveBackNavigation', () => {
  describe('from=search (PR #112 fixup-6 contract)', () => {
    it('returns /(app)/search?q=<encoded> when a query is present', () => {
      expect(resolveBackNavigation('search', 'covelum')).toBe('/(app)/search?q=covelum')
    })

    it('URL-encodes special characters in the query', () => {
      expect(resolveBackNavigation('search', 'fish & chips')).toBe('/(app)/search?q=fish%20%26%20chips')
    })

    it('returns /(app)/search without ?q when query is empty/undefined', () => {
      expect(resolveBackNavigation('search', undefined)).toBe('/(app)/search')
      expect(resolveBackNavigation('search', '')).toBe('/(app)/search')
    })
  })

  describe('from=map (PR-3 Phase D contract)', () => {
    it('returns /(app)/map regardless of q', () => {
      expect(resolveBackNavigation('map', undefined)).toBe('/(app)/map')
      expect(resolveBackNavigation('map', 'ignored')).toBe('/(app)/map')
    })
  })

  describe('default fallback', () => {
    it('returns null when from is undefined (default router.back behaviour)', () => {
      expect(resolveBackNavigation(undefined, undefined)).toBeNull()
    })

    it('returns null for unrecognised from values', () => {
      expect(resolveBackNavigation('discovery', 'whatever')).toBeNull()
      expect(resolveBackNavigation('home', undefined)).toBeNull()
    })
  })
})
