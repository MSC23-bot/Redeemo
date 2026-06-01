// v1.5 — PR #126 device-QA-3 owner direction (β2 + β3, 2026-05-23).
//
// Minimal banner that renders ABOVE the NearbyByCategory section when at
// least one category rail has cascaded to platform supply (i.e. one or
// more `nearbyByCategoryRails[i].meta.scopeExpanded === true`).  Provides
// honest context that local/catchment supply is limited so the user
// understands why category rails carry `{Category} on Redeemo` headers
// + larger distances on the tile chips.
//
// Locked owner copy (β3 sample):
//   "We're still growing in {City}.  Here are the closest category
//    matches on Redeemo."
//
// Defensive fallback when `cityName` is null drops the leading clause.
//
// Batch 3 (2026-06-01) — now renders through the shared <HomeChromeCard>
// `note` variant (white surface + neutral hairline, body 14/20). Copy +
// testID unchanged.

import React from 'react'
import { HomeChromeCard } from './HomeChromeCard'

interface NearbyContextBannerProps {
  cityName?: string | null
}

export function NearbyContextBanner({ cityName }: NearbyContextBannerProps = {}) {
  const message = cityName
    ? `We're still growing in ${cityName}. Here are the closest category matches on Redeemo.`
    : `Here are the closest category matches on Redeemo.`
  return <HomeChromeCard variant="note" body={message} testID="home-nearby-context-banner" />
}
