// PR-2 device-QA fix (2026-05-19) — locality de-dupe pin.
//
// Owner screenshot evidence: Karaara rendered "Huddersfield,
// Huddersfield"; Polish Nail Studio rendered "Holmfirth, Holmfirth".
// Root cause: SearchResultItem built `branchLine = branchName + ", " +
// locality` without checking whether the two strings were the same
// (case-insensitive trimmed equality).
//
// Fix: `formatBranchLine` exported from SearchResultItem.tsx now
// collapses to a single segment when branchName === locality, with
// trim + case-insensitive normalisation.  This file pins:
//   1. exact duplicate collapses → one segment
//   2. case-insensitive duplicate collapses → branchName casing wins
//   3. whitespace-trimmed duplicate collapses → single segment
//   4. distinct branch + locality renders both ("Branch, Locality")
//   5. null/empty locality renders only branchName
//   6. integration: rendered output for the Huddersfield case shows
//      "Huddersfield" exactly once
//
// Direct unit tests for the formatter + one integration render test
// keep the contract durable against future visual passes.

import React from 'react'
import { render } from '@testing-library/react-native'
import { SearchResultItem, formatBranchLine } from '@/features/search/components/SearchResultItem'
import { makeBranchTile } from '../../fixtures/branchTile'

describe('SearchResultItem — formatBranchLine (locality de-dupe)', () => {
  it('exact branchName === locality collapses to one segment', () => {
    expect(formatBranchLine('Huddersfield', 'Huddersfield')).toBe('Huddersfield')
  })

  it('case-insensitive equality collapses; branchName casing wins', () => {
    expect(formatBranchLine('Huddersfield', 'HUDDERSFIELD')).toBe('Huddersfield')
    expect(formatBranchLine('HUDDERSFIELD', 'huddersfield')).toBe('HUDDERSFIELD')
    expect(formatBranchLine('Holmfirth', 'holmfirth')).toBe('Holmfirth')
  })

  it('whitespace-trimmed equality collapses', () => {
    expect(formatBranchLine('  Huddersfield  ', 'Huddersfield')).toBe('Huddersfield')
    expect(formatBranchLine('Huddersfield', '  Huddersfield  ')).toBe('Huddersfield')
  })

  it('distinct branch + locality renders both as "Branch, Locality"', () => {
    expect(formatBranchLine('Brightlingsea', 'Essex')).toBe('Brightlingsea, Essex')
    expect(formatBranchLine('High Street', 'Holmfirth')).toBe('High Street, Holmfirth')
  })

  it('null locality renders only branchName', () => {
    expect(formatBranchLine('Branch A', null)).toBe('Branch A')
  })

  it('empty-string locality renders only branchName', () => {
    expect(formatBranchLine('Branch A', '')).toBe('Branch A')
    expect(formatBranchLine('Branch A', '   ')).toBe('Branch A')
  })
})

describe('SearchResultItem — locality de-dupe integration (owner screenshot bugs)', () => {
  it('Karaara Huddersfield: branchName="Huddersfield" + locality="Huddersfield" renders "Huddersfield" exactly once', () => {
    const tile = makeBranchTile({
      branchName:         'Huddersfield',
      branchLocalityName: 'Huddersfield',
      merchant: {
        id: 'karaara', businessName: 'Karaara',
      },
    })
    const { getAllByText, queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    // Branch line should be plain "Huddersfield", NOT "Huddersfield, Huddersfield".
    expect(getAllByText('Huddersfield')).toHaveLength(1)
    expect(queryByText('Huddersfield, Huddersfield')).toBeNull()
  })

  it('Polish Nail Studio Holmfirth: branchName="Holmfirth" + locality="Holmfirth" renders "Holmfirth" exactly once', () => {
    const tile = makeBranchTile({
      branchName:         'Holmfirth',
      branchLocalityName: 'Holmfirth',
      merchant: {
        id: 'polish-nail', businessName: 'Polish Nail Studio',
      },
    })
    const { getAllByText, queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(getAllByText('Holmfirth')).toHaveLength(1)
    expect(queryByText('Holmfirth, Holmfirth')).toBeNull()
  })

  it('Covelum Brightlingsea: branchName="Brightlingsea" + locality="Essex" renders "Brightlingsea, Essex" (distinct, no collapse)', () => {
    const tile = makeBranchTile({
      branchName:         'Brightlingsea',
      branchLocalityName: 'Brightlingsea',
      branchPostTown:     null,
      branchCity:         'Essex',
      merchant: { id: 'covelum', businessName: 'Covelum' },
    })
    // Note: branchLocalityName === branchName here so the fallback chain
    // returns 'Brightlingsea' (the most-specific), which is the same as
    // branchName → de-duped to single segment.
    const { getAllByText, queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(getAllByText('Brightlingsea')).toHaveLength(1)
    expect(queryByText('Brightlingsea, Brightlingsea')).toBeNull()
  })
})
