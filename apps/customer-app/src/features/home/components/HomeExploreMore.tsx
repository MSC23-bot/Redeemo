import React from 'react'
import { useRouter } from 'expo-router'
import { HomeChromeCard } from './HomeChromeCard'

// Task F.2 — Spec §8.5 + §11.5.
//
// `<HomeExploreMore>` is the page-bottom soft CTA mounted when supply near
// the user is sparse.  Intentionally a gentle nudge (lower visual weight
// than `<NearbySectionEmpty>`).  The sparse-supply heuristic + dedup
// mutual exclusion with `<NearbySectionEmpty>` / `<HomeNoLocationBanner>`
// is enforced at the HomeScreen level — this component does not know about
// dedup.
//
// Copy locked from §8.2 phrase library:
//   L11: "Looking for more? Explore offers across Redeemo." (body)
//   L3:  "Explore more on Redeemo" (single primary CTA → Search tab)
//
// Batch 3 (2026-06-01) — now renders through the shared <HomeChromeCard>
// `note` variant, centred, with one primary 48pt CTA (was a ~32pt pill).
// Copy + route + testID unchanged.

export function HomeExploreMore() {
  const router = useRouter()
  return (
    <HomeChromeCard
      variant="note"
      align="center"
      body="Looking for more? Explore offers across Redeemo."
      actions={[{
        label: 'Explore more on Redeemo',
        onPress: () => router.push('/(app)/search' as any),
        kind: 'primary',
        accessibilityLabel: 'Explore more on Redeemo',
      }]}
      testID="home-explore-more"
    />
  )
}
