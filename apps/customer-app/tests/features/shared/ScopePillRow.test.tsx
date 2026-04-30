import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { ScopePillRow } from '@/features/shared/ScopePillRow'

describe('ScopePillRow', () => {
  it('renders the locked three-pill set', () => {
    const { getByText, queryByText } = render(
      <ScopePillRow selectedScope={undefined} onScopeChange={jest.fn()} />,
    )
    expect(getByText('Nearby')).toBeTruthy()
    expect(getByText('Your city')).toBeTruthy()
    expect(getByText('UK-wide')).toBeTruthy()
    // `region` is reserved-for-future and explicitly NOT surfaced
    expect(queryByText(/Region/i)).toBeNull()
  })

  it('appends counts when provided', () => {
    const { getByText } = render(
      <ScopePillRow
        selectedScope="city"
        onScopeChange={jest.fn()}
        counts={{ nearby: 3, city: 47, platform: 132 }}
      />,
    )
    expect(getByText('Nearby · 3')).toBeTruthy()
    expect(getByText('Your city · 47')).toBeTruthy()
    expect(getByText('UK-wide · 132')).toBeTruthy()
  })

  it('omits counts when prop is absent', () => {
    const { getByText, queryByText } = render(
      <ScopePillRow selectedScope={undefined} onScopeChange={jest.fn()} />,
    )
    expect(getByText('Nearby')).toBeTruthy()
    expect(queryByText(/·/)).toBeNull()
  })

  it('calls onScopeChange with the pill key when pressed', () => {
    const onScopeChange = jest.fn()
    const { getByText } = render(
      <ScopePillRow selectedScope={undefined} onScopeChange={onScopeChange} />,
    )
    fireEvent.press(getByText('Your city'))
    expect(onScopeChange).toHaveBeenCalledWith('city')
    fireEvent.press(getByText('UK-wide'))
    expect(onScopeChange).toHaveBeenCalledWith('platform')
  })
})
