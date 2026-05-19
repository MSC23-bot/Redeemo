// PR #112 device-QA fixup-3 (2026-05-19) — locality-aware expanded banner.
//
// Owner-locked copy:
//   localityName present → title "Nothing in {localityName} yet"
//   localityName null    → title "Nothing nearby yet"
//   body (both)          → "Here are the closest matches"
//
// Pins:
//   1. Locality-present title interpolation (Huddersfield / Brightlingsea).
//   2. Whitespace-only localityName falls back to "Nothing nearby yet".
//   3. null/undefined localityName falls back to "Nothing nearby yet".
//   4. Body line copy is identical in both branches.
//   5. Negative pin: no em dash, no "showing wider results" wording, no
//      "we're growing" wording (those belonged to the legacy banner).

import React from 'react'
import { render } from '@testing-library/react-native'
import { ExpandedResultBanner } from '@/features/search/components/ExpandedResultBanner'

describe('<ExpandedResultBanner>', () => {
  it('localityName="Huddersfield" → title "Nothing in Huddersfield yet"', () => {
    const { getByText, queryByText } = render(
      <ExpandedResultBanner localityName="Huddersfield" />,
    )
    expect(getByText('Nothing in Huddersfield yet')).toBeTruthy()
    expect(queryByText('Nothing nearby yet')).toBeNull()
  })

  it('localityName="Brightlingsea" → title "Nothing in Brightlingsea yet"', () => {
    const { getByText } = render(
      <ExpandedResultBanner localityName="Brightlingsea" />,
    )
    expect(getByText('Nothing in Brightlingsea yet')).toBeTruthy()
  })

  it('localityName=null → fallback title "Nothing nearby yet"', () => {
    const { getByText, queryByText } = render(
      <ExpandedResultBanner localityName={null} />,
    )
    expect(getByText('Nothing nearby yet')).toBeTruthy()
    expect(queryByText(/Nothing in/)).toBeNull()
  })

  it('localityName=undefined → fallback title "Nothing nearby yet"', () => {
    const { getByText } = render(
      <ExpandedResultBanner localityName={undefined} />,
    )
    expect(getByText('Nothing nearby yet')).toBeTruthy()
  })

  it('whitespace-only localityName falls back to "Nothing nearby yet"', () => {
    const { getByText, queryByText } = render(
      <ExpandedResultBanner localityName="   " />,
    )
    expect(getByText('Nothing nearby yet')).toBeTruthy()
    expect(queryByText(/Nothing in/)).toBeNull()
  })

  it('localityName="  Huddersfield  " trims correctly → "Nothing in Huddersfield yet"', () => {
    const { getByText } = render(
      <ExpandedResultBanner localityName="  Huddersfield  " />,
    )
    expect(getByText('Nothing in Huddersfield yet')).toBeTruthy()
  })

  it('body line is "Here are the closest matches" in both branches', () => {
    const a = render(<ExpandedResultBanner localityName="Huddersfield" />)
    expect(a.getByText('Here are the closest matches')).toBeTruthy()
    const b = render(<ExpandedResultBanner localityName={null} />)
    expect(b.getByText('Here are the closest matches')).toBeTruthy()
  })

  // Negative pins — legacy banner copy must NOT appear.
  it('regression: legacy em-dash / "showing wider results" / "we’re growing" copy must NOT appear', () => {
    const { queryByText } = render(
      <ExpandedResultBanner localityName="Huddersfield" />,
    )
    expect(queryByText(/showing wider results/i)).toBeNull()
    expect(queryByText(/we['’]re growing/i)).toBeNull()
    expect(queryByText(/No matches nearby/i)).toBeNull()
    expect(queryByText(/—/)).toBeNull()                    // em dash
    expect(queryByText(/--/)).toBeNull()                   // double dash
  })
})
