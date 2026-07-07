'use client'

// Business Profile M2/M3: the "Business category" card (prototype 01/03/04).
// Read-only display of the merchant's saved category identity, resolved from the
// taxonomy (lib/business-profile/categoryDisplay). The category icon is a generic
// brand-tint glyph - there is no per-category icon asset system yet (the taxonomy
// carries no icon field), unlike the reference screenshots' bespoke per-category
// icon.
//
// M3: an OWNER viewer (`profile.viewerCapabilities.role === 'OWNER'`) gets a LIVE
// "Change category" button that opens <CategoryChangeModal> once the taxonomy has
// loaded. A non-owner (BRANCH_MANAGER / STAFF / absent viewerCapabilities -
// fail-closed) sees the card fully read-only: no Change-category button renders at
// all. The backend `setMerchantCategoryCore` remains the real security boundary;
// this is a UX-only gate.
//
// Staging-acceptance A4: the LOCKED state is derived up-front instead of only
// being discovered on submit. The backend throws CATEGORY_CHANGE_BLOCKED when any
// RMV voucher is PENDING_APPROVAL or ACTIVE (handleCategoryChange in
// src/api/merchant/voucher/service.ts); the owner-visible flagship list carries
// exactly those statuses, so the card mirrors the same condition and disables the
// Change-category affordance (with the locked explainer) rather than offering an
// editable picker that can only dead-end. When the lock state is UNKNOWN (list
// still loading / failed), the button stays live and the modal's blocked dialog
// remains the honest backend-driven fallback.
import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getOnboardingTaxonomy } from '@/lib/api/taxonomy'
import { listFlagshipVouchers } from '@/lib/api/voucher'
import { resolveCategoryDisplay } from '@/lib/business-profile/categoryDisplay'
import { Lock, Store } from '@/lib/icons'
import { CategoryChangeModal } from '@/components/business-profile/sections/CategoryChangeModal'
import type { MerchantProfile } from '@/lib/api/profile'

export function BusinessCategoryCard({ profile }: { profile: MerchantProfile }) {
  const taxonomy = useQuery({
    queryKey: ['onboardingTaxonomy'],
    queryFn: getOnboardingTaxonomy,
    staleTime: 5 * 60_000,
  })
  const [changing, setChanging] = React.useState(false)
  const isOwner = profile.viewerCapabilities?.role === 'OWNER'

  // A4: the flagship (RMV) rows drive the derived lock state. Owner-only fetch
  // (the affordance itself is owner-only); shares the cache key used elsewhere.
  const flagship = useQuery({
    queryKey: ['merchantFlagshipVouchers'],
    queryFn: listFlagshipVouchers,
    staleTime: 60_000,
    enabled: isOwner,
  })
  // true / false when known; null while loading or after a fetch error (unknown).
  const categoryLocked: boolean | null = flagship.data
    ? flagship.data.some((v) => v.status === 'PENDING_APPROVAL' || v.status === 'ACTIVE')
    : null

  const display = resolveCategoryDisplay(taxonomy.data, profile.primaryCategoryId, profile.primaryDescriptorTagId)

  return (
    <Card className="gap-4" data-testid="business-profile-category-card">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-[12px]"
            style={{ background: 'var(--tint-deep)' }}
          >
            <Store size={20} style={{ color: 'var(--coral)' }} />
          </span>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-semibold text-foreground">Business category</h2>
              <Badge variant="neutral">
                <Lock size={10} aria-hidden className="mr-1 inline" /> Locked
              </Badge>
            </div>
            {display ? (
              <p className="text-sm font-semibold text-foreground">
                {display.topLevelName} &middot; {display.descriptor}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No category set yet</p>
            )}
          </div>
        </div>

        {isOwner ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setChanging(true)}
            disabled={!taxonomy.data || categoryLocked === true}
            data-testid="business-category-change"
          >
            Change category
          </Button>
        ) : null}
      </div>

      <div className="px-6">
        {categoryLocked === true ? (
          <p className="text-xs text-muted-foreground" data-testid="business-category-locked-note">
            Your category is locked once your starter vouchers have been submitted or are live. Contact
            Redeemo support if this needs to change.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Your category sets the two mandatory starter vouchers for your business, so it is fixed once you are
            set up. Changing it affects those starter offers and needs confirmation.
          </p>
        )}
      </div>

      {changing && taxonomy.data && categoryLocked !== true ? (
        <CategoryChangeModal profile={profile} taxonomy={taxonomy.data} onClose={() => setChanging(false)} />
      ) : null}
    </Card>
  )
}
