import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { ActionRow } from '@/features/merchant/components/ActionRow'

describe('ActionRow', () => {
  it('renders Website + Contact + Directions when hasWebsite is true', () => {
    const { getByText } = render(
      <ActionRow hasWebsite={true} onWebsite={() => {}} onContact={() => {}} onDirections={() => {}} />
    )
    expect(getByText('Website')).toBeTruthy()
    expect(getByText('Contact')).toBeTruthy()
    expect(getByText('Directions')).toBeTruthy()
  })

  it('hides Website when hasWebsite is false', () => {
    const { queryByText, getByText } = render(
      <ActionRow hasWebsite={false} onWebsite={() => {}} onContact={() => {}} onDirections={() => {}} />
    )
    expect(queryByText('Website')).toBeNull()
    expect(getByText('Contact')).toBeTruthy()
    expect(getByText('Directions')).toBeTruthy()
  })

  it('fires onContact when Contact pressed', () => {
    const onContact = jest.fn()
    const { getByText } = render(
      <ActionRow hasWebsite={false} onWebsite={() => {}} onContact={onContact} onDirections={() => {}} />
    )
    fireEvent.press(getByText('Contact'))
    expect(onContact).toHaveBeenCalledTimes(1)
  })

  it('fires onDirections when Directions pressed', () => {
    const onDirections = jest.fn()
    const { getByText } = render(
      <ActionRow hasWebsite={false} onWebsite={() => {}} onContact={() => {}} onDirections={onDirections} />
    )
    fireEvent.press(getByText('Directions'))
    expect(onDirections).toHaveBeenCalledTimes(1)
  })
})
