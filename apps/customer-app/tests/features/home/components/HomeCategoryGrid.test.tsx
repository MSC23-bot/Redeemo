import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { HomeCategoryGrid } from '@/features/home/components/HomeCategoryGrid'

// The grid renders the curated six top-level category cards plus the
// "Explore all categories" capsule. Navigation is owned by the screen, so the
// grid's contract is purely: a press fires onCategoryPress with the right name.

describe('HomeCategoryGrid', () => {
  const CARDS: Array<[string, string]> = [
    ['Food & Drink category', 'Food & Drink'],
    ['Beauty & Wellness category', 'Beauty & Wellness'],
    ['Health & Fitness category', 'Health & Fitness'],
    ['Out & About category', 'Out & About'],
    ['Shopping category', 'Shopping'],
    ['Home & Local Services category', 'Home & Local Services'],
  ]

  it.each(CARDS)('card "%s" fires onCategoryPress with its name', (label, name) => {
    const onCategoryPress = jest.fn()
    const { getByLabelText } = render(<HomeCategoryGrid onCategoryPress={onCategoryPress} />)
    fireEvent.press(getByLabelText(label))
    expect(onCategoryPress).toHaveBeenCalledWith(name)
  })

  it('renders all six curated category cards', () => {
    const { getByLabelText } = render(<HomeCategoryGrid onCategoryPress={jest.fn()} />)
    CARDS.forEach(([label]) => expect(getByLabelText(label)).toBeTruthy())
  })

  it('Explore capsule fires onCategoryPress("Explore all categories")', () => {
    const onCategoryPress = jest.fn()
    const { getByLabelText } = render(<HomeCategoryGrid onCategoryPress={onCategoryPress} />)
    fireEvent.press(getByLabelText('Explore all categories. Browse merchants by category.'))
    expect(onCategoryPress).toHaveBeenCalledWith('Explore all categories')
  })
})
