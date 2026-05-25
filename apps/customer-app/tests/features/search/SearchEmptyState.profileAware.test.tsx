// §DF PR #128 R2-7b + R2-8 — profile-aware no_location empty state.
//
// Pre-fix the Search no_location state hard-coded "Set your area to
// see offers near you" + a single "Set my area" CTA — wrong for users
// who DID have a saved postcode but were searching with location off.
//
// Owner-locked behaviour:
//   - With `savedAreaCity` resolved (user has saved postcode):
//       title: "Searching near {city} from your saved postcode"
//       body:  "Turn on location for the most accurate nearby offers,
//               or change your saved area."
//       dual CTAs: "Use current location" / "Change saved area"
//   - Without `savedAreaCity` (no saved postcode):
//       existing "Set your area" copy + single "Set my area" CTA
//       (now routing to /saved-area, NOT the old PC2-address path).

import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { SearchEmptyState } from '@/features/search/components/SearchEmptyState'

describe('<SearchEmptyState reason="no_location"> profile-aware (§DF PR #128 R2-7b)', () => {
  describe('with savedAreaCity (user has a saved postcode)', () => {
    it('renders the profile-aware title with the saved city interpolated', () => {
      const { getByText, queryByText } = render(
        <SearchEmptyState reason="no_location" savedAreaCity="Brightlingsea" />,
      )
      expect(getByText('Searching near Brightlingsea from your saved location')).toBeTruthy()
      expect(
        getByText('Turn on location for the most accurate nearby offers, or change your saved location.'),
      ).toBeTruthy()
      // Locked: must NOT show the "Set your area" prompt — the user
      // already HAS a saved area.
      expect(queryByText('Set your area to see offers near you.')).toBeNull()
      expect(queryByText('We use your area to show offers nearby.')).toBeNull()
    })

    it('renders BOTH dual CTAs when both handlers are provided', () => {
      const onUseCurrentLocation = jest.fn()
      const onChangeSavedArea = jest.fn()
      const { getByTestId, getByText, queryByTestId } = render(
        <SearchEmptyState
          reason="no_location"
          savedAreaCity="Brightlingsea"
          onUseCurrentLocation={onUseCurrentLocation}
          onChangeSavedArea={onChangeSavedArea}
        />,
      )
      const useCurrent = getByTestId('search-empty-no-location-use-current')
      const changeSaved = getByTestId('search-empty-no-location-change-saved')
      expect(useCurrent).toBeTruthy()
      expect(changeSaved).toBeTruthy()
      expect(getByText('Use current location')).toBeTruthy()
      expect(getByText('Change saved location')).toBeTruthy()
      // The original "Set my area" CTA (single-button variant) is
      // suppressed when savedAreaCity is set, regardless of whether
      // onSetArea is provided.
      expect(queryByTestId('search-empty-no-location-cta')).toBeNull()
    })

    it('"Use current location" tap fires onUseCurrentLocation', () => {
      const onUseCurrentLocation = jest.fn()
      const onChangeSavedArea = jest.fn()
      const { getByTestId } = render(
        <SearchEmptyState
          reason="no_location"
          savedAreaCity="Brightlingsea"
          onUseCurrentLocation={onUseCurrentLocation}
          onChangeSavedArea={onChangeSavedArea}
        />,
      )
      fireEvent.press(getByTestId('search-empty-no-location-use-current'))
      expect(onUseCurrentLocation).toHaveBeenCalledTimes(1)
      expect(onChangeSavedArea).not.toHaveBeenCalled()
    })

    it('"Change saved area" tap fires onChangeSavedArea', () => {
      const onUseCurrentLocation = jest.fn()
      const onChangeSavedArea = jest.fn()
      const { getByTestId } = render(
        <SearchEmptyState
          reason="no_location"
          savedAreaCity="Brightlingsea"
          onUseCurrentLocation={onUseCurrentLocation}
          onChangeSavedArea={onChangeSavedArea}
        />,
      )
      fireEvent.press(getByTestId('search-empty-no-location-change-saved'))
      expect(onChangeSavedArea).toHaveBeenCalledTimes(1)
      expect(onUseCurrentLocation).not.toHaveBeenCalled()
    })
  })

  describe('without savedAreaCity (user has no saved postcode)', () => {
    it('renders the original "Set your area" copy + single CTA', () => {
      const onSetArea = jest.fn()
      const { getByText, getByTestId, queryByTestId } = render(
        <SearchEmptyState reason="no_location" onSetArea={onSetArea} />,
      )
      expect(getByText('Set your area to see offers near you.')).toBeTruthy()
      expect(getByText('We use your area to show offers nearby.')).toBeTruthy()
      expect(getByTestId('search-empty-no-location-cta')).toBeTruthy()
      // Dual CTAs must NOT render in the no-saved-area variant.
      expect(queryByTestId('search-empty-no-location-use-current')).toBeNull()
      expect(queryByTestId('search-empty-no-location-change-saved')).toBeNull()
    })

    it('treats null savedAreaCity as no-saved-area (renders the original prompt)', () => {
      const onSetArea = jest.fn()
      const { getByText } = render(
        <SearchEmptyState reason="no_location" savedAreaCity={null} onSetArea={onSetArea} />,
      )
      expect(getByText('Set your area to see offers near you.')).toBeTruthy()
    })

    it('"Set my area" CTA tap fires onSetArea', () => {
      const onSetArea = jest.fn()
      const { getByTestId } = render(
        <SearchEmptyState reason="no_location" onSetArea={onSetArea} />,
      )
      fireEvent.press(getByTestId('search-empty-no-location-cta'))
      expect(onSetArea).toHaveBeenCalledTimes(1)
    })
  })

  describe('banned wording', () => {
    it('profile-aware variant copy avoids the PR #112 fixup-6.4 banned vocabulary', () => {
      const { getByText } = render(
        <SearchEmptyState reason="no_location" savedAreaCity="Brightlingsea" />,
      )
      const title = getByText(
        'Searching near Brightlingsea from your saved location',
      ).props.children as string
      const body = getByText(
        'Turn on location for the most accurate nearby offers, or change your saved location.',
      ).props.children as string
      expect(title).not.toMatch(/—/)
      expect(body).not.toMatch(/—/)
      expect((title + body).toLowerCase()).not.toContain('nothing')
      expect((title + body).toLowerCase()).not.toContain('come back')
      expect((title + body).toLowerCase()).not.toContain('check back')
      expect((title + body).toLowerCase()).not.toContain('in the uk')
    })
  })
})
