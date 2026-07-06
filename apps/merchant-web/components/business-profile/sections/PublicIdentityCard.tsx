'use client'

// Business Profile M2: the "Public identity" card (prototype 01/03). Read-only in
// M2 - businessName, tradingName, description, logo + banner swatches with the
// prototype's captions. The Edit affordance renders (matches the reference
// screenshots) but is disabled: writing this card is M3/M4 scope.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { DisabledEditButton } from '@/components/business-profile/DisabledEditButton'
import type { MerchantProfile } from '@/lib/api/profile'

function val(v: string | null | undefined): string {
  return (v ?? '').trim()
}

export function PublicIdentityCard({ profile }: { profile: MerchantProfile }) {
  const initial = profile.businessName.trim().charAt(0).toUpperCase() || '?'

  return (
    <Card className="gap-4" data-testid="business-profile-public-identity-card">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6">
        <div className="space-y-0.5">
          <h2 className="font-display text-lg font-semibold text-foreground">Public identity</h2>
          <p className="text-sm text-muted-foreground">
            What customers see. Changes to these are checked by Redeemo before they go live.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Reviewed by Redeemo
          </span>
          <DisabledEditButton label="Edit" testId="public-identity-edit" />
        </div>
      </div>

      <div className="space-y-4 px-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" value={val(profile.businessName)} empty="No name set" />
          <Field label="Trading name" value={val(profile.tradingName)} empty="Same as business name" />
        </div>

        <Field label="Description" value={val(profile.description)} empty="No description added" />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Logo</p>
            <div className="flex items-center gap-3">
              <div
                className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border"
                style={{ background: 'var(--cream)', borderColor: 'var(--border-subtle)' }}
              >
                {profile.logoUrl ? (
                  <Image
                    src={profile.logoUrl}
                    alt=""
                    width={56}
                    height={56}
                    className="size-full object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="font-display text-lg font-semibold" style={{ color: 'var(--rose)' }}>
                    {initial}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Square logo, shown on your listing and vouchers.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Banner</p>
            {profile.bannerUrl ? (
              <div
                className="relative h-14 w-full overflow-hidden rounded-[14px] border"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <Image src={profile.bannerUrl} alt="" fill sizes="100vw" className="object-cover" unoptimized />
              </div>
            ) : (
              <div
                className="flex h-14 w-full items-center rounded-[14px] px-3"
                style={{ background: 'var(--brand-gradient)' }}
              >
                <p className="text-xs font-medium text-white">Wide banner, shown at the top of your listing.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

function Field({ label, value, empty }: { label: string; value: string; empty: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {value ? (
        <p className="text-sm text-foreground">{value}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  )
}
