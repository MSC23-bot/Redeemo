import * as Location from 'expo-location'

export async function geocodeCity(cityName: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const results = await Location.geocodeAsync(cityName)
    const first = results[0]
    if (!first) return null
    return { lat: first.latitude, lng: first.longitude }
  } catch {
    return null
  }
}
