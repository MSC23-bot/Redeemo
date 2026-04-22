import { geocodeCity } from '@/lib/geocoding'

jest.mock('expo-location', () => ({
  geocodeAsync: jest.fn().mockResolvedValue([{ latitude: 53.4808, longitude: -2.2426 }]),
}))

describe('geocodeCity', () => {
  it('returns lat/lng for a city name', async () => {
    const result = await geocodeCity('Manchester')
    expect(result).toEqual({ lat: 53.4808, lng: -2.2426 })
  })
})
