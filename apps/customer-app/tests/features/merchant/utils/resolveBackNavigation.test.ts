import { resolveBackNavigation } from '@/features/merchant/utils/resolveBackNavigation'

describe('resolveBackNavigation', () => {
  describe('from=search (PR #112 fixup-6 contract)', () => {
    it('returns /(app)/search?q=<encoded> when a query is present', () => {
      expect(resolveBackNavigation('search', { q: 'covelum' })).toBe('/(app)/search?q=covelum')
    })

    it('URL-encodes special characters in the query', () => {
      expect(resolveBackNavigation('search', { q: 'fish & chips' })).toBe('/(app)/search?q=fish%20%26%20chips')
    })

    it('returns /(app)/search without ?q when query is undefined', () => {
      expect(resolveBackNavigation('search')).toBe('/(app)/search')
    })

    it('returns /(app)/search without ?q when q is empty string (falsy)', () => {
      expect(resolveBackNavigation('search', { q: '' })).toBe('/(app)/search')
    })
  })

  describe('from=map (PR-3 Phase D contract)', () => {
    it('returns /(app)/map regardless of ctx', () => {
      expect(resolveBackNavigation('map')).toBe('/(app)/map')
      expect(resolveBackNavigation('map', { q: 'ignored' })).toBe('/(app)/map')
    })
  })

  describe('from=home (Phase 2.3 contract)', () => {
    it('returns /(app)/ (canonical Home route) regardless of ctx', () => {
      expect(resolveBackNavigation('home')).toBe('/(app)/')
      expect(resolveBackNavigation('home', { q: 'ignored' })).toBe('/(app)/')
    })
  })

  describe('from=category (Phase 2.4 contract)', () => {
    it('returns /(app)/category/<id> when categoryId is present', () => {
      expect(resolveBackNavigation('category', { categoryId: 'cat-restaurant-001' })).toBe('/(app)/category/cat-restaurant-001')
    })

    it('returns /(app)/categories when called with no ctx', () => {
      expect(resolveBackNavigation('category')).toBe('/(app)/categories')
    })

    it('returns /(app)/categories when ctx is empty object', () => {
      expect(resolveBackNavigation('category', {})).toBe('/(app)/categories')
    })

    it('returns /(app)/categories when categoryId is absent from ctx (omitted key)', () => {
      // exactOptionalPropertyTypes: passing the key with an explicit `undefined`
      // value is a type error; omitting the key is the correct idiom.
      const ctx: { q?: string } = { q: 'some-query' }
      expect(resolveBackNavigation('category', ctx)).toBe('/(app)/categories')
    })

    it('returns /(app)/categories when only q is provided (q ignored on category path)', () => {
      expect(resolveBackNavigation('category', { q: 'pizza' })).toBe('/(app)/categories')
    })

    it('returns /(app)/category/<id> and ignores q when both categoryId and q are present', () => {
      expect(resolveBackNavigation('category', { categoryId: 'cat-x', q: 'pizza' })).toBe('/(app)/category/cat-x')
    })
  })

  describe('default fallback', () => {
    it('returns null when from is undefined (default router.back behaviour)', () => {
      expect(resolveBackNavigation(undefined)).toBeNull()
    })

    it('returns null for unrecognised from values', () => {
      expect(resolveBackNavigation('discovery', { q: 'whatever' })).toBeNull()
    })
  })
})
