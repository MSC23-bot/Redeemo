import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { CategoryGrid } from '@/features/home/components/CategoryGrid'

const categories = [
  { id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, merchantCount: 12, parentId: null },
  { id: 'c2', name: 'Beauty', iconUrl: null, pinColour: '#E91E8C', pinIcon: null, merchantCount: 8, parentId: null },
  { id: 'c3', name: 'Fitness', iconUrl: null, pinColour: '#4CAF50', pinIcon: null, merchantCount: 5, parentId: null },
  { id: 'c4', name: 'Shopping', iconUrl: null, pinColour: '#7C4DFF', pinIcon: null, merchantCount: 10, parentId: null },
  { id: 'c5', name: 'Entertainment', iconUrl: null, pinColour: '#FF6F00', pinIcon: null, merchantCount: 3, parentId: null },
]

describe('CategoryGrid', () => {
  it('renders up to 5 categories plus More tile', () => {
    const { getByText } = render(<CategoryGrid categories={categories} onCategoryPress={jest.fn()} onMorePress={jest.fn()} />)
    expect(getByText('Food & Drink')).toBeTruthy()
    expect(getByText('More')).toBeTruthy()
  })

  it('calls onCategoryPress with category id', () => {
    const onPress = jest.fn()
    const { getByText } = render(<CategoryGrid categories={categories} onCategoryPress={onPress} onMorePress={jest.fn()} />)
    fireEvent.press(getByText('Food & Drink'))
    expect(onPress).toHaveBeenCalledWith('c1')
  })

  it('calls onMorePress when More is tapped', () => {
    const onMore = jest.fn()
    const { getByText } = render(<CategoryGrid categories={categories} onCategoryPress={jest.fn()} onMorePress={onMore} />)
    fireEvent.press(getByText('More'))
    expect(onMore).toHaveBeenCalled()
  })
})
