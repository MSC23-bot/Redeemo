import type { ExpoConfig } from 'expo/config'

// Plan 4 §AU — build-time dev location override for Discovery QA from
// outside the UK. Only baked into `extra.devLocationOverride` when BOTH
// env vars parse as finite numbers; otherwise the field is omitted and
// `devLocationOverride()` returns null at runtime. Never set these in
// production CI — the runtime helper is also `__DEV__`-gated as
// defence-in-depth.
function parseDevLocationOverride(): { lat: number; lng: number } | undefined {
  const latRaw = process.env.EXPO_PUBLIC_DEV_LOCATION_LAT
  const lngRaw = process.env.EXPO_PUBLIC_DEV_LOCATION_LNG
  if (!latRaw || !lngRaw) return undefined
  const lat = Number(latRaw)
  const lng = Number(lngRaw)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
  return { lat, lng }
}

const config: ExpoConfig = {
  name: 'Redeemo',
  slug: 'redeemo-customer',
  scheme: 'redeemo',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  experiments: { typedRoutes: true },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    'expo-image-picker',
    ['expo-build-properties', {
      ios: {
        extraBuildConfiguration: {
          CLANG_CXX_LANGUAGE_STANDARD: 'gnu++20',
        },
      },
    }],
  ],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.redeemo.customer',
    associatedDomains: ['applinks:redeemo.com'],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        'Redeemo uses your location to show vouchers from merchants near you.',
      NSPhotoLibraryUsageDescription:
        'Redeemo lets you pick a profile photo from your library.',
      NSCameraUsageDescription:
        'Redeemo lets you take a profile photo with your camera.',
    },
  },
  android: {
    package: 'com.redeemo.customer',
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: 'redeemo.com', pathPrefix: '/reset-password' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
    eas: {
      projectId: '7f4d609c-6862-48d4-9583-b2f58e953d87',
    },
    devLocationOverride: parseDevLocationOverride(),
  },
}

export default config
