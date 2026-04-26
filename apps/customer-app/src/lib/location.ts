import { useCallback, useState } from 'react'
import * as Location from 'expo-location'

export type LocationStatus = 'idle' | 'loading' | 'denied' | 'unavailable'
export type ResolvedAddress = {
  addressLine1?: string
  addressLine2?: string
  city?: string
  postcode?: string
  country?: string
  isoCountryCode?: string
}

export function useLocationAssist() {
  const [status, setStatus] = useState<LocationStatus>('idle')
  const [address, setAddress] = useState<ResolvedAddress | null>(null)

  const request = useCallback(async () => {
    setStatus('loading')
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync()
      if (perm !== 'granted') { setStatus('denied'); return null }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null)
      if (!pos) { setStatus('idle'); return null }
      const [place] = await Location.reverseGeocodeAsync(pos.coords).catch(() => [])
      if (!place) { setStatus('idle'); return null }
      const addressLine1 = place.streetNumber
        ? `${place.streetNumber} ${place.street ?? ''}`.trim()
        : place.street ?? undefined
      const result: ResolvedAddress = {}
      if (addressLine1) result.addressLine1 = addressLine1
      if (place.subregion) result.addressLine2 = place.subregion
      if (place.city) result.city = place.city
      if (place.postalCode) result.postcode = place.postalCode
      if (place.country) result.country = place.country
      if (place.isoCountryCode) result.isoCountryCode = place.isoCountryCode
      setAddress(result); setStatus('idle'); return result
    } catch { setStatus('idle'); return null }
  }, [])

  return { request, status, address, loading: status === 'loading' }
}
