'use client'

// Branches PR-1 F9: the read-only Location card (prototype 03). It shows the formatted
// address, a confidence badge (MANUALLY_CONFIRMED -> green "Location confirmed";
// otherwise orange "Awaiting location check"), and a PURE HTML/CSS map placeholder: a
// bordered/greyed card with a centred pin SVG. There is ZERO network: NO map library,
// NO tiles, NO provider/key, NO Google call, and the raw lat/lng are NEVER rendered
// (per plan §6 #6). The "Update location / find your business" control is a DISABLED
// locked affordance (live map + business lookup ship in PR-6).
//
// Read-only for everyone (owner + BM). The locked lookup affordance shows (disabled)
// for the owner.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import { Card } from '@/components/ui/card'
import { MapPin, CheckCircle2, Info } from '@/lib/icons'
import { LockedAffordance } from '@/components/branches/LockedAffordance'
import type { Branch } from '@/lib/api/branch'

function val(v: string | null | undefined): string {
  return (v ?? '').trim()
}

export function LocationCard({ branch, isOwner }: { branch: Branch; isOwner: boolean }) {
  const confirmed = branch.locationConfidence === 'MANUALLY_CONFIRMED'
  const address = [
    val(branch.addressLine1),
    val(branch.addressLine2),
    val(branch.city),
    val(branch.postcode),
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <Card className="gap-4" data-testid="branch-location-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6">
        <div className="flex items-center gap-2">
          <MapPin size={16} aria-hidden style={{ color: 'var(--text-tertiary)' }} />
          <h2 className="font-display text-lg font-semibold text-foreground">Location on the map</h2>
        </div>
        <ConfidenceBadge confirmed={confirmed} />
      </div>

      <div className="space-y-3 px-6">
        {/* Pure HTML/CSS map placeholder. No network, no map library, no coordinates. */}
        <div
          data-testid="branch-map-placeholder"
          aria-hidden
          className="flex h-40 w-full items-center justify-center rounded-[14px] border"
          style={{
            background:
              'repeating-linear-gradient(45deg, var(--page), var(--page) 14px, var(--cream) 14px, var(--cream) 28px)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <span
            className="flex size-11 items-center justify-center rounded-full shadow-sm"
            style={{ background: 'var(--rose)' }}
          >
            <MapPin size={22} style={{ color: '#FFFFFF' }} />
          </span>
        </div>

        {address ? <p className="text-sm text-foreground">{address}</p> : null}

        <p className="text-sm text-muted-foreground">
          Worked out from the address. You did not enter coordinates.
        </p>

        {/* Locked PR-6 affordance: live map + business lookup. Disabled, no network. */}
        {isOwner ? (
          <div className="pt-1">
            <LockedAffordance label="Update location" icon={<MapPin size={14} aria-hidden />} />
          </div>
        ) : null}
      </div>
    </Card>
  )
}

function ConfidenceBadge({ confirmed }: { confirmed: boolean }) {
  if (confirmed) {
    return (
      <span
        data-testid="location-confidence-badge"
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
        style={{ background: 'rgba(15, 122, 62, 0.10)', color: 'var(--success)' }}
      >
        <CheckCircle2 size={13} aria-hidden /> Location confirmed
      </span>
    )
  }
  return (
    <span
      data-testid="location-confidence-badge"
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}
    >
      <Info size={13} aria-hidden /> Awaiting location check
    </span>
  )
}
