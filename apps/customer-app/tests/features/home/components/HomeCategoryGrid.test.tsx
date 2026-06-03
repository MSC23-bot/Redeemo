import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { HomeCategoryGrid } from '@/features/home/components/HomeCategoryGrid'
import { EXPLORE_ALL_SLUG } from '@/features/shared/categorySlug'

// The grid renders the curated six top-level category cards plus the
// "Explore all categories" capsule. Navigation is owned by the screen, so the
// grid's contract is purely: a press fires onCategoryPress with the right
// CANONICAL SLUG (the screen maps slug → backend category id).

describe('HomeCategoryGrid', () => {
  const CARDS: Array<[string, string]> = [
    ['Food & Drink category', 'food-drink'],
    ['Beauty & Wellness category', 'beauty-wellness'],
    ['Health & Fitness category', 'health-fitness'],
    ['Out & About category', 'out-about'],
    ['Shopping category', 'shopping'],
    ['Home & Local Services category', 'home-local-services'],
  ]

  it.each(CARDS)('card "%s" fires onCategoryPress with its canonical slug', (label, slug) => {
    const onCategoryPress = jest.fn()
    const { getByLabelText } = render(<HomeCategoryGrid onCategoryPress={onCategoryPress} />)
    fireEvent.press(getByLabelText(label))
    expect(onCategoryPress).toHaveBeenCalledWith(slug)
  })

  it('renders all six curated category cards', () => {
    const { getByLabelText } = render(<HomeCategoryGrid onCategoryPress={jest.fn()} />)
    CARDS.forEach(([label]) => expect(getByLabelText(label)).toBeTruthy())
  })

  it('Explore capsule fires onCategoryPress(EXPLORE_ALL_SLUG)', () => {
    const onCategoryPress = jest.fn()
    const { getByLabelText } = render(<HomeCategoryGrid onCategoryPress={onCategoryPress} />)
    fireEvent.press(getByLabelText('Explore all categories. Browse merchants by category.'))
    expect(onCategoryPress).toHaveBeenCalledWith(EXPLORE_ALL_SLUG)
  })
})
