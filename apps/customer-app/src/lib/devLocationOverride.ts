// apps/customer-app/src/lib/devLocationOverride.ts
//
// Plan 4 §AU — dev/preview-only UK location override for Discovery QA.
//
// Why: the project owner QAs Plan 4 Discovery surfaces from outside the
// UK (Qatar). The real GPS path resolves to non-UK coordinates, so
// backend `effectiveLocality` resolution can't be exercised end-to-end
// from the device. This helper lets a dev/preview build bake in a
// fixed lat/lng at build time so `useUserLocation` short-circuits to
// UK coordinates without any customer-visible UI affordance.
//
// Contract:
//   - Returns `{ lat, lng }` ONLY when:
//       (1) running under `__DEV__` (release builds always return null)
//       (2) `Constants.expoConfig?.extra?.devLocationOverride` is an
//           object with finite numeric `lat` and `lng`
//   - Returns `null` in every other case.
//
// Production safety:
//   - `__DEV__` is replaced by the Metro/Hermes bundler with the boolean
//     literal `false` in release builds, so the entire override branch
//     is eliminated as dead code from the production bundle.
//   - `app.config.ts` only bakes `extra.devLocationOverride` when both
//     `EXPO_PUBLIC_DEV_LOCATION_LAT` and `EXPO_PUBLIC_DEV_LOCATION_LNG`
//     parse as finite numbers; release CI builds never set these vars.
//   - Defence-in-depth: even if a malformed object somehow lands in
//     `extra` (e.g. preview build forwarding env), the runtime parse
//     here re-validates that both values are finite numbers.

import Constants from 'expo-constants'

export type DevLocationOverride = {
  lat: number
  lng: number
}

export function devLocationOverride(): DevLocationOverride | null {
  if (!__DEV__) return null

  const extra = Constants.expoConfig?.extra as
    | { devLocationOverride?: unknown }
    | undefined
  const raw = extra?.devLocationOverride
  if (!raw || typeof raw !== 'object') return null

  const { lat, lng } = raw as { lat?: unknown; lng?: unknown }
  if (typeof lat !== 'number' || !Number.isFinite(lat)) return null
  if (typeof lng !== 'number' || !Number.isFinite(lng)) return null

  return { lat, lng }
}
