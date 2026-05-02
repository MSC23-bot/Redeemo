import React from 'react'
import { render } from '@testing-library/react-native'
import { DirectionsSheet } from '@/features/merchant/components/DirectionsSheet'

// Regressions for PR A bug 2. Walking estimate is meaningful only for short
// distances; the original code computed `metres / 80` with no cap, producing
// "64,163 min walk" for a Qatar device viewing a UK branch. Behaviour now:
//   < 5 km   → "~N min walk"
//   < 100 km → "~N min drive"
//   ≥ 100 km → no time string (distance + address tell the user enough)
//
// And distance display drops the decimal above 100 km (3,189.6 mi → 3,190 mi).

function renderSheet(distance: number | null) {
  return render(
    <DirectionsSheet
      visible
      onDismiss={() => {}}
      address="1 Test Street, London"
      distance={distance}
      latitude={51.5}
      longitude={-0.1}
    />,
  )
}

describe('DirectionsSheet distance + travel-time', () => {
  it('shows minutes walk and metres for very short distances', () => {
    const { getByText } = renderSheet(400)
    expect(getByText(/400m away/)).toBeTruthy()
    expect(getByText(/min walk/)).toBeTruthy()
  })

  it('shows minutes walk and miles for distances under 5 km', () => {
    const { getByText } = renderSheet(3_500)
    expect(getByText(/2\.2 miles away/)).toBeTruthy()
    expect(getByText(/min walk/)).toBeTruthy()
  })

  it('switches to drive estimate between 5 km and 100 km', () => {
    const { getByText, queryByText } = renderSheet(40_000)
    expect(getByText(/24\.9 miles away/)).toBeTruthy()
    expect(getByText(/min drive/)).toBeTruthy()
    expect(queryByText(/min walk/)).toBeNull()
  })

  it('hides travel time entirely above 100 km and shows whole-mile distance', () => {
    // ~5,124 km — the kind of nonsense the Qatar→UK QA screenshot captured.
    // 5_124_000 / 1609.34 = 3184.45 → Math.round = 3184. Deterministic.
    const { getByText, queryByText } = renderSheet(5_124_000)
    expect(getByText('3184 mi away')).toBeTruthy()
    expect(queryByText(/min walk/)).toBeNull()
    expect(queryByText(/min drive/)).toBeNull()
  })

  it('handles null distance gracefully', () => {
    const { queryByText } = renderSheet(null)
    expect(queryByText(/away/)).toBeNull()
    expect(queryByText(/min walk/)).toBeNull()
    expect(queryByText(/min drive/)).toBeNull()
  })
})
