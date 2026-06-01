import React from 'react'
import { useRouter } from 'expo-router'
import { color } from '@/design-system'
import { Sparkles } from '@/design-system/icons'
import { HomeChromeCard } from './HomeChromeCard'

// Task E.2 — Spec §8.4 + §11.4.
//
// `<NearbySectionEmpty>` is the section-level friendly empty card mounted
// when `feed.nearbyByCategoryRails.length === 0` AND
// `feed.locationContext.source !== 'none'`.  The no-location state is
// handled at the top of Home by `<HomeNoLocationBanner>`.
//
// Copy locked from §8.2 phrase library:
//   L1: "We're still growing near you"
//   L5: "We're still growing in {City}. Try browsing categories or
//        searching to find offers across the UK." (locality-aware;
//        defensive fallback drops the locality clause when cityName null)
//   L6: "Browse all categories" (primary → Categories tab)
//   L7: "Open search"           (secondary → Search tab)
//
// Batch 3 (2026-06-01) — renders through the shared <HomeChromeCard>
// `empty` variant: the one place warm cream is reserved (bottom-of-page,
// not adjacent to a band), with a Sparkles icon anchor, Mustica ~20 title,
// and two 48pt CTAs (were ~32pt pills). Copy + routes + testID unchanged.

interface NearbySectionEmptyProps {
  cityName?: string | null
}

export function NearbySectionEmpty({ cityName }: NearbySectionEmptyProps = {}) {
  const router = useRouter()
  const bodyText = cityName
    ? `We're still growing in ${cityName}. Try browsing categories or searching to find offers across the UK.`
    : `Try browsing categories or searching to find offers across the UK.`
  return (
    <HomeChromeCard
      variant="empty"
      icon={<Sparkles size={24} color={color.text.tertiary} />}
      title="We're still growing near you"
      body={bodyText}
      actions={[
        { label: 'Browse all categories', onPress: () => router.push('/(app)/categories' as any), kind: 'primary', accessibilityLabel: 'Browse all categories' },
        { label: 'Open search', onPress: () => router.push('/(app)/search' as any), kind: 'secondary', accessibilityLabel: 'Open search' },
      ]}
      testID="home-nearby-section-empty"
    />
  )
}
