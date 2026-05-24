import { useState, useEffect, useCallback } from 'react'
import { Linking } from 'react-native'
import * as Location from 'expo-location'
import { devLocationOverride } from '@/lib/devLocationOverride'

export type UserLocation = {
  lat: number
  lng: number
  area: string | null
  city: string | null
}

// 4-state permission enum. Distinct from `status` (which conflates
// loading + permission). `unavailable` covers the case where the
// permissions API itself throws — e.g. no GPS hardware in the
// runtime, or a transient native-module failure on mount.
export type LocationPermission =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unavailable'

export type RequestPermissionOptions = {
  onBeforePrompt?: () => void | Promise<void>
  onDenied?: () => void | Promise<void>
}

export type LocationState = {
  status: 'idle' | 'loading' | 'granted' | 'denied'
  location: UserLocation | null
  requestPermission: () => Promise<void>
  permission: LocationPermission
  coords: { lat: number; lng: number } | null
  request: (opts?: RequestPermissionOptions) => Promise<void>
  openSettings: () => Promise<void>
}

function toPermission(raw: Location.PermissionStatus | string): LocationPermission {
  if (raw === 'granted') return 'granted'
  if (raw === 'denied') return 'denied'
  if (raw === 'undetermined') return 'undetermined'
  return 'unavailable'
}

export function useUserLocation(): LocationState {
  const [status, setStatus] = useState<LocationState['status']>('idle')
  const [location, setLocation] = useState<UserLocation | null>(null)
  const [permission, setPermission] = useState<LocationPermission>('undetermined')

  const request = useCallback(async (opts?: RequestPermissionOptions) => {
    // §AU local-dev-only override: short-circuits prompt + reverse
    // geocode. `area`/`city` stay null so no fake place strings leak
    // into UI; backend resolves `effectiveLocality` from lat/lng on
    // the wire. Explainer/denied callbacks are skipped because there
    // is no native prompt to wrap and no user-facing permission flow.
    const override = devLocationOverride()
    if (override) {
      setPermission('granted')
      setStatus('granted')
      setLocation({ lat: override.lat, lng: override.lng, area: null, city: null })
      return
    }

    setStatus('loading')
    try {
      // Fresh probe each call — never branch on stale closure state.
      let current: LocationPermission = 'undetermined'
      try {
        const probe = await Location.getForegroundPermissionsAsync()
        current = toPermission(probe.status)
        setPermission(current)
      } catch {
        current = 'unavailable'
        setPermission('unavailable')
      }

      // Pre-prompt explainer hook: only when the OS will actually
      // show a native dialog. If permission is already granted /
      // denied / unavailable, no native prompt fires, so the
      // branded explainer would be misleading.
      if (current === 'undetermined' && opts?.onBeforePrompt) {
        await opts.onBeforePrompt()
      }

      const { status: rawPerm } = await Location.requestForegroundPermissionsAsync()
      const next = toPermission(rawPerm)
      setPermission(next)

      if (next !== 'granted') {
        setStatus('denied')
        if (next === 'denied' && opts?.onDenied) {
          await opts.onDenied()
        }
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
      // expo-location threw — could not complete the request. Mark
      // as denied for `status` (existing call sites' contract) and
      // surface as `unavailable` on the new 4-state enum.
      setStatus('denied')
      setPermission('unavailable')
    }
  }, [])

  // Legacy alias: existing call sites read `requestPermission()` with
  // no arguments. Delegates to `request()` so the lifecycle stays in
  // one place.
  const requestPermission = useCallback(() => request(), [request])

  const openSettings = useCallback(async () => {
    // No-op in override mode: there is no real native permission to
    // toggle, so opening Settings would be misleading.
    if (devLocationOverride()) return
    await Linking.openSettings()
  }, [])

  useEffect(() => {
    // Override mode: skip the OS probe entirely and populate
    // location synchronously via `request`. The OS-level prompt is
    // never shown.
    if (devLocationOverride()) {
      request()
      return
    }
    Location.getForegroundPermissionsAsync()
      .then(({ status: perm }) => {
        setPermission(toPermission(perm))
        if (perm === 'granted') request()
      })
      .catch(() => {
        setPermission('unavailable')
      })
    // Mount-only probe. `request` is stable (deps: []) so this list
    // is genuinely exhaustive — no eslint disable needed.
  }, [request])

  const coords = location ? { lat: location.lat, lng: location.lng } : null

  return {
    status,
    location,
    requestPermission,
    permission,
    coords,
    request,
    openSettings,
  }
}
