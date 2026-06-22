'use client'

import { useQuery } from '@tanstack/react-query'
import { getMerchantProfile } from '@/lib/api/profile'
import { getOnboardingTaxonomy } from '@/lib/api/taxonomy'

// Day-2 Vouchers B3: resolve the merchant's TOP-LEVEL category NAME (the string the
// builder's lib/voucher/config keys its suggestion chips off via resolveCategoryKey).
// The profile carries only primaryCategoryId (the SUBCATEGORY id), so we walk the
// taxonomy to the top-level parent and return its name. Returns null when unknown -
// resolveCategoryKey(null) safely falls back to the CATEGORY_FALLBACK chip set.

export function useVoucherCategoryName(): string | null {
  const profile = useQuery({
    queryKey: ['merchantProfile'],
    queryFn: getMerchantProfile,
    staleTime: 60_000,
  })
  const taxonomy = useQuery({
    queryKey: ['onboardingTaxonomy'],
    queryFn: getOnboardingTaxonomy,
    staleTime: 5 * 60_000,
  })

  const subId = profile.data?.primaryCategoryId ?? null
  if (!subId || !taxonomy.data) return null

  for (const cat of taxonomy.data.categories) {
    // A top-level id resolves to itself.
    if (cat.id === subId) return cat.name
    if (cat.subcategories.some((s) => s.id === subId)) return cat.name
  }
  return null
}
