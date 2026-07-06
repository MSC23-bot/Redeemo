'use client'

// Business Profile M2: the "Business category" card (prototype 01/03/04). Read-only
// display of the merchant's saved category identity, resolved from the taxonomy
// (lib/business-profile/categoryDisplay). The category icon is a generic brand-tint
// glyph in M2 - there is no per-category icon asset system yet (the taxonomy carries
// no icon field), unlike the reference screenshots' bespoke per-category icon. The
// "Change category" affordance renders (matches the screenshots) but is disabled -
// category change is gated Tier-3 backend work (M4), not M2 scope.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DisabledEditButton } from '@/components/business-profile/DisabledEditButton'
import { getOnboardingTaxonomy } from '@/lib/api/taxonomy'
import { resolveCategoryDisplay } from '@/lib/business-profile/categoryDisplay'
import { Lock, Store } from '@/lib/icons'
import type { MerchantProfile } from '@/lib/api/profile'

export function BusinessCategoryCard({ profile }: { profile: MerchantProfile }) {
  const taxonomy = useQuery({
    queryKey: ['onboardingTaxonomy'],
    queryFn: getOnboardingTaxonomy,
    staleTime: 5 * 60_000,
  })

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

        <DisabledEditButton label="Change category" icon={null} testId="business-category-change" />
      </div>

      <div className="px-6">
        <p className="text-xs text-muted-foreground">
          Your category sets the two mandatory starter vouchers for your business, so it is fixed once you are
          set up. Changing it affects those starter offers and needs confirmation.
        </p>
      </div>
    </Card>
  )
}
