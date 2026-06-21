import {
  cuisineApplies,
  cuisineOptions,
  cuisineTags,
  specialtyTags,
  canSave,
  composeDescriptor,
  buildIdentityBody,
} from '@/components/onboarding/category/lib/identitySelection'
import type { TaxonomySubcategory } from '@/lib/api/taxonomy'

// A FOOD subcategory carrying CUISINE tags (so cuisine applies). Mirrors the backend
// taxonomy shape: each cuisine tag has isPrimaryEligible.
const restaurant: TaxonomySubcategory = {
  id: 'sub-restaurant',
  name: 'Restaurant',
  parentId: 'cat-food',
  tags: [
    { id: 'cui-modern-british', label: 'Modern British', type: 'CUISINE', isPrimaryEligible: true },
    { id: 'cui-italian', label: 'Italian', type: 'CUISINE', isPrimaryEligible: true },
    { id: 'spec-brunch', label: 'Brunch', type: 'SPECIALTY', isPrimaryEligible: false },
    { id: 'spec-vegan', label: 'Vegan', type: 'SPECIALTY', isPrimaryEligible: false },
  ],
}

// A NON-food subcategory with NO cuisine tags (cuisine does NOT apply).
const barber: TaxonomySubcategory = {
  id: 'sub-barber',
  name: 'Barber',
  parentId: 'cat-beauty',
  tags: [
    { id: 'spec-skin-fade', label: 'Skin Fade', type: 'SPECIALTY', isPrimaryEligible: false },
    { id: 'spec-beard', label: 'Beard Trim', type: 'SPECIALTY', isPrimaryEligible: false },
  ],
}

// A FOOD subcategory whose CUISINE tags are ALL isPrimaryEligible:false (mirrors the
// real seed for Cafe & Coffee / Bakery / Dessert Shop / Bar / Food Hall). The backend
// rejects any non-eligible cuisine as the descriptor (TAG_NOT_ELIGIBLE), so cuisine
// must NOT apply here: no cuisine step, no forced pick, descriptor = subcategory name.
const bar: TaxonomySubcategory = {
  id: 'sub-bar',
  name: 'Bar',
  parentId: 'cat-food',
  tags: [
    { id: 'cui-cocktail', label: 'Cocktail', type: 'CUISINE', isPrimaryEligible: false },
    { id: 'cui-wine', label: 'Wine', type: 'CUISINE', isPrimaryEligible: false },
    { id: 'spec-craft-beer', label: 'Craft Beer', type: 'SPECIALTY', isPrimaryEligible: false },
  ],
}

describe('cuisineApplies (eligible-only: a forced descriptor pick must be able to persist)', () => {
  it('is true when the subcategory has at least one isPrimaryEligible CUISINE tag', () => {
    expect(cuisineApplies(restaurant)).toBe(true)
  })
  it('is false when the subcategory has no CUISINE tag', () => {
    expect(cuisineApplies(barber)).toBe(false)
  })
  it('is false when EVERY CUISINE tag is isPrimaryEligible:false (e.g. Bar / Cafe / Bakery / Dessert / Food Hall)', () => {
    // The previewed cuisine could never persist as the descriptor (backend
    // TAG_NOT_ELIGIBLE), so cuisine must not apply and must not force a pick.
    expect(cuisineApplies(bar)).toBe(false)
  })
  it('is false for a null subcategory', () => {
    expect(cuisineApplies(null)).toBe(false)
  })
})

describe('cuisineOptions (the SELECTABLE cuisines = eligible-only)', () => {
  it('returns only the isPrimaryEligible CUISINE tags', () => {
    expect(cuisineOptions(restaurant).map((t) => t.id)).toEqual(['cui-modern-british', 'cui-italian'])
  })
  it('returns [] when every CUISINE tag is non-eligible (so nothing un-persistable is offered)', () => {
    expect(cuisineOptions(bar)).toEqual([])
  })
  it('returns [] when there are no CUISINE tags at all', () => {
    expect(cuisineOptions(barber)).toEqual([])
  })
  it('drops the non-eligible cuisines, keeping only the eligible ones', () => {
    const mixed: TaxonomySubcategory = {
      id: 'sub-mixed',
      name: 'Mixed',
      parentId: 'cat',
      tags: [
        { id: 'cui-a', label: 'A', type: 'CUISINE', isPrimaryEligible: false },
        { id: 'cui-b', label: 'B', type: 'CUISINE', isPrimaryEligible: true },
      ],
    }
    expect(cuisineOptions(mixed).map((t) => t.id)).toEqual(['cui-b'])
  })
})

describe('tag partitioning', () => {
  it('cuisineTags returns only the CUISINE tags', () => {
    expect(cuisineTags(restaurant).map((t) => t.id)).toEqual(['cui-modern-british', 'cui-italian'])
  })
  it('specialtyTags returns only the SPECIALTY tags', () => {
    expect(specialtyTags(restaurant).map((t) => t.id)).toEqual(['spec-brunch', 'spec-vegan'])
    expect(specialtyTags(barber).map((t) => t.id)).toEqual(['spec-skin-fade', 'spec-beard'])
  })
})

describe('canSave', () => {
  it('is false with no category', () => {
    expect(canSave({ categoryId: null, subcategory: restaurant, selectedCuisineIds: ['cui-italian'] })).toBe(false)
  })
  it('is false with no subcategory', () => {
    expect(canSave({ categoryId: 'cat-food', subcategory: null, selectedCuisineIds: [] })).toBe(false)
  })
  it('requires >=1 cuisine when cuisine applies', () => {
    expect(canSave({ categoryId: 'cat-food', subcategory: restaurant, selectedCuisineIds: [] })).toBe(false)
    expect(canSave({ categoryId: 'cat-food', subcategory: restaurant, selectedCuisineIds: ['cui-italian'] })).toBe(true)
  })
  it('does NOT require a cuisine when cuisine does not apply', () => {
    expect(canSave({ categoryId: 'cat-beauty', subcategory: barber, selectedCuisineIds: [] })).toBe(true)
  })
  it('does NOT require a cuisine when every CUISINE tag is non-eligible (Bar)', () => {
    expect(canSave({ categoryId: 'cat-food', subcategory: bar, selectedCuisineIds: [] })).toBe(true)
  })
})

describe('composeDescriptor (preview ALWAYS equals what persists)', () => {
  it('is "" with no subcategory', () => {
    expect(composeDescriptor({ subcategory: null, selectedCuisineIds: [] })).toBe('')
  })
  it('is just the subcategory name when cuisine does not apply', () => {
    expect(composeDescriptor({ subcategory: barber, selectedCuisineIds: [] })).toBe('Barber')
  })
  it('is just the subcategory name when every CUISINE tag is non-eligible (Bar)', () => {
    expect(composeDescriptor({ subcategory: bar, selectedCuisineIds: [] })).toBe('Bar')
  })
  it('prepends the cuisine label when cuisine applies', () => {
    expect(
      composeDescriptor({ subcategory: restaurant, selectedCuisineIds: ['cui-modern-british'] }),
    ).toBe('Modern British Restaurant')
  })
  it('previews ONLY the primary (first eligible) cuisine, never the extra folded ones', () => {
    // The 2nd cuisine folds into specialtyTagIds, so it must NOT appear in the
    // descriptor (preview === stored: only primaryDescriptorTagId is the descriptor).
    expect(
      composeDescriptor({ subcategory: restaurant, selectedCuisineIds: ['cui-modern-british', 'cui-italian'] }),
    ).toBe('Modern British Restaurant')
  })
  it('is just the subcategory name when cuisine applies but none picked yet', () => {
    expect(composeDescriptor({ subcategory: restaurant, selectedCuisineIds: [] })).toBe('Restaurant')
  })
  it('previews the first ELIGIBLE cuisine as the descriptor even if a non-eligible was selected first', () => {
    const mixed: TaxonomySubcategory = {
      id: 'sub-mixed',
      name: 'Mixed',
      parentId: 'cat',
      tags: [
        { id: 'cui-a', label: 'A', type: 'CUISINE', isPrimaryEligible: false },
        { id: 'cui-b', label: 'B', type: 'CUISINE', isPrimaryEligible: true },
      ],
    }
    // 'cui-a' is not offered as an option, but defensively the preview tracks the
    // descriptor (the first eligible selected) so it equals what buildIdentityBody stores.
    expect(composeDescriptor({ subcategory: mixed, selectedCuisineIds: ['cui-a', 'cui-b'] })).toBe('B Mixed')
  })
})

describe('buildIdentityBody (the EXACT POST shape)', () => {
  it('non-food: descriptor null, specialties carry the picks', () => {
    expect(
      buildIdentityBody({
        subcategory: barber,
        selectedCuisineIds: [],
        selectedSpecialtyIds: ['spec-skin-fade', 'spec-beard'],
      }),
    ).toEqual({
      subcategoryId: 'sub-barber',
      primaryDescriptorTagId: null,
      specialtyTagIds: ['spec-skin-fade', 'spec-beard'],
    })
  })

  it('food single cuisine: primaryDescriptorTagId = the eligible cuisine; specialties stay separate', () => {
    expect(
      buildIdentityBody({
        subcategory: restaurant,
        selectedCuisineIds: ['cui-modern-british'],
        selectedSpecialtyIds: ['spec-brunch'],
      }),
    ).toEqual({
      subcategoryId: 'sub-restaurant',
      primaryDescriptorTagId: 'cui-modern-british',
      specialtyTagIds: ['spec-brunch'],
    })
  })

  it('food multi cuisine: first eligible is the descriptor; extra cuisines fold into the MerchantTag set', () => {
    expect(
      buildIdentityBody({
        subcategory: restaurant,
        selectedCuisineIds: ['cui-modern-british', 'cui-italian'],
        selectedSpecialtyIds: ['spec-vegan'],
      }),
    ).toEqual({
      subcategoryId: 'sub-restaurant',
      primaryDescriptorTagId: 'cui-modern-british',
      specialtyTagIds: ['spec-vegan', 'cui-italian'],
    })
  })

  it('the descriptor tag is never duplicated into specialtyTagIds', () => {
    const body = buildIdentityBody({
      subcategory: restaurant,
      selectedCuisineIds: ['cui-modern-british', 'cui-italian'],
      selectedSpecialtyIds: [],
    })
    expect(body.specialtyTagIds).not.toContain('cui-modern-british')
    expect(body.specialtyTagIds).toEqual(['cui-italian'])
  })

  it('all-non-eligible cuisines (Bar): descriptor stays null and specialties carry the picks', () => {
    // No cuisine is offered for Bar, so selectedCuisineIds is empty in practice; the
    // body persists a NULL descriptor and the descriptor preview (subcategory name)
    // is exactly what surfaces. This is the no-lost-descriptor invariant.
    expect(
      buildIdentityBody({
        subcategory: bar,
        selectedCuisineIds: [],
        selectedSpecialtyIds: ['spec-craft-beer'],
      }),
    ).toEqual({
      subcategoryId: 'sub-bar',
      primaryDescriptorTagId: null,
      specialtyTagIds: ['spec-craft-beer'],
    })
  })

  it('picks the FIRST isPrimaryEligible cuisine as the descriptor', () => {
    const subWithNonEligibleFirst: TaxonomySubcategory = {
      id: 'sub-x',
      name: 'X',
      parentId: 'cat',
      tags: [
        { id: 'cui-a', label: 'A', type: 'CUISINE', isPrimaryEligible: false },
        { id: 'cui-b', label: 'B', type: 'CUISINE', isPrimaryEligible: true },
      ],
    }
    const body = buildIdentityBody({
      subcategory: subWithNonEligibleFirst,
      selectedCuisineIds: ['cui-a', 'cui-b'],
      selectedSpecialtyIds: [],
    })
    expect(body.primaryDescriptorTagId).toBe('cui-b')
    // the non-eligible selected cuisine still rides in the MerchantTag set
    expect(body.specialtyTagIds).toContain('cui-a')
  })
})
