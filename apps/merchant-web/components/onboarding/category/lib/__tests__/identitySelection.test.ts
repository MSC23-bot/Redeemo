import {
  cuisineApplies,
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

describe('cuisineApplies (derived from the backend taxonomy, NOT a hardcoded list)', () => {
  it('is true when the subcategory has at least one CUISINE tag', () => {
    expect(cuisineApplies(restaurant)).toBe(true)
  })
  it('is false when the subcategory has no CUISINE tag', () => {
    expect(cuisineApplies(barber)).toBe(false)
  })
  it('is false for a null subcategory', () => {
    expect(cuisineApplies(null)).toBe(false)
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
})

describe('composeDescriptor', () => {
  it('is "" with no subcategory', () => {
    expect(composeDescriptor({ subcategory: null, selectedCuisineIds: [] })).toBe('')
  })
  it('is just the subcategory name when cuisine does not apply', () => {
    expect(composeDescriptor({ subcategory: barber, selectedCuisineIds: [] })).toBe('Barber')
  })
  it('prepends the cuisine labels when cuisine applies', () => {
    expect(
      composeDescriptor({ subcategory: restaurant, selectedCuisineIds: ['cui-modern-british'] }),
    ).toBe('Modern British Restaurant')
  })
  it('joins multiple cuisines in selection order before the subcategory', () => {
    expect(
      composeDescriptor({ subcategory: restaurant, selectedCuisineIds: ['cui-modern-british', 'cui-italian'] }),
    ).toBe('Modern British Italian Restaurant')
  })
  it('is just the subcategory name when cuisine applies but none picked yet', () => {
    expect(composeDescriptor({ subcategory: restaurant, selectedCuisineIds: [] })).toBe('Restaurant')
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
