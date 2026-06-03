import React from 'react'
import { useRouter } from 'expo-router'
import { color } from '@/design-system'
import { MapPinOff } from '@/design-system/icons'
import { useUserLocation } from '@/hooks/useLocation'
import { HomeChromeCard } from './HomeChromeCard'

// Task F.1 — Spec §8.6 + §11.3.
//
// `<HomeNoLocationBanner>` is the top-of-Home banner mounted when
// `feed.locationContext.source === 'none'`.  HomeScreen wiring enforces the
// source check + dedup — this component does not check the source itself.
//
// Copy locked from §8.2 phrase library:
//   L4:  "Set your area to see nearby offers" (headline)
//   L8:  "Allow location or set your saved area so we can show you
//         what's nearby." (body)
//   L9:  "Allow location" (primary → useUserLocation().requestPermission)
//   L10: "Set my area"    (secondary → PC2 address screen)
//
// Batch 3 (2026-06-01) — renders through the shared <HomeChromeCard>
// `banner` variant: white surface + neutral hairline, Mustica ~20 title,
// a MapPinOff icon anchor, and two 48pt CTAs (were ~32pt pills). Copy +
// routes + `requestPermission` behaviour + testID unchanged.

export function HomeNoLocationBanner() {
  const router = useRouter()
  const { requestPermission } = useUserLocation()
  return (
    <HomeChromeCard
      variant="banner"
      icon={<MapPinOff size={22} color={color.text.tertiary} />}
      title="Set your area to see nearby offers"
      body="Allow location or set your saved area so we can show you what's nearby."
      actions={[
        { label: 'Allow location', onPress: () => { requestPermission() }, kind: 'primary', accessibilityLabel: 'Allow location' },
        { label: 'Set my area', onPress: () => router.push('/(auth)/profile-completion/address' as any), kind: 'secondary', accessibilityLabel: 'Set my area' },
      ]}
      testID="home-no-location-banner"
    />
  )
}
