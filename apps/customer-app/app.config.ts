import type { ExpoConfig } from 'expo/config'

const config: ExpoConfig = {
  name: 'Redeemo',
  slug: 'redeemo-customer',
  scheme: 'redeemo',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  experiments: { typedRoutes: true },
  plugins: ['expo-router', 'expo-secure-store', 'expo-font', 'expo-image-picker'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.redeemo.customer',
    associatedDomains: ['applinks:redeemo.com'],
    infoPlist: {
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
  },
}

export default config
