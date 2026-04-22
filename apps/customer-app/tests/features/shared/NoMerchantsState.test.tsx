import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { NoMerchantsState } from '@/features/shared/NoMerchantsState'

describe('NoMerchantsState', () => {
  it('renders category-specific message', () => {
    const { getByText } = render(
      <NoMerchantsState category="Pizza" area="Shoreditch" onExpandSearch={jest.fn()} onBrowseCategories={jest.fn()} />
    )
    expect(getByText('No Pizza merchants nearby')).toBeTruthy()
  })

  it('renders expand search CTA', () => {
    const onExpand = jest.fn()
    const { getByText } = render(
      <NoMerchantsState category="Pizza" area="Shoreditch" onExpandSearch={onExpand} onBrowseCategories={jest.fn()} />
    )
    fireEvent.press(getByText('Expand search area'))
    expect(onExpand).toHaveBeenCalled()
  })

  it('renders browse other categories CTA', () => {
    const onBrowse = jest.fn()
    const { getByText } = render(
      <NoMerchantsState category="Pizza" area="Shoreditch" onExpandSearch={jest.fn()} onBrowseCategories={onBrowse} />
    )
    fireEvent.press(getByText('Browse other categories'))
    expect(onBrowse).toHaveBeenCalled()
  })
})
