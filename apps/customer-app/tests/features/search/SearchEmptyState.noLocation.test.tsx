// Plan 4 M4.6 — SearchEmptyState new `no_location` reason.
//
// §M4-AMENDMENT-2026-05-22: Adds a fifth case to the existing
// SearchEmptyState switch — prompts the user to set their area when
// neither a query nor a location signal is available.  Renders an
// optional CTA button that the parent screen wires to the PC2 address
// flow via `onSetArea`.
//
// Locked copy:
//   title: "Set your area to see offers near you."
//   body:  "We use your area to show offers nearby."
//   button: "Set my area"

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { SearchEmptyState } from '@/features/search/components/SearchEmptyState'

describe('<SearchEmptyState reason="no_location"> (Plan 4 M4.6)', () => {
  it('renders the locked title + body copy', () => {
    const { getByText } = render(<SearchEmptyState reason="no_location" />)
    expect(getByText('Set your area to see offers near you.')).toBeTruthy()
    expect(getByText('We use your area to show offers nearby.')).toBeTruthy()
  })

  it('renders the Set my area CTA when onSetArea is provided', () => {
    const onSetArea = jest.fn()
    const { getByTestId, getByText } = render(
      <SearchEmptyState reason="no_location" onSetArea={onSetArea} />,
    )
    const cta = getByTestId('search-empty-no-location-cta')
    expect(cta).toBeTruthy()
    expect(getByText('Set my area')).toBeTruthy()

    fireEvent.press(cta)
    expect(onSetArea).toHaveBeenCalledTimes(1)
  })

  it('omits the CTA when onSetArea is NOT provided (presentation-only path)', () => {
    const { queryByTestId } = render(<SearchEmptyState reason="no_location" />)
    expect(queryByTestId('search-empty-no-location-cta')).toBeNull()
  })

  it('uses the standard (non-pre-search) container layout', () => {
    const { getByTestId } = render(<SearchEmptyState reason="no_location" />)
    // testID is `search-empty-${reason}` per the component contract.
    expect(getByTestId('search-empty-no_location')).toBeTruthy()
  })

  it('copy does NOT use banned PR #112 fixup-6.4 vocabulary', () => {
    // Negative pins — owner-locked vocabulary rules apply to the new
    // reason just like the existing ones.  No em dashes, no "nothing",
    // no "come back soon" / "check back soon", no "in the UK".
    const { getByText } = render(<SearchEmptyState reason="no_location" />)
    const title = getByText('Set your area to see offers near you.').props.children as string
    const body  = getByText('We use your area to show offers nearby.').props.children as string
    expect(title).not.toMatch(/—/)
    expect(body).not.toMatch(/—/)
    expect((title + body).toLowerCase()).not.toContain('nothing')
    expect((title + body).toLowerCase()).not.toContain('come back')
    expect((title + body).toLowerCase()).not.toContain('check back')
    expect((title + body).toLowerCase()).not.toContain('in the uk')
  })
})
