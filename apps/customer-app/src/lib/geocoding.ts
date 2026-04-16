import * as Location from 'expo-location'

export async function geocodeCity(cityName: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const results = await Location.geocodeAsync(cityName)
    if (results.length === 0) return null
    return { lat: results[0].latitude, lng: results[0].longitude }
  } catch {
    return null
  }
}
