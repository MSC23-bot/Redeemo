// Map Phase 2 Slice S3 (pin v2, 2026-07-10) — category pin glyph matcher.
//
// Mirrors RailHeader's CATEGORY_ICONS test coverage pattern: pin every
// known top-level category name to its expected glyph component, plus
// the ordering-sensitive 'medical' vs 'health' precedence and the
// null/unmatched default-glyph fallback.

import {
  Utensils, Scissors, Stethoscope, Dumbbell, Compass, ShoppingBag,
  Home, Plane, Baby, Car, PawPrint, MapPin,
} from '@/design-system/icons'
import {
  getCategoryPinGlyph,
  buildCategoryTreeIndex,
  resolveTopLevelCategoryName,
  type CategoryTreeNode,
} from '@/features/map/utils/categoryPinGlyph'

describe('getCategoryPinGlyph', () => {
  it.each([
    ['Food & Drink', Utensils],
    ['Beauty & Wellness', Scissors],
    ['Health & Medical', Stethoscope],
    ['Health & Fitness', Dumbbell],
    ['Out & About', Compass],
    ['Shopping', ShoppingBag],
    ['Home & Local Services', Home],
    ['Travel & Hotels', Plane],
    ['Family & Kids', Baby],
    ['Auto & Garage', Car],
    ['Pets', PawPrint],
  ])('matches %s to its glyph', (name, expected) => {
    expect(getCategoryPinGlyph(name)).toBe(expected)
  })

  it("'medical' takes precedence over 'health' (mirrors RailHeader ordering)", () => {
    // "Health & Medical" contains BOTH "health" and "medical" — the
    // medical-specific glyph must win, not the fitness/health glyph.
    expect(getCategoryPinGlyph('Health & Medical')).toBe(Stethoscope)
    expect(getCategoryPinGlyph('Health & Medical')).not.toBe(Dumbbell)
  })

  it('is case-insensitive', () => {
    expect(getCategoryPinGlyph('FOOD & DRINK')).toBe(Utensils)
    expect(getCategoryPinGlyph('food & drink')).toBe(Utensils)
  })

  it('falls back to the default glyph for an unmatched category name', () => {
    expect(getCategoryPinGlyph('Some Brand New Category')).toBe(MapPin)
  })

  it('falls back to the default glyph for null', () => {
    expect(getCategoryPinGlyph(null)).toBe(MapPin)
  })

  it('falls back to the default glyph for undefined', () => {
    expect(getCategoryPinGlyph(undefined)).toBe(MapPin)
  })

  it('falls back to the default glyph for an empty string', () => {
    expect(getCategoryPinGlyph('')).toBe(MapPin)
  })

  it('is deterministic: repeated calls with the same input return the same glyph', () => {
    expect(getCategoryPinGlyph('Food & Drink')).toBe(getCategoryPinGlyph('Food & Drink'))
  })
})

// S3 correction (2026-07-10) — CLIENT-SIDE top-level category
// resolution. The original push resolved the top-level name via a new
// `topLevelName` wire field on branch tiles; REVERTED because the
// installed builds' branch-tile schema is .strict() and a new backend
// key would instantly fail the whole discovery parse on old builds.
// This resolver walks parentId over the already-loaded category tree
// (useCategories) instead.

const TREE: CategoryTreeNode[] = [
  { id: 'top-food',   name: 'Food & Drink',       parentId: null },
  { id: 'top-beauty', name: 'Beauty & Wellness',  parentId: null },
  { id: 'sub-pizza',  name: 'Pizza Restaurant',   parentId: 'top-food' },
  { id: 'sub-nails',  name: 'Nail Salon',         parentId: 'top-beauty' },
]

describe('buildCategoryTreeIndex', () => {
  it('indexes every category by id', () => {
    const byId = buildCategoryTreeIndex(TREE)
    expect(byId.size).toBe(4)
    expect(byId.get('sub-pizza')?.name).toBe('Pizza Restaurant')
  })

  it('returns an empty map for undefined input (categories query not loaded yet)', () => {
    expect(buildCategoryTreeIndex(undefined).size).toBe(0)
  })
})

describe('resolveTopLevelCategoryName', () => {
  const byId = buildCategoryTreeIndex(TREE)

  it('resolves a subcategory to its PARENT top-level name via the parentId walk', () => {
    expect(resolveTopLevelCategoryName({ id: 'sub-pizza', name: 'Pizza Restaurant', parentId: 'top-food' }, byId))
      .toBe('Food & Drink')
  })

  it('resolves a top-level category (parentId null) to its own name without needing the index', () => {
    expect(resolveTopLevelCategoryName({ id: 'top-food', name: 'Food & Drink', parentId: null }, buildCategoryTreeIndex(undefined)))
      .toBe('Food & Drink')
  })

  it('degrades to the leaf OWN name when the index is empty (categories query still loading): pins never blank', () => {
    expect(resolveTopLevelCategoryName({ id: 'sub-pizza', name: 'Pizza Restaurant', parentId: 'top-food' }, buildCategoryTreeIndex(undefined)))
      .toBe('Pizza Restaurant')
  })

  it('degrades to the leaf own name when the parent id is missing from the index', () => {
    expect(resolveTopLevelCategoryName({ id: 'sub-orphan', name: 'Orphan Sub', parentId: 'missing-parent' }, byId))
      .toBe('Orphan Sub')
  })

  it('returns null for a null/undefined leaf (caller gets the default glyph)', () => {
    expect(resolveTopLevelCategoryName(null, byId)).toBeNull()
    expect(resolveTopLevelCategoryName(undefined, byId)).toBeNull()
  })

  it('a parentId cycle degrades to the leaf name instead of hanging (walk-depth guard)', () => {
    const cyclic = buildCategoryTreeIndex([
      { id: 'a', name: 'A', parentId: 'b' },
      { id: 'b', name: 'B', parentId: 'a' },
    ])
    expect(resolveTopLevelCategoryName({ id: 'a', name: 'A', parentId: 'b' }, cyclic)).toBe('A')
  })

  it('end-to-end with the matcher: subcategory leaf resolves to the correct top-level glyph', () => {
    const name = resolveTopLevelCategoryName({ id: 'sub-nails', name: 'Nail Salon', parentId: 'top-beauty' }, byId)
    expect(getCategoryPinGlyph(name)).toBe(Scissors)
  })

  it('end-to-end degraded: subcategory leaf with no index gets the default glyph until categories load', () => {
    const name = resolveTopLevelCategoryName({ id: 'sub-nails', name: 'Nail Salon', parentId: 'top-beauty' }, buildCategoryTreeIndex(undefined))
    expect(getCategoryPinGlyph(name)).toBe(MapPin)
  })
})
