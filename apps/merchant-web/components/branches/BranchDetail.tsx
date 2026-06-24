'use client'

// Branches PR-1 F3: the branch detail layout. The orchestrator page (the route)
// owns the loading / error / not-found states and the data fetch; this component
// renders a resolved branch: the header (banner + logo + name + sub-brand + status
// pill + Main-branch badge), the review-state banners, and the owner-only staff
// card (F12). It is structured so the later tasks slot their section cards into the
// clearly-marked mount points below WITHOUT reshaping the header or banners.
//
// Owner gate (plan §1.5): `isOwner` (from useBranchCapability on the page) gates the
// write controls the later tasks add; F3 only uses it for the staff panel (which is
// itself owner-gated) and threads it down so F4-F8 can gate on it. The backend
// owner-only resolver is the real boundary.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import Image from 'next/image'
import type { Branch } from '@/lib/api/branch'
import { openNow, type OpeningHoursRow } from '@/lib/branches/openNow'
import { ReviewStateBanners } from '@/components/branches/ReviewStateBanners'
import { BranchLifecycleBanner } from '@/components/branches/BranchLifecycleBanner'
import { StaffAtBranchCard } from '@/components/branches/StaffAtBranchCard'
import { ContactCard } from '@/components/branches/sections/ContactCard'
import { AmenitiesCard } from '@/components/branches/sections/AmenitiesCard'
import { PinCard } from '@/components/branches/sections/PinCard'
import { BranchDetailsCard } from '@/components/branches/sections/BranchDetailsCard'
import { MainBranchControl } from '@/components/branches/sections/MainBranchControl'
import { LocationCard } from '@/components/branches/sections/LocationCard'
import { OpeningHoursCard } from '@/components/branches/sections/OpeningHoursCard'
import { BrandingPhotosCard } from '@/components/branches/sections/BrandingPhotosCard'
import { RedemptionAlertsCard } from '@/components/branches/sections/RedemptionAlertsCard'
import { CloseBranchSection } from '@/components/branches/sections/CloseBranchSection'

export function BranchDetail({
  branch,
  businessName,
  isOwner,
  ready,
  now = new Date(),
}: {
  branch: Branch
  businessName: string | null
  isOwner: boolean
  ready: boolean
  now?: Date
}) {
  return (
    <div className="space-y-5">
      <BranchHeader
        branch={branch}
        businessName={businessName}
        isOwner={ready && isOwner}
        now={now}
      />

      {/* PR-5: the lifecycle banner. PENDING_CREATE shows "Awaiting Redeemo approval"
          + an owner-only Cancel; PENDING_CLOSE shows the pending-close banner + an
          owner-only Withdraw. LIVE / CLOSED render nothing here. */}
      <BranchLifecycleBanner branch={branch} isOwner={ready && isOwner} />

      {/* F3: the review-state banners (photos in review + awaiting location check). */}
      <ReviewStateBanners branch={branch} />

      {/* F7: branch-details identity values (read-only) + reviewed edit modal + pending edits + withdraw. */}
      <BranchDetailsCard branch={branch} isOwner={ready && isOwner} />

      {/* F9: read-only location confidence badge + static (no-network) map stub + locked PR-6 lookup affordance. */}
      <LocationCard branch={branch} isOwner={ready && isOwner} />

      {/* F4: contact instant-save (phone / email / website). Owner-only edit; BM read-only. */}
      <ContactCard branch={branch} isOwner={ready && isOwner} />

      {/* F10: read-only opening-hours table (incl. Closed days) + locked PR-4 Edit + locked PR-8 multi-window. */}
      <OpeningHoursCard branch={branch} isOwner={ready && isOwner} now={now} />

      {/* F6: masked PIN with on-demand reveal + change + send. Owner-only (renders nothing for a non-owner). */}
      <PinCard branch={branch} isOwner={ready && isOwner} />

      {/* F13: redemption-alerts card (whole card visible, all controls disabled; alerts ship in PR-7). */}
      <RedemptionAlertsCard isOwner={ready && isOwner} />

      {/* F5: amenities catalogue toggle (full-replace). Owner-only edit; BM read-only. */}
      <AmenitiesCard branch={branch} isOwner={ready && isOwner} />

      {/* F11: logo / banner display (edit via the F7 modal) + photo grid display-only + locked PR-3 Add. */}
      <BrandingPhotosCard branch={branch} isOwner={ready && isOwner} />

      {/* F12: owner-only staff-at-branch card. Renders nothing for a non-owner. */}
      <StaffAtBranchCard branchId={branch.id} isOwner={isOwner} ready={ready} />

      {/* F13: Close-branch section (visible warning card with a disabled, no-action close control; PR-5). */}
      <CloseBranchSection isOwner={ready && isOwner} />
    </div>
  )
}

function BranchHeader({
  branch,
  businessName,
  isOwner,
  now,
}: {
  branch: Branch
  businessName: string | null
  isOwner: boolean
  now: Date
}) {
  const locality = branch.city ?? null
  const address = [branch.addressLine1, locality, branch.postcode].filter(Boolean).join(', ')

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Hero / banner. A warm-tinted band when there is no banner image. */}
      <div className="relative h-28 w-full sm:h-36" style={{ background: 'var(--tint)' }}>
        {branch.bannerUrl ? (
          <Image
            src={branch.bannerUrl}
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
            {/* Logo mark in the small cream/peach box (prototype 02/05). */}
            <div
              className="-mt-8 flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border-2 sm:-mt-10 sm:size-20"
              style={{ background: 'var(--cream)', borderColor: 'var(--page)' }}
            >
              {branch.logoUrl ? (
                <Image
                  src={branch.logoUrl}
                  alt=""
                  width={80}
                  height={80}
                  className="size-full object-cover"
                  unoptimized
                />
              ) : (
                <span className="font-display text-xl font-semibold" style={{ color: 'var(--rose)' }}>
                  {branch.name.trim().charAt(0).toUpperCase() || '?'}
                </span>
              )}
            </div>

            <div className="min-w-0 space-y-1 pb-1">
              {businessName ? (
                <p className="text-[12px] font-extrabold uppercase tracking-wide text-muted-foreground">
                  {businessName}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-semibold text-foreground">{branch.name}</h1>
                {/* F8: asymmetric main-branch control (badge when main, owner action otherwise). */}
                <MainBranchControl branch={branch} isOwner={isOwner} />
              </div>
              {address ? <p className="text-sm text-muted-foreground">{address}</p> : null}
            </div>
          </div>

          <StatusPill branch={branch} now={now} />
        </div>
      </div>
    </div>
  )
}

// Read-only status pill (derived from isActive + open-now). PR-1 does NOT expose an
// isActive toggle anywhere; the active/closed state is display-only here.
function StatusPill({ branch, now }: { branch: Branch; now: Date }) {
  const closed = branch.isActive === false
  const isOpen = !closed && openNow((branch.openingHours ?? []) as OpeningHoursRow[], now)
  const label = closed ? 'Closed' : isOpen ? 'Open now' : 'Active'
  return (
    <span
      data-testid="branch-status-pill"
      className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
    >
      <span
        aria-hidden
        className="inline-block size-1.5 rounded-full"
        style={{ backgroundColor: closed ? 'var(--muted-foreground)' : 'var(--success)' }}
      />
      <span className={closed ? 'text-muted-foreground' : 'text-foreground'}>{label}</span>
    </span>
  )
}
