import * as Location from 'expo-location'

// §BE follow-up 2026-05-17 — UK-bias the device geocoder.
//
// Apple's native geocoder (the engine `Location.geocodeAsync` wraps)
// biases results toward the device's region setting. On owner QA from
// a Qatar-region iPhone, bare `geocodeAsync('Huddersfield')` returns
// an empty array because the geocoder doesn't resolve UK city names
// unambiguously from a non-UK region. Redeemo is UK-only, so we
// prepend a country qualifier before delegating to the native
// geocoder; the bare query stays as a fallback for inputs that may
// fail when qualified (e.g. multi-token names that confuse the
// parser).
//
// Cascade:
//   1. Skip qualifier prepend if the input already mentions UK /
//      United Kingdom — avoids double-appending and avoids breaking
//      inputs the caller deliberately disambiguated.
//   2. First call: `geocodeAsync(\`${name}, UK\`)`. Returns coords on
//      success.
//   3. Fallback: bare `geocodeAsync(name)`. Returns coords on success.
//   4. Both empty / both throw → null.  Existing caller behaviour
//      preserved: a null result fires the "Couldn't find that place"
//      toast in MapScreen.handleSearchSubmit.
const UK_QUALIFIER_REGEX = /\b(uk|united\s+kingdom)\b/i

async function tryGeocode(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const results = await Location.geocodeAsync(query)
    const first   = results[0]
    if (!first) return null
    return { lat: first.latitude, lng: first.longitude }
  } catch {
    return null
  }
}

export async function geocodeCity(cityName: string): Promise<{ lat: number; lng: number } | null> {
  if (UK_QUALIFIER_REGEX.test(cityName)) {
    return tryGeocode(cityName)
  }
  const qualified = await tryGeocode(`${cityName}, UK`)
  if (qualified) return qualified
  return tryGeocode(cityName)
}
