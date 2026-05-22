// §CD v1 (2026-05-22) — SearchResultItem renders matchContext line.
//
// Locked behaviour:
//   - tile.matchContext is non-null  → render a small line via
//                                      testID="search-result-match-context"
//   - tile.matchContext is null/undef → line is NOT rendered
//   - copy format follows the backend lock: `Found in "<title>" voucher`

import React from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SearchResultItem } from '@/features/search/components/SearchResultItem'
import { makeBranchTile } from '../../fixtures/branchTile'

function render(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(React.createElement(QueryClientProvider, { client: qc }, ui))
}

describe('<SearchResultItem> matchContext line (§CD v1)', () => {
  it('renders the matchContext line when present', () => {
    const tile = makeBranchTile({
      id: 'brn-1',
      matchContext: 'Found in "Free Samosa with Any Chai" voucher',
      merchant: { id: 'm1', businessName: 'Karaara' },
    })
    const { getByTestId, getByText } = render(
      <SearchResultItem tile={tile} query="samosa" onPress={() => {}} />,
    )
    expect(getByTestId('search-result-match-context')).toBeTruthy()
    expect(getByText('Found in "Free Samosa with Any Chai" voucher')).toBeTruthy()
  })

  it('does NOT render the matchContext line when null', () => {
    const tile = makeBranchTile({
      id: 'brn-2',
      matchContext: null,
      merchant: { id: 'm2', businessName: 'No Context Merchant' },
    })
    const { queryByTestId, queryByText } = render(
      <SearchResultItem tile={tile} query="test" onPress={() => {}} />,
    )
    expect(queryByTestId('search-result-match-context')).toBeNull()
    expect(queryByText(/^Found in /)).toBeNull()
  })

  it('does NOT render the matchContext line when undefined (older mock fixtures)', () => {
    // Some legacy fixtures pre-§CD may emit BranchTile shapes without
    // matchContext at all (customer-app schema declares
    // .nullable().optional()).  Render must still hide the line.
    const tile: any = makeBranchTile({ id: 'brn-3', merchant: { id: 'm3', businessName: 'Legacy' } })
    delete tile.matchContext
    const { queryByTestId } = render(
      <SearchResultItem tile={tile} query="test" onPress={() => {}} />,
    )
    expect(queryByTestId('search-result-match-context')).toBeNull()
  })

  it('matchContext copy matches the locked backend format `Found in "<title>" voucher`', () => {
    // Regex pin against the locked §0.2 copy.  Title segment must be
    // wrapped in double quotes; trailing literal ` voucher` always
    // present.  Guards against drift to alternate phrasings like
    // "in voucher: ..." or `Match: ...`.
    const tile = makeBranchTile({
      id: 'brn-4',
      matchContext: 'Found in "Some Voucher Name" voucher',
      merchant: { id: 'm4', businessName: 'Some Merchant' },
    })
    const { getByText } = render(
      <SearchResultItem tile={tile} query="some" onPress={() => {}} />,
    )
    const node = getByText(/^Found in "[^"]+" voucher$/)
    expect(node).toBeTruthy()
  })
})
