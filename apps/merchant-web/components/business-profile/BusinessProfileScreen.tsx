'use client'

// Business Profile M2: the read-shell orchestrator. Fetches nothing itself (the
// route owns the useMerchantProfile fetch + loading/error/success states, mirroring
// the Branches detail page pattern) - it just lays out the hero + pending-edit
// banner + five section cards from the resolved profile.
//
// Role (M2): reachable by OWNER + BRANCH_MANAGER (STAFF is nav-excluded already at
// the shell level). Both roles see the exact same read content here - M2 has no
// edit affordances to gate in the first place, so there is no role branch in this
// component.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import { useQuery } from '@tanstack/react-query'
import type { MerchantProfile } from '@/lib/api/profile'
import { getOnboardingTaxonomy } from '@/lib/api/taxonomy'
import { resolveCategoryDisplay } from '@/lib/business-profile/categoryDisplay'
import { BusinessProfileHero } from '@/components/business-profile/BusinessProfileHero'
import { PendingEditBanner } from '@/components/business-profile/PendingEditBanner'
import { PublicIdentityCard } from '@/components/business-profile/sections/PublicIdentityCard'
import { RegisteredDetailsCard } from '@/components/business-profile/sections/RegisteredDetailsCard'
import { BusinessContactCard } from '@/components/business-profile/sections/BusinessContactCard'
import { BusinessCategoryCard } from '@/components/business-profile/sections/BusinessCategoryCard'
import { ComplianceStatusCard } from '@/components/business-profile/sections/ComplianceStatusCard'

export function BusinessProfileScreen({ profile }: { profile: MerchantProfile }) {
  // Shared across the hero's category chip + the Business category card, so both
  // resolve from one fetch of the taxonomy (React Query dedupes the ['onboardingTaxonomy']
  // key against BusinessCategoryCard's own useQuery call for the same key).
  const taxonomy = useQuery({
    queryKey: ['onboardingTaxonomy'],
    queryFn: getOnboardingTaxonomy,
    staleTime: 5 * 60_000,
  })
  const categoryDisplay = resolveCategoryDisplay(
    taxonomy.data,
    profile.primaryCategoryId,
    profile.primaryDescriptorTagId,
  )

  return (
    <div className="space-y-5" data-testid="business-profile-screen">
      <PendingEditBanner profile={profile} />

      <BusinessProfileHero profile={profile} categoryDisplay={categoryDisplay} />

      <PublicIdentityCard profile={profile} />

      <div className="grid gap-5 lg:grid-cols-2">
        <RegisteredDetailsCard profile={profile} />
        <BusinessContactCard profile={profile} />
      </div>

      <BusinessCategoryCard profile={profile} />

      <ComplianceStatusCard profile={profile} />
    </div>
  )
}
