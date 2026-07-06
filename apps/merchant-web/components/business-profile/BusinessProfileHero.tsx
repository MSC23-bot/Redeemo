'use client'

// Business Profile M2: the status-aware hero (prototype 01/02/04). Banner + logo +
// business name + trading name + a lifecycle-derived verification badge, with the
// category chip aligned to the right (mirrors the read-only chip used again inside
// the "Business category" card below). Read-only - no edit affordance lives on the
// hero in either the prototype or this build.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import Image from 'next/image'
import type { MerchantProfile } from '@/lib/api/profile'
import { deriveStatusPill } from '@/lib/auth/lifecycle'
import { resolveVerificationBadge } from '@/lib/business-profile/verificationBadge'
import type { CategoryDisplay } from '@/lib/business-profile/categoryDisplay'
import { CheckCircle2, Clock, AlertTriangle, Store } from '@/lib/icons'

export function BusinessProfileHero({
  profile,
  categoryDisplay,
}: {
  profile: MerchantProfile
  categoryDisplay: CategoryDisplay | null
}) {
  const state = deriveStatusPill(profile)
  const badge = resolveVerificationBadge(state)
  const BadgeIcon = badge.tone === 'success' ? CheckCircle2 : badge.tone === 'danger' ? AlertTriangle : Clock

  const initial = profile.businessName.trim().charAt(0).toUpperCase() || '?'

  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      data-testid="business-profile-hero"
    >
      {/* Banner. A brand-gradient band when there is no banner image. */}
      <div className="relative h-28 w-full sm:h-36" style={{ background: 'var(--brand-gradient)' }}>
        {profile.bannerUrl ? (
          <Image
            src={profile.bannerUrl}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
            unoptimized
          />
        ) : null}
      </div>

      <div className="px-5 pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-end gap-4">
            <div
              className="-mt-8 flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border-2 sm:-mt-10 sm:size-20"
              style={{ background: 'var(--brand-gradient)', borderColor: 'var(--page)' }}
            >
              {profile.logoUrl ? (
                <Image
                  src={profile.logoUrl}
                  alt=""
                  width={80}
                  height={80}
                  className="size-full object-cover"
                  unoptimized
                />
              ) : (
                <span className="font-display text-2xl font-semibold text-white">{initial}</span>
              )}
            </div>

            <div className="space-y-1 pb-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-display text-2xl font-semibold text-foreground">
                  {profile.businessName}
                </h1>
                <span
                  data-testid="business-profile-verification-badge"
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
                  style={{ background: badge.bg, color: badge.fg }}
                >
                  <BadgeIcon size={13} aria-hidden /> {badge.label}
                </span>
              </div>
              {profile.tradingName ? (
                <p className="text-sm text-muted-foreground">{profile.tradingName}</p>
              ) : null}
            </div>
          </div>

          {categoryDisplay ? (
            <span
              data-testid="business-profile-category-chip"
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-semibold"
              style={{ background: 'var(--tint)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            >
              <Store size={14} aria-hidden style={{ color: 'var(--coral)' }} />
              {categoryDisplay.topLevelName} &middot; {categoryDisplay.descriptor}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
