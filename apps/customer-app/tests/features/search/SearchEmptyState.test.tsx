// PR #112 fixup-6.4 (2026-05-20) — owner-locked persona copy refresh.
//
// State machine pins:
//   reason='none'              → "No exact matches for "X"" + action body
//   reason='no_uk_supply'      → "We could not find a match for "X"" + action body
//   reason='pre_search'        → "Find your next local saving" + discovery body
//   reason='expanded_to_wider' → renders null (unified header carries copy)
//   reason=null / undefined    → renders null
//
// Banned wording (regression-pinned across ALL non-null states):
//   - "Nothing"            (fixup-3 wording, owner rejected)
//   - "in the UK"          (geographic limit framing, owner rejected)
//   - "come back soon"     (dead-end framing, owner rejected)
//   - "check back soon"    (dead-end framing, owner rejected)
//   - em dashes (—)        (PRODUCT.md ban)
//   - double dashes (--)   (PRODUCT.md ban)

import React from 'react'
import { render } from '@testing-library/react-native'
import { SearchEmptyState } from '@/features/search/components/SearchEmptyState'

describe('<SearchEmptyState> — locked copy (PR #112 fixup-6.4)', () => {
  describe("reason='none' (query has no result)", () => {
    it('renders "No exact matches for X" title + action body', () => {
      const { getByText } = render(<SearchEmptyState reason="none" query="pizza" />)
      expect(getByText('No exact matches for "pizza"')).toBeTruthy()
      expect(getByText('Try a different keyword, or browse nearby categories.')).toBeTruthy()
    })

    it('query-less variant: "No exact matches" + same body', () => {
      const { getByText } = render(<SearchEmptyState reason="none" />)
      expect(getByText('No exact matches')).toBeTruthy()
      expect(getByText('Try a different keyword, or browse nearby categories.')).toBeTruthy()
    })

    it('whitespace-only query treated as no-query', () => {
      const { getByText } = render(<SearchEmptyState reason="none" query="   " />)
      expect(getByText('No exact matches')).toBeTruthy()
    })

    it('banned wording must NOT appear', () => {
      const { queryByText } = render(<SearchEmptyState reason="none" query="pizza" />)
      expect(queryByText(/Nothing/)).toBeNull()
      expect(queryByText(/in the UK/)).toBeNull()
      expect(queryByText(/come back soon/i)).toBeNull()
      expect(queryByText(/check back soon/i)).toBeNull()
      expect(queryByText(/—/)).toBeNull()
      expect(queryByText(/--/)).toBeNull()
    })
  })

  describe("reason='no_uk_supply' (no platform supply)", () => {
    it('renders "We could not find a match for X" title + action body', () => {
      const { getByText } = render(<SearchEmptyState reason="no_uk_supply" query="vegan michelin" />)
      expect(getByText('We could not find a match for "vegan michelin"')).toBeTruthy()
      expect(getByText('Try another search, or explore what is available near you.')).toBeTruthy()
    })

    it('query-less variant: "We could not find a match" + same body', () => {
      const { getByText } = render(<SearchEmptyState reason="no_uk_supply" />)
      expect(getByText('We could not find a match')).toBeTruthy()
      expect(getByText('Try another search, or explore what is available near you.')).toBeTruthy()
    })

    it('banned wording must NOT appear', () => {
      const { queryByText } = render(<SearchEmptyState reason="no_uk_supply" query="pizza" />)
      expect(queryByText(/Nothing/)).toBeNull()
      expect(queryByText(/in the UK/)).toBeNull()
      expect(queryByText(/come back soon/i)).toBeNull()
      expect(queryByText(/check back soon/i)).toBeNull()
      expect(queryByText(/we['’]re growing/i)).toBeNull()
      expect(queryByText(/—/)).toBeNull()
      expect(queryByText(/--/)).toBeNull()
    })
  })

  describe("reason='pre_search' (initial state before typing)", () => {
    it('renders discovery prompt "Find your next local saving" + persona body', () => {
      const { getByText } = render(<SearchEmptyState reason="pre_search" />)
      expect(getByText('Find your next local saving')).toBeTruthy()
      expect(getByText('Search restaurants, cafés, salons, gyms and more.')).toBeTruthy()
    })

    it('ignores `query` prop (pre-search is pre-typing)', () => {
      const { getByText } = render(<SearchEmptyState reason="pre_search" query="should-be-ignored" />)
      expect(getByText('Find your next local saving')).toBeTruthy()
    })

    it('banned wording must NOT appear', () => {
      const { queryByText } = render(<SearchEmptyState reason="pre_search" />)
      expect(queryByText(/Nothing/)).toBeNull()
      expect(queryByText(/in the UK/)).toBeNull()
      expect(queryByText(/come back soon/i)).toBeNull()
      expect(queryByText(/check back soon/i)).toBeNull()
      expect(queryByText(/—/)).toBeNull()
      expect(queryByText(/--/)).toBeNull()
    })
  })

  describe('null-render cases', () => {
    it("reason='expanded_to_wider' renders null (unified header carries copy)", () => {
      const { toJSON } = render(<SearchEmptyState reason="expanded_to_wider" />)
      expect(toJSON()).toBeNull()
    })

    it('reason=null renders null', () => {
      const { toJSON } = render(<SearchEmptyState reason={null} />)
      expect(toJSON()).toBeNull()
    })

    it('reason=undefined renders null', () => {
      const { toJSON } = render(<SearchEmptyState reason={undefined} />)
      expect(toJSON()).toBeNull()
    })
  })

  describe('testID coverage', () => {
    it('renders testID `search-empty-none` for reason=none', () => {
      const { getByTestId } = render(<SearchEmptyState reason="none" query="x" />)
      expect(getByTestId('search-empty-none')).toBeTruthy()
    })
    it('renders testID `search-empty-no_uk_supply` for reason=no_uk_supply', () => {
      const { getByTestId } = render(<SearchEmptyState reason="no_uk_supply" query="x" />)
      expect(getByTestId('search-empty-no_uk_supply')).toBeTruthy()
    })
    it('renders testID `search-empty-pre_search` for reason=pre_search', () => {
      const { getByTestId } = render(<SearchEmptyState reason="pre_search" />)
      expect(getByTestId('search-empty-pre_search')).toBeTruthy()
    })
  })
})
