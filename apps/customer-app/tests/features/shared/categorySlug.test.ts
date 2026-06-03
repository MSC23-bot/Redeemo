import { categorySlug, resolveCategoryRoute, EXPLORE_ALL_SLUG } from '@/features/shared/categorySlug'

describe('categorySlug', () => {
  it.each([
    ['Food & Drink', 'food-drink'],
    ['Beauty & Wellness', 'beauty-wellness'],
    ['Health & Fitness', 'health-fitness'],
    ['Out & About', 'out-about'],
    ['Shopping', 'shopping'],
    ['Home & Local Services', 'home-local-services'],
  ])('slugifies %s → %s (matches the curated Home card slugs)', (name, slug) => {
    expect(categorySlug(name)).toBe(slug)
  })
})

describe('resolveCategoryRoute', () => {
  const categories = [
    { id: 'c-food', name: 'Food & Drink' },
    { id: 'c-beauty', name: 'Beauty & Wellness' },
    { id: 'c-home', name: 'Home & Local Services' },
  ]

  it('matches a curated card slug to the backend category id', () => {
    expect(resolveCategoryRoute('food-drink', categories)).toEqual({ kind: 'category', id: 'c-food' })
    expect(resolveCategoryRoute('home-local-services', categories)).toEqual({ kind: 'category', id: 'c-home' })
  })

  it('routes the Explore sentinel to the all-categories list', () => {
    expect(resolveCategoryRoute(EXPLORE_ALL_SLUG, categories)).toEqual({ kind: 'all', reason: 'explore' })
  })

  it('falls back to the all-categories list (unresolved) when categories are not loaded yet', () => {
    expect(resolveCategoryRoute('food-drink', undefined)).toEqual({
      kind: 'all',
      reason: 'unresolved',
      slug: 'food-drink',
    })
  })

  it('falls back to the all-categories list (unresolved) when no backend slug matches', () => {
    expect(resolveCategoryRoute('health-fitness', categories)).toEqual({
      kind: 'all',
      reason: 'unresolved',
      slug: 'health-fitness',
    })
  })

  it('still resolves when the backend changes display casing/wording within the same slug (the regression #2 fix)', () => {
    // Exact name-match used to break here; slug-match survives a casing change.
    expect(resolveCategoryRoute('food-drink', [{ id: 'c1', name: 'food & drink' }])).toEqual({
      kind: 'category',
      id: 'c1',
    })
  })
})
