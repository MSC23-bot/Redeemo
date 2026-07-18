// PR-3 Phase C — MapListView half-sheet consumes BranchTile[] and
// each row is branch-keyed.  Two branches of the same merchant
// render as TWO distinct rows (Covelum bug closure on the list
// surface).
//
// Map Phase 2 S4 Task 2 (2026-07-11) — the bespoke `BranchRow` (coloured
// category thumb, no heart) is replaced by the SHARED
// `<BranchTile size="compact">`, matching Home/Category/Map-carousel. This
// intentionally changes some row-level presentation details that the
// pre-S4 tests pinned to BranchRow's OWN implementation:
//   - Row thumbnail: was a 52×52 category-coloured letter circle
//     (`getCategoryColor`); now `<BranchTile>`'s own banner + straddling
//     logo (real image, or a navy initials square) — the Fold-2 pinColour
//     thumbnail tests below are superseded by BranchTile's own image
//     tests (`BranchTile.image.test.tsx`) and are REMOVED here, not
//     silently dropped: this file's replacement coverage is the new
//     "logo/heart parity" describe block.
//   - Distance copy: was the long-form `formatDistance` ("X.X miles
//     away"); `<BranchTile>` uses the compact `formatDistanceCompact`
//     ("X.X mi") — same as every other BranchTile consumer (Home,
//     Category, Map carousel). Updated below, not removed: this file
//     still pins that Map's list rows show A distance string, just in
//     the shared-tile compact format now.
// Every invariant NOT about BranchRow's bespoke visuals (header, count,
// branch-first cardinality, tap-through) is preserved unchanged.

import React from 'react'
import { render as rtlRender, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MapListView } from '@/features/map/components/MapListView'
import { makeBranchTile } from '../../fixtures/branchTile'

// `<BranchTile>` renders `<FavouriteHeart>` which calls `useFavourite()` →
// `useQueryClient()` — every render needs a `<QueryClientProvider>` in
// the tree (matches BranchTile's own test files).
function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

const noopSort = { sortBy: 'relevance' as const, onSortByChange: jest.fn() }

const mockBranches = [
  makeBranchTile({
    id:              'brn-bella-soho',
    branchName:      'Soho',
    branchLatitude:  51.5141,
    branchLongitude: -0.1310,
    distance:        500,
    avgRating:       4.2,
    reviewCount:     30,
    merchant: {
      id:                 'm-bella-italia',
      businessName:       'Bella Italia',
      primaryCategory:    { id: 'c1', name: 'Food & Drink', pinColour: null, pinIcon: null, parentId: null },
      voucherCount:       2,
      maxEstimatedSaving: 20,
    },
  }),
  makeBranchTile({
    id:              'brn-nails-westend',
    branchName:      'West End',
    branchLatitude:  51.5145,
    branchLongitude: -0.1300,
    distance:        1200,
    isFavourited:    true,
    merchant: {
      id:                 'm-nails-beauty',
      businessName:       'Nails & Beauty',
      primaryCategory:    { id: 'c2', name: 'Beauty & Wellness', pinColour: null, pinIcon: null, parentId: null },
      voucherCount:       1,
      maxEstimatedSaving: 10,
    },
  }),
]

describe('MapListView', () => {
  // Map Phase 2 S5b Task 3 (owner feedback: "is this my area or
  // everything?") — the header now states its own scope in the copy
  // itself ("N places in this area") instead of a bare title + a
  // separate count badge whose count wasn't tied to any stated scope.
  // Relocates (not deletes) the pre-S5b "Nearby Merchants" header pin
  // and the separate "renders branch-count badge" pin below — same
  // invariant (the header communicates the total), new copy.
  it('renders the scoped "N places in this area" header using the total prop', () => {
    const { getByText } = render(
      <MapListView
        visible
        branches={mockBranches}
        total={2}
        onDismiss={jest.fn()}
        onBranchPress={jest.fn()}
        {...noopSort}
      />,
    )
    expect(getByText('2 places in this area')).toBeTruthy()
  })

  it('singularises to "1 place in this area" when total is 1', () => {
    const { getByText } = render(
      <MapListView
        visible
        branches={[mockBranches[0]!]}
        total={1}
        onDismiss={jest.fn()}
        onBranchPress={jest.fn()}
        {...noopSort}
      />,
    )
    expect(getByText('1 place in this area')).toBeTruthy()
  })

  it('renders merchant names from branch.merchant.businessName', () => {
    const { getByText } = render(
      <MapListView
        visible
        branches={mockBranches}
        total={2}
        onDismiss={jest.fn()}
        onBranchPress={jest.fn()}
        {...noopSort}
      />,
    )
    expect(getByText('Bella Italia')).toBeTruthy()
    expect(getByText('Nails & Beauty')).toBeTruthy()
  })

  // ──────────────────────────────────────────────────────────────────────
  // One-row-per-branch cardinality (Covelum bug closure, §M / Phase C).
  //
  // Two branches of the same merchant must render as TWO distinct
  // rows. Pre-Phase-C the list collapsed to merchant identity → only
  // one Covelum row showed. Phase C: each branch gets its own row.
  // Still true post-S4 (BranchTile has no merchant-level dedup; FlatList
  // keys on branch.id, unchanged).
  // ──────────────────────────────────────────────────────────────────────

  it('§M: two branches of the same merchant render two distinct list rows', () => {
    const brightlingsea = makeBranchTile({
      id:              'brn-covelum-bri',
      branchName:      'Brightlingsea',
      branchLatitude:  51.8054,
      branchLongitude: 1.0244,
      distance:        163_000,
      merchant: {
        id:                 'm-covelum',
        businessName:       'Covelum Restaurant',
        primaryCategory:    { id: 'c1', name: 'Food & Drink', pinColour: null, pinIcon: null, parentId: null },
        voucherCount:       2,
        maxEstimatedSaving: 20,
      },
    })
    const colchester = makeBranchTile({
      id:              'brn-covelum-col',
      branchName:      'Colchester',
      branchLatitude:  51.8959,
      branchLongitude: 0.8919,
      distance:        158_000,
      merchant: {
        id:                 'm-covelum',
        businessName:       'Covelum Restaurant',
        primaryCategory:    { id: 'c1', name: 'Food & Drink', pinColour: null, pinIcon: null, parentId: null },
        voucherCount:       2,
        maxEstimatedSaving: 20,
      },
    })
    const { getAllByText, getAllByLabelText } = render(
      <MapListView
        visible
        branches={[brightlingsea, colchester]}
        total={2}
        onDismiss={jest.fn()}
        onBranchPress={jest.fn()}
        {...noopSort}
      />,
    )
    // Both rows surface the same merchant name (Covelum Restaurant)
    // but render as distinct row elements — pinned by querying
    // accessibilityLabel which <BranchTile> sets per-row (prefixed
    // match: BranchTile appends ", <descriptor>[, <locality>]").
    expect(getAllByText('Covelum Restaurant')).toHaveLength(2)
    expect(getAllByLabelText(/^Covelum Restaurant/)).toHaveLength(2)
  })

  // ──────────────────────────────────────────────────────────────────────
  // Map Phase 2 S4 Task 2 — logo/heart parity via the shared BranchTile.
  // Replaces the removed Fold-2 pinColour-thumbnail tests: the list row
  // no longer has a category-coloured thumb at all, it has BranchTile's
  // own logo/heart treatment, verified here.
  // ──────────────────────────────────────────────────────────────────────

  it('brings FavouriteHeart to the list (branch-level, entity="branch") — absent pre-S4', () => {
    const tile = makeBranchTile({
      id:              'brn-pets',
      branchLatitude:  51.5,
      branchLongitude: -0.1,
      isFavourited:    true,
      merchant: { id: 'm-pets', businessName: 'Pet Palace' },
    })
    const { getByTestId } = render(
      <MapListView visible branches={[tile]} total={1} onDismiss={jest.fn()} onBranchPress={jest.fn()} {...noopSort} />,
    )
    expect(getByTestId('map-ledger-brn-pets-heart')).toBeTruthy()
  })

  it('logo falls back to the shared navy initials block when merchant.logoUrl is null', () => {
    const tile = makeBranchTile({
      id:              'brn-pets',
      branchLatitude:  51.5,
      branchLongitude: -0.1,
      merchant: { id: 'm-pets', businessName: 'Pet Palace', logoUrl: null },
    })
    const { getByText, queryByTestId } = render(
      <MapListView visible branches={[tile]} total={1} onDismiss={jest.fn()} onBranchPress={jest.fn()} {...noopSort} />,
    )
    expect(queryByTestId('map-ledger-logo-image')).toBeNull()
    expect(getByText('P')).toBeTruthy()
  })

  it('logo uses the real merchant.logoUrl image when set', () => {
    const tile = makeBranchTile({
      id:              'brn-pets',
      branchLatitude:  51.5,
      branchLongitude: -0.1,
      merchant: { id: 'm-pets', businessName: 'Pet Palace', logoUrl: 'https://example.com/logo.png' },
    })
    const { getByTestId } = render(
      <MapListView visible branches={[tile]} total={1} onDismiss={jest.fn()} onBranchPress={jest.fn()} {...noopSort} />,
    )
    expect(getByTestId('map-ledger-logo-image').props.source).toEqual([{ uri: 'https://example.com/logo.png' }])
  })

  // ──────────────────────────────────────────────────────────────────────
  // Distance — now the shared BranchTile compact formatter ("X.X mi"),
  // matching Home/Category/Map-carousel. (Was the long-form "X.X miles
  // away" via BranchRow's own `formatDistance` import pre-S4.)
  // ──────────────────────────────────────────────────────────────────────

  it('distance is rendered via the shared compact formatter ("X.X mi")', () => {
    const tile = makeBranchTile({
      id:              'brn-close',
      branchLatitude:  51.5,
      branchLongitude: -0.1,
      distance:        276, // ~0.2 miles
      merchant:        { id: 'm-close', businessName: 'Just Round The Corner' },
    })
    const { getByText, queryByText } = render(
      <MapListView visible branches={[tile]} total={1} onDismiss={jest.fn()} onBranchPress={jest.fn()} {...noopSort} />,
    )
    expect(getByText(/0\.2 mi/)).toBeTruthy()
    expect(queryByText(/miles away/)).toBeNull()
    expect(queryByText(/276m/)).toBeNull()
  })

  it('distance is rendered for >1 mile too (no regression on the existing path)', () => {
    const tile = makeBranchTile({
      id:              'brn-far',
      branchLatitude:  51.5,
      branchLongitude: -0.1,
      distance:        8200, // ~5.1 miles
      merchant:        { id: 'm-far', businessName: 'Across Town' },
    })
    const { getByText } = render(
      <MapListView visible branches={[tile]} total={1} onDismiss={jest.fn()} onBranchPress={jest.fn()} {...noopSort} />,
    )
    expect(getByText(/5\.1 mi/)).toBeTruthy()
  })

  // ──────────────────────────────────────────────────────────────────────
  // Task 3 — sort selector, wired to the same FilterState.sortBy source.
  // ──────────────────────────────────────────────────────────────────────

  it('renders the sort selector with the four FilterState.sortBy options', () => {
    const { getByLabelText } = render(
      <MapListView
        visible
        branches={mockBranches}
        total={2}
        onDismiss={jest.fn()}
        onBranchPress={jest.fn()}
        sortBy="relevance"
        onSortByChange={jest.fn()}
      />,
    )
    expect(getByLabelText('Sort by Relevance')).toBeTruthy()
    expect(getByLabelText('Sort by Nearest')).toBeTruthy()
    expect(getByLabelText('Sort by Top Rated')).toBeTruthy()
    expect(getByLabelText('Sort by Highest Saving')).toBeTruthy()
  })

  it("tapping a sort option calls onSortByChange with that option's key", () => {
    const onSortByChange = jest.fn()
    const { getByLabelText } = render(
      <MapListView
        visible
        branches={mockBranches}
        total={2}
        onDismiss={jest.fn()}
        onBranchPress={jest.fn()}
        sortBy="relevance"
        onSortByChange={onSortByChange}
      />,
    )
    fireEvent.press(getByLabelText('Sort by Highest Saving'))
    expect(onSortByChange).toHaveBeenCalledWith('highest_saving')
  })

  it('marks the active sort option as selected (accessibilityState)', () => {
    const { getByLabelText } = render(
      <MapListView
        visible
        branches={mockBranches}
        total={2}
        onDismiss={jest.fn()}
        onBranchPress={jest.fn()}
        sortBy="top_rated"
        onSortByChange={jest.fn()}
      />,
    )
    expect(getByLabelText('Sort by Top Rated').props.accessibilityState).toEqual({ selected: true })
    expect(getByLabelText('Sort by Relevance').props.accessibilityState).toEqual({ selected: false })
  })

  // ──────────────────────────────────────────────────────────────────────
  // Map Phase 2 W2b (F9) — ledger rows (<MapLedgerRow>) replace the shared
  // BranchTile compact card. The row now carries the shared <VoucherValue>
  // (save capsule + voucher stub) and a "category · distance · Open|Closed"
  // meta line. Branch-first cardinality + tap-through are unchanged (pinned
  // above); these pin the new value + status presentation.
  // ──────────────────────────────────────────────────────────────────────
  it('each ledger row renders the shared value line ("Save up to £X" capsule + TicketMark voucher count)', () => {
    const { getByText, getAllByTestId } = render(
      <MapListView
        visible
        branches={mockBranches}
        total={2}
        onDismiss={jest.fn()}
        onBranchPress={jest.fn()}
        {...noopSort}
      />,
    )
    // Round 5 — the FULL wording is the visible text again (owner: the
    // bare amount read meaningless). Bella Italia (maxEstimatedSaving 20,
    // 2 vouchers) + Nails (10, 1).
    expect(getByText('Save up to £20')).toBeTruthy()
    expect(getByText('2 vouchers')).toBeTruthy()
    expect(getByText('Save up to £10')).toBeTruthy()
    expect(getByText('1 voucher')).toBeTruthy()
    expect(getAllByTestId('map-ledger-value')).toHaveLength(2)
    // The count identity is the filled TicketMark, no dashed container.
    expect(getAllByTestId('voucher-value-ticket-mark')).toHaveLength(2)
  })

  it('W2b round 4 design pass: header carries a quiet "Sorted by" reflection of the active sort', () => {
    // Two separate renders (the local render helper owns the QueryClient
    // wrapper, so its rerender cannot be fed a bare node).
    const first = render(
      <MapListView
        visible
        branches={mockBranches}
        total={2}
        onDismiss={jest.fn()}
        onBranchPress={jest.fn()}
        sortBy="relevance"
        onSortByChange={jest.fn()}
      />,
    )
    expect(first.getByText('Sorted by relevance')).toBeTruthy()
    first.unmount()

    const second = render(
      <MapListView
        visible
        branches={mockBranches}
        total={2}
        onDismiss={jest.fn()}
        onBranchPress={jest.fn()}
        sortBy="highest_saving"
        onSortByChange={jest.fn()}
      />,
    )
    expect(second.getByText('Sorted by best saving')).toBeTruthy()
  })

  it('segmented sort control shows the W2b display labels ("Top rated", "Best saving") while a11y labels stay canonical', () => {
    const { getByText, getByLabelText } = render(
      <MapListView
        visible
        branches={mockBranches}
        total={2}
        onDismiss={jest.fn()}
        onBranchPress={jest.fn()}
        sortBy="relevance"
        onSortByChange={jest.fn()}
      />,
    )
    // Visible display-only rename.
    expect(getByText('Top rated')).toBeTruthy()
    expect(getByText('Best saving')).toBeTruthy()
    // Canonical accessibility labels (unchanged contract).
    expect(getByLabelText('Sort by Highest Saving')).toBeTruthy()
    expect(getByLabelText('Sort by Top Rated')).toBeTruthy()
  })

  it('ledger row meta shows the Open/Closed status word', () => {
    const openTile = makeBranchTile({
      id:          'brn-open',
      isOpenNow:   true,
      distance:    500,
      merchant:    { id: 'm-open', businessName: 'Open Cafe' },
    })
    const { getByText } = render(
      <MapListView visible branches={[openTile]} total={1} onDismiss={jest.fn()} onBranchPress={jest.fn()} {...noopSort} />,
    )
    expect(getByText('Open')).toBeTruthy()
  })

  // ──────────────────────────────────────────────────────────────────────
  // W2b ROUND 2 BUG 1 + ROUND 5 board layout — the rendered structure pin.
  // BUG 1 (round 2): <PressableScale> applies its `style` to the OUTER
  // Animated.View while children render inside the inner Pressable
  // (default column layout), so layout must live on the explicit rowInner.
  // ROUND 5: the side value-rail geometry is ABANDONED (it squeezed the
  // meta into on-device clips); the content now stacks full-width beside
  // the logo: name / meta / value as three lines, heart as a corner
  // overlay. These pin that structure.
  // ──────────────────────────────────────────────────────────────────────
  describe('W2b round 5: ledger row structure (three-line stack, no side rail)', () => {
    function flattenStyle(style: unknown): Record<string, unknown> {
      if (!style) return {}
      if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean).map(flattenStyle))
      return style as Record<string, unknown>
    }

    const longTile = makeBranchTile({
      id:         'brn-long',
      distance:   500,
      isOpenNow:  true,
      merchant: {
        id:                 'm-long',
        businessName:       'The Grand International House of Fine Dining',
        descriptor:         'International Fine Dining Restaurant',
        voucherCount:       3,
        maxEstimatedSaving: 999,
      },
    })

    it('logo, content column and heart overlay are siblings of the flexDirection:row rowInner (BUG 1 pin)', () => {
      const { getByTestId } = render(
        <MapListView
          visible
          branches={[mockBranches[0]!]}
          total={1}
          onDismiss={jest.fn()}
          onBranchPress={jest.fn()}
          {...noopSort}
        />,
      )
      const rowInner = getByTestId('map-ledger-row')
      expect(flattenStyle(rowInner.props.style).flexDirection).toBe('row')
      const childTestIDs = rowInner.children
        .map((c) => (typeof c === 'string' ? null : c.props?.testID ?? null))
      // Round 5 — NO value rail between the content column and the heart.
      expect(childTestIDs).toEqual([
        'map-ledger-logo',
        'map-ledger-middle',
        'map-ledger-heart',
      ])
      const middle = getByTestId('map-ledger-middle')
      expect(flattenStyle(middle.props.style).flex).toBe(1)
    })

    it('the content column stacks name / meta / value as three full-width lines (meta is a sibling, not beside a rail)', () => {
      const { getByTestId, queryByTestId } = render(
        <MapListView visible branches={[longTile]} total={1} onDismiss={jest.fn()} onBranchPress={jest.fn()} {...noopSort} />,
      )
      const middle = getByTestId('map-ledger-middle')
      // Column stack (no row direction on the content column).
      expect(flattenStyle(middle.props.style).flexDirection).toBeUndefined()
      // Three lines in order: name (a Text, no testID) → meta → value line.
      const kids = middle.children.filter((c) => typeof c !== 'string')
      expect(kids).toHaveLength(3)
      expect(kids[1]!.props.testID).toBe('map-ledger-meta')
      // The meta row is a DIRECT full-width child of the column — the old
      // side rail is gone from the tree entirely.
      expect(queryByTestId('map-ledger-value-rail')).toBeNull()
      // The value line (third line) contains the shared VoucherValue.
      expect(getByTestId('map-ledger-value')).toBeTruthy()
    })

    it('name and meta stay single-line tail-ellipsised (safety net), full wording visible', () => {
      const { getByText, getByTestId } = render(
        <MapListView visible branches={[longTile]} total={1} onDismiss={jest.fn()} onBranchPress={jest.fn()} {...noopSort} />,
      )
      const name = getByText('The Grand International House of Fine Dining')
      expect(name.props.numberOfLines).toBe(1)
      expect(name.props.ellipsizeMode).toBe('tail')
      const meta = getByText(/International Fine Dining Restaurant · 0\.3 mi/)
      expect(meta.props.numberOfLines).toBe(1)
      expect(meta.props.ellipsizeMode).toBe('tail')
      // minWidth: 0 stays on the flex column (the RN ellipsis contract).
      expect(flattenStyle(getByTestId('map-ledger-middle').props.style).minWidth).toBe(0)
      // Round 5 wording revert: the FULL capsule text is visible.
      expect(getByText('Save up to £999')).toBeTruthy()
    })
  })
})
