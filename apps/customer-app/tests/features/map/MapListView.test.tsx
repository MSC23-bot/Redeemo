// PR-3 Phase C — MapListView half-sheet consumes BranchTile[] and
// each row is branch-keyed.  Two branches of the same merchant
// render as TWO distinct rows (Covelum bug closure on the list
// surface).  Fold 2 (PR-3 plan §1.5) — row thumbnail colour reads
// `branch.merchant.primaryCategory.pinColour` first; palette fallback
// only when the backend field is null.  Distance is now miles-only
// via the shared `formatDistance` helper from PR #112 fixup-6
// (locked: "always miles, never metres").

import React from 'react'
import { render } from '@testing-library/react-native'
import { MapListView } from '@/features/map/components/MapListView'
import { makeBranchTile } from '../../fixtures/branchTile'

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
  it('renders "Nearby Merchants" header', () => {
    const { getByText } = render(
      <MapListView
        visible
        branches={mockBranches}
        total={2}
        onDismiss={jest.fn()}
        onBranchPress={jest.fn()}
      />,
    )
    expect(getByText('Nearby Merchants')).toBeTruthy()
  })

  it('renders branch-count badge', () => {
    const { getByText } = render(
      <MapListView
        visible
        branches={mockBranches}
        total={2}
        onDismiss={jest.fn()}
        onBranchPress={jest.fn()}
      />,
    )
    expect(getByText('2')).toBeTruthy()
  })

  it('renders merchant names from branch.merchant.businessName', () => {
    const { getByText } = render(
      <MapListView
        visible
        branches={mockBranches}
        total={2}
        onDismiss={jest.fn()}
        onBranchPress={jest.fn()}
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
      />,
    )
    // Both rows surface the same merchant name (Covelum Restaurant)
    // but render as distinct row elements — pinned by querying
    // accessibilityLabel which BranchRow sets per-row.
    expect(getAllByText('Covelum Restaurant')).toHaveLength(2)
    expect(getAllByLabelText('Covelum Restaurant')).toHaveLength(2)
  })

  // ──────────────────────────────────────────────────────────────────────
  // Fold 2 — backend pinColour read on the row thumbnail.
  // ──────────────────────────────────────────────────────────────────────

  function findThumbBackgroundColor(views: any[]): string | undefined {
    const flatten = (style: any): any => {
      if (!style) return {}
      if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean).map(flatten))
      return style
    }
    return views
      .map(v => flatten(v.props.style))
      .filter(s => s.width === 52 && s.height === 52) // BranchRow.thumb dimensions
      .map(s => s.backgroundColor as string | undefined)
      .find(c => typeof c === 'string')
  }

  it('Fold 2: row thumbnail uses backend pinColour when set on branch.merchant.primaryCategory', () => {
    const tile = makeBranchTile({
      id:              'brn-pets',
      branchLatitude:  51.5,
      branchLongitude: -0.1,
      merchant: {
        id:           'm-pets',
        businessName: 'Pet Palace',
        primaryCategory: {
          id:        'cat-pets',
          name:      'Pets & Animals',
          pinColour: '#5C6BC0', // Indigo — explicit backend value
          pinIcon:   null,
          parentId:  null,
        },
      },
    })
    const { View } = require('react-native')
    const { UNSAFE_getAllByType } = render(
      <MapListView
        visible
        branches={[tile]}
        total={1}
        onDismiss={jest.fn()}
        onBranchPress={jest.fn()}
      />,
    )
    expect(findThumbBackgroundColor(UNSAFE_getAllByType(View))).toBe('#5C6BC0')
  })

  it('Fold 2: row thumbnail falls back to hardcoded palette when backend pinColour is null (Big-Four backward-compat)', () => {
    const tile = makeBranchTile({
      id:              'brn-food',
      branchLatitude:  51.5,
      branchLongitude: -0.1,
      merchant: {
        id:           'm-food',
        businessName: 'Curry House',
        primaryCategory: {
          id:        'cat-food',
          name:      'Food & Drink',
          pinColour: null, // backend null → palette fallback
          pinIcon:   null,
          parentId:  null,
        },
      },
    })
    const { View } = require('react-native')
    const { UNSAFE_getAllByType } = render(
      <MapListView
        visible
        branches={[tile]}
        total={1}
        onDismiss={jest.fn()}
        onBranchPress={jest.fn()}
      />,
    )
    // Food & Drink palette fallback = '#E65100'
    expect(findThumbBackgroundColor(UNSAFE_getAllByType(View))).toBe('#E65100')
  })

  // ──────────────────────────────────────────────────────────────────────
  // Shared formatDistance: miles-only, NEVER metres or 'm' suffix
  // (PR #112 fixup-6 lock — "always miles, never metres").
  // ──────────────────────────────────────────────────────────────────────

  it('distance is rendered in miles only — sub-1km still uses miles, never the bare metres suffix', () => {
    const tile = makeBranchTile({
      id:              'brn-close',
      branchLatitude:  51.5,
      branchLongitude: -0.1,
      distance:        276, // ~0.2 miles — previously rendered as "276m"
      merchant:        { id: 'm-close', businessName: 'Just Round The Corner' },
    })
    const { getByText, queryByText } = render(
      <MapListView
        visible
        branches={[tile]}
        total={1}
        onDismiss={jest.fn()}
        onBranchPress={jest.fn()}
      />,
    )
    // Shared formatter: 276m → '0.2 miles away'
    expect(getByText(/0\.2 miles away/)).toBeTruthy()
    // Negative pin: the old MapListView local formatter would have
    // emitted "276m" — that must NEVER appear in the rendered output.
    expect(queryByText(/276m/)).toBeNull()
    // Defensive: also no bare " mi" suffix from the old mixed-unit formatter.
    expect(queryByText(/ mi$/)).toBeNull()
  })

  it('distance is rendered in miles for >1km too (no regression on the existing path)', () => {
    const tile = makeBranchTile({
      id:              'brn-far',
      branchLatitude:  51.5,
      branchLongitude: -0.1,
      distance:        8200, // ~5.1 miles
      merchant:        { id: 'm-far', businessName: 'Across Town' },
    })
    const { getByText } = render(
      <MapListView
        visible
        branches={[tile]}
        total={1}
        onDismiss={jest.fn()}
        onBranchPress={jest.fn()}
      />,
    )
    expect(getByText(/5\.1 miles away/)).toBeTruthy()
  })
})
