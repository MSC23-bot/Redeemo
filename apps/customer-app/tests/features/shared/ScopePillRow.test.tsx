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
    expect(getByText('More places')).toBeTruthy()
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
    expect(getByText('More places · 132')).toBeTruthy()
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
    fireEvent.press(getByText('More places'))
    expect(onScopeChange).toHaveBeenCalledWith('platform')
  })

  // PR #112 fixup-4 (2026-05-19) — owner override: active pill uses
  // brand-rose `#E20C04`, NOT navy.  Pin the colour explicitly to
  // catch a regression to navy.
  it('active pill uses Redeemo brand-rose background (PR #112 fixup-4 owner override)', () => {
    const { getByLabelText } = render(
      <ScopePillRow selectedScope="city" onScopeChange={jest.fn()} />,
    )
    const cityPill = getByLabelText(/Filter to Your city/i)
    // Style is an array on RN; flatten and inspect.
    const flatStyle: any = Array.isArray(cityPill.props.style)
      ? Object.assign({}, ...cityPill.props.style.filter(Boolean))
      : cityPill.props.style
    expect(flatStyle.backgroundColor).toBe('#E20C04')
    // Negative pin — navy is now WRONG for active scope pill.
    expect(flatStyle.backgroundColor).not.toBe('#010C35')
  })

  it('inactive pill uses surface-subtle background (not brand-rose)', () => {
    const { getByLabelText } = render(
      <ScopePillRow selectedScope="city" onScopeChange={jest.fn()} />,
    )
    const nearbyPill = getByLabelText(/Filter to Nearby/i)
    const flatStyle: any = Array.isArray(nearbyPill.props.style)
      ? Object.assign({}, ...nearbyPill.props.style.filter(Boolean))
      : nearbyPill.props.style
    expect(flatStyle.backgroundColor).toBe('#F3F4F6')
  })
})
