import { resolveCategoryDisplay } from '@/lib/business-profile/categoryDisplay'
import type { OnboardingTaxonomy } from '@/lib/api/taxonomy'

function taxonomy(): OnboardingTaxonomy {
  return {
    categories: [
      {
        id: 'cat-food',
        name: 'Food & Drink',
        parentId: null,
        eligible: true,
        subcategories: [
          {
            id: 'sub-restaurant',
            name: 'Restaurant',
            parentId: 'cat-food',
            tags: [
              { id: 'tag-modern-british', label: 'Modern British', type: 'CUISINE', isPrimaryEligible: true },
              { id: 'tag-vegan', label: 'Vegan friendly', type: 'SPECIALTY', isPrimaryEligible: false },
            ],
          },
        ],
      },
    ],
  }
}

describe('resolveCategoryDisplay', () => {
  it('returns null while the taxonomy has not loaded', () => {
    expect(resolveCategoryDisplay(undefined, 'sub-restaurant', 'tag-modern-british')).toBeNull()
  })

  it('returns null when the merchant has no saved category', () => {
    expect(resolveCategoryDisplay(taxonomy(), null, null)).toBeNull()
  })

  it('composes "<top-level name> · <cuisine + subcategory>" when a descriptor tag is set', () => {
    const result = resolveCategoryDisplay(taxonomy(), 'sub-restaurant', 'tag-modern-british')
    expect(result).toEqual({ topLevelName: 'Food & Drink', descriptor: 'Modern British Restaurant' })
  })

  it('falls back to just the subcategory name when there is no descriptor tag', () => {
    const result = resolveCategoryDisplay(taxonomy(), 'sub-restaurant', null)
    expect(result).toEqual({ topLevelName: 'Food & Drink', descriptor: 'Restaurant' })
  })

  it('ignores a descriptor tag id that does not belong to the resolved subcategory', () => {
    const result = resolveCategoryDisplay(taxonomy(), 'sub-restaurant', 'not-a-real-tag')
    expect(result).toEqual({ topLevelName: 'Food & Drink', descriptor: 'Restaurant' })
  })

  it('ignores a non-CUISINE tag id even if it exists on the subcategory', () => {
    // tag-vegan is a SPECIALTY tag, not CUISINE - must not be used as the descriptor.
    const result = resolveCategoryDisplay(taxonomy(), 'sub-restaurant', 'tag-vegan')
    expect(result).toEqual({ topLevelName: 'Food & Drink', descriptor: 'Restaurant' })
  })

  it('returns null when the subcategory id does not exist in the taxonomy', () => {
    expect(resolveCategoryDisplay(taxonomy(), 'unknown-sub', null)).toBeNull()
  })
})
