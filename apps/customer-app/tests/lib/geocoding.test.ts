// §BE follow-up 2026-05-17 — geocodeCity UK-bias cascade.
//
// Real-device QA after PR #101 surfaced that bare
// `Location.geocodeAsync('Huddersfield')` returns an empty array
// from a Qatar-region iPhone. Redeemo is UK-only, so geocodeCity
// now prepends ", UK" before delegating, with a bare-query fallback
// for inputs that may parse better unqualified, and a deliberate
// skip when the input already names UK / United Kingdom.

import * as Location from 'expo-location'

jest.mock('expo-location', () => ({
  geocodeAsync: jest.fn(),
}))

import { geocodeCity } from '@/lib/geocoding'

const mockGeocode = Location.geocodeAsync as jest.Mock

describe('geocodeCity — §BE follow-up UK-bias cascade', () => {
  beforeEach(() => {
    mockGeocode.mockReset()
  })

  it('prepends ", UK" on the first call for a bare UK city name', async () => {
    mockGeocode.mockResolvedValueOnce([{ latitude: 53.6458, longitude: -1.785 }])
    const result = await geocodeCity('Huddersfield')
    expect(mockGeocode).toHaveBeenNthCalledWith(1, 'Huddersfield, UK')
    expect(mockGeocode).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ lat: 53.6458, lng: -1.785 })
  })

  it('falls back to the bare query when the qualified query returns no results', async () => {
    mockGeocode
      .mockResolvedValueOnce([])                                              // qualified — empty
      .mockResolvedValueOnce([{ latitude: 51.5074, longitude: -0.1278 }])     // bare — hits
    const result = await geocodeCity('London')
    expect(mockGeocode).toHaveBeenNthCalledWith(1, 'London, UK')
    expect(mockGeocode).toHaveBeenNthCalledWith(2, 'London')
    expect(mockGeocode).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ lat: 51.5074, lng: -0.1278 })
  })

  it('returns null when both qualified AND bare queries return no results', async () => {
    mockGeocode
      .mockResolvedValueOnce([])  // qualified
      .mockResolvedValueOnce([])  // bare
    const result = await geocodeCity('Hudderzfieldxxx')
    expect(mockGeocode).toHaveBeenCalledTimes(2)
    expect(result).toBeNull()
  })

  it('does NOT double-qualify when the input already mentions "UK"', async () => {
    mockGeocode.mockResolvedValueOnce([{ latitude: 53.6458, longitude: -1.785 }])
    const result = await geocodeCity('Huddersfield, UK')
    expect(mockGeocode).toHaveBeenNthCalledWith(1, 'Huddersfield, UK')
    expect(mockGeocode).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ lat: 53.6458, lng: -1.785 })
  })

  it('does NOT double-qualify when the input mentions "United Kingdom"', async () => {
    mockGeocode.mockResolvedValueOnce([{ latitude: 53.6458, longitude: -1.785 }])
    await geocodeCity('Huddersfield, United Kingdom')
    expect(mockGeocode).toHaveBeenNthCalledWith(1, 'Huddersfield, United Kingdom')
    expect(mockGeocode).toHaveBeenCalledTimes(1)
  })

  it('returns null when both calls throw (transient native errors)', async () => {
    mockGeocode.mockRejectedValueOnce(new Error('geocoder failed'))
    mockGeocode.mockRejectedValueOnce(new Error('geocoder failed'))
    const result = await geocodeCity('Huddersfield')
    expect(result).toBeNull()
  })

  it('still returns coords from the bare fallback when the qualified call throws', async () => {
    mockGeocode.mockRejectedValueOnce(new Error('geocoder failed'))
    mockGeocode.mockResolvedValueOnce([{ latitude: 53.6458, longitude: -1.785 }])
    const result = await geocodeCity('Huddersfield')
    expect(result).toEqual({ lat: 53.6458, lng: -1.785 })
  })
})
