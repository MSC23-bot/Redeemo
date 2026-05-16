// §BE 2026-05-17 — SearchBar must forward `onSubmitEditing` to its
// underlying TextInput so consumers (currently MapScreen for the
// LocationSearch return-key behaviour) can resolve the typed query.
// Pre-§BE the SearchBar prop signature didn't accept the handler;
// `returnKeyType="search"` was wired but pressing the keyboard
// search key did nothing.

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { SearchBar } from '@/features/search/components/SearchBar'

describe('SearchBar — §BE onSubmitEditing forwarding', () => {
  it('fires onSubmitEditing when the TextInput submit event is triggered', () => {
    const onSubmitEditing = jest.fn()
    const { getByLabelText } = render(
      <SearchBar
        value="Huddersfield"
        onChangeText={jest.fn()}
        onSubmitEditing={onSubmitEditing}
      />,
    )
    fireEvent(getByLabelText('Search merchants'), 'submitEditing')
    expect(onSubmitEditing).toHaveBeenCalledTimes(1)
  })

  it('does not require onSubmitEditing — omitting it leaves the TextInput inert on submit (existing consumer contract)', () => {
    // Regression pin: Home / Search / Profile screens use SearchBar
    // without the new prop. The TextInput should not throw when the
    // keyboard return key is pressed and no handler is wired.
    const { getByLabelText } = render(
      <SearchBar value="" onChangeText={jest.fn()} />,
    )
    expect(() => {
      fireEvent(getByLabelText('Search merchants'), 'submitEditing')
    }).not.toThrow()
  })
})
