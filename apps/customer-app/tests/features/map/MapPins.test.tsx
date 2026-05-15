// Map contract / rebaseline-gap fix — MapPins must render markers when
// the backend exposes nearest-branch coordinates on a tile, and must
// skip merchants whose tile coords are null (POSTCODE_CENTROID and
// other non-MANUALLY_CONFIRMED branches, per the PR #81 redaction
// contract).
//
// The pre-fix state of MapPins read `(merchant as any).lat/.lng` which
// were always undefined → zero pins ever rendered. This suite pins the
// fixed contract.

import React from 'react'
import { render } from '@testing-library/react-native'
import { MapPins } from '@/features/map/components/MapPins'
import { makeMerchantTile } from '../../fixtures/merchantTile'

// react-native-maps mock — capture every <Marker> render so we can
// assert that the right merchants get pins and the wrong ones don't.
type MarkerCall = {
  identifier: string
  coordinate: { latitude: number; longitude: number }
}
const mockMarkerCalls: MarkerCall[] = []

jest.mock('react-native-maps', () => {
  const ReactLib = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: (props: any) => ReactLib.createElement(View, props, props.children),
    Marker: (props: any) => {
      mockMarkerCalls.push({
        identifier: props.identifier,
        coordinate: props.coordinate,
      })
      return ReactLib.createElement(View, { testID: `marker-${props.identifier}` })
    },
  }
})

describe('MapPins (Map tile coordinates contract)', () => {
  beforeEach(() => { mockMarkerCalls.length = 0 })

  it('renders a Marker for a merchant whose tile has both latitude and longitude', () => {
    const tile = makeMerchantTile({
      id: 'm-confirmed', businessName: 'Karaara',
      latitude: 53.6463, longitude: -1.7809,
    })
    render(<MapPins merchants={[tile]} selectedId={null} onPress={jest.fn()} />)
    expect(mockMarkerCalls).toHaveLength(1)
    expect(mockMarkerCalls[0]!.identifier).toBe('m-confirmed')
    expect(mockMarkerCalls[0]!.coordinate).toEqual({ latitude: 53.6463, longitude: -1.7809 })
  })

  it('skips a merchant whose latitude is null (POSTCODE_CENTROID redaction)', () => {
    const tile = makeMerchantTile({
      id: 'm-approx', businessName: 'Approximate',
      latitude: null, longitude: -1.7809,
    })
    render(<MapPins merchants={[tile]} selectedId={null} onPress={jest.fn()} />)
    expect(mockMarkerCalls).toHaveLength(0)
  })

  it('skips a merchant whose longitude is null (defensive)', () => {
    const tile = makeMerchantTile({
      id: 'm-approx', businessName: 'Approximate',
      latitude: 53.6463, longitude: null,
    })
    render(<MapPins merchants={[tile]} selectedId={null} onPress={jest.fn()} />)
    expect(mockMarkerCalls).toHaveLength(0)
  })

  it('skips a merchant whose latitude AND longitude are both null', () => {
    const tile = makeMerchantTile({
      id: 'm-approx', businessName: 'Approximate',
      latitude: null, longitude: null,
    })
    render(<MapPins merchants={[tile]} selectedId={null} onPress={jest.fn()} />)
    expect(mockMarkerCalls).toHaveLength(0)
  })

  it('renders only the confirmed pin when given a mixed list', () => {
    const confirmed = makeMerchantTile({
      id: 'm-confirmed', businessName: 'Karaara',
      latitude: 53.6463, longitude: -1.7809,
    })
    const approximate = makeMerchantTile({
      id: 'm-approx', businessName: 'Approximate',
      latitude: null, longitude: null,
    })
    render(<MapPins merchants={[confirmed, approximate]} selectedId={null} onPress={jest.fn()} />)
    expect(mockMarkerCalls).toHaveLength(1)
    expect(mockMarkerCalls[0]!.identifier).toBe('m-confirmed')
  })
})
