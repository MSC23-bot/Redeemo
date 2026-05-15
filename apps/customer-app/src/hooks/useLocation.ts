import { useState, useEffect, useCallback } from 'react'
import * as Location from 'expo-location'
import { devLocationOverride } from '@/lib/devLocationOverride'

export type UserLocation = {
  lat: number
  lng: number
  area: string | null
  city: string | null
}

export type LocationState = {
  status: 'idle' | 'loading' | 'granted' | 'denied'
  location: UserLocation | null
  requestPermission: () => Promise<void>
}

export function useUserLocation(): LocationState {
  const [status, setStatus] = useState<LocationState['status']>('idle')
  const [location, setLocation] = useState<UserLocation | null>(null)

  const requestPermission = useCallback(async () => {
    // Plan 4 §AU — local-dev-only UK location override (Metro / Expo
    // dev-client). Skips permission prompt, GPS read, and reverse
    // geocode. `area` and `city` stay null so no fake place strings
    // leak into UI; the backend resolves `effectiveLocality` from
    // lat/lng on the wire.
    const override = devLocationOverride()
    if (override) {
      setStatus('granted')
      setLocation({ lat: override.lat, lng: override.lng, area: null, city: null })
      return
    }

    setStatus('loading')
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync()
      if (perm !== 'granted') {
        setStatus('denied')
        return
      }
      setStatus('granted')
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const [place] = await Location.reverseGeocodeAsync(pos.coords).catch(() => [undefined])
      setLocation({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        area: place?.subregion ?? place?.district ?? null,
        city: place?.city ?? null,
      })
    } catch {
      setStatus('denied')
    }
  }, [])

  useEffect(() => {
    // §AU: under override, skip the OS permission probe entirely and
    // populate location synchronously via `requestPermission`. The
    // OS-level prompt is never shown in override mode.
    if (devLocationOverride()) {
      requestPermission()
      return
    }
    Location.getForegroundPermissionsAsync().then(({ status: perm }) => {
      if (perm === 'granted') requestPermission()
    })
  }, [requestPermission])

  return { status, location, requestPermission }
}
