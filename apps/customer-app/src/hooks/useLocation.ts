import { useState, useEffect, useCallback } from 'react'
import * as Location from 'expo-location'

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
    Location.getForegroundPermissionsAsync().then(({ status: perm }) => {
      if (perm === 'granted') requestPermission()
    })
  }, [requestPermission])

  return { status, location, requestPermission }
}
