import React from 'react'
import { render } from '@testing-library/react-native'
import { ByCategory } from '@/features/savings/components/ByCategory'
import type { CategorySaving } from '@/lib/api/savings'

describe('ByCategory', () => {
  it('renders nothing when categories array is empty', () => {
    const { queryByTestId } = render(<ByCategory categories={[]} />)
    expect(queryByTestId('savings-by-category')).toBeNull()
  })

  it('renders one row per category, rendering name + amount', () => {
    const categories: CategorySaving[] = [
      { categoryId: 'food', name: 'Food & Drink', saving: 20 },
      { categoryId: 'beauty', name: 'Beauty', saving: 12 },
    ]
    const { getByTestId, getByText } = render(<ByCategory categories={categories} />)
    expect(getByTestId('savings-by-category')).toBeTruthy()
    expect(getByTestId('savings-category-row-food')).toBeTruthy()
    expect(getByTestId('savings-category-row-beauty')).toBeTruthy()
    expect(getByText('Food & Drink')).toBeTruthy()
    expect(getByText('£20.00')).toBeTruthy()
    expect(getByText('Beauty')).toBeTruthy()
    expect(getByText('£12.00')).toBeTruthy()
  })
})
