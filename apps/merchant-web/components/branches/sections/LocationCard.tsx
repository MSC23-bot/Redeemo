'use client'

// Branches PR-1 F9 + PR-6 (Layer 3): the Location card (prototype 03). It shows the
// formatted address, a confidence badge (MANUALLY_CONFIRMED -> green "Location
// confirmed"; otherwise orange "Awaiting location check"), and a PURE HTML/CSS map
// PLACEHOLDER (a bordered/greyed card with a centred pin SVG). There is ZERO network
// on the card itself: NO map library, NO tiles, NO provider/key, NO Google call, and
// the raw lat/lng are NEVER rendered (per plan §6 #6). A live/static map is DEFERRED
// (mini-spec §11) - the map stays a placeholder.
//
// PR-6: the "Update location" control is now ACTIVE (was a DISABLED LockedAffordance).
// It opens the reviewed branch-details edit modal, which carries the PR-6 business /
// address lookup (search-and-pick autofill). The address change rides the reviewed
// edit lane on a LIVE branch; the precise pin stays admin-confirmed.
//
// Gate: `canManage` (UX gate only - the backend denies STAFF on the search + apply
// regardless). D-BM1: the per-branch capability signal is LIVE - an assigned
// Branch Manager sees this entry point on LIVE merchants; draft-window identity
// edits stay owner-only via the canEditIdentity composite threaded by BranchDetail.
// (Closes the recorded "BM-sees-lookup needs the client role/branch signal" follow-up.)
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import { Card } from '@/components/ui/card'
import { MapPin, CheckCircle2, Info } from '@/lib/icons'
import { BranchDetailsEditModal } from '@/components/branches/BranchDetailsEditModal'
import type { Branch } from '@/lib/api/branch'

function val(v: string | null | undefined): string {
  return (v ?? '').trim()
}

export function LocationCard({ branch, canManage }: { branch: Branch; canManage: boolean }) {
  const [editOpen, setEditOpen] = React.useState(false)
  const confirmed = branch.locationConfidence === 'MANUALLY_CONFIRMED'

  // A pending identity edit already in review blocks a second concurrent reviewed
  // submit (same constraint the Branch details card enforces), so we disable the
  // entry point to keep the UX honest rather than surfacing the PENDING_EDIT_EXISTS
  // error on submit.
  const hasPendingIdentityEdit = (branch.pendingEdits ?? []).some(
    (e) => e.status === 'PENDING' && !e.includesPhotos,
  )

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

        {/* PR-6: ACTIVE "Update location" control (was a disabled locked affordance).
            Opens the reviewed edit modal, which carries the business / address lookup.
            Owner-gated UX; the backend is the real boundary. */}
        {canManage ? (
          <div className="pt-1">
            <button
              type="button"
              data-testid="location-update-button"
              onClick={() => setEditOpen(true)}
              disabled={hasPendingIdentityEdit}
              className="inline-flex items-center gap-1.5 rounded-[10px] border px-3 py-2 text-sm font-semibold transition-colors hover:bg-[var(--tint)] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--foreground)' }}
            >
              <MapPin size={14} aria-hidden style={{ color: 'var(--rose)' }} /> Update location
            </button>
            {hasPendingIdentityEdit ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                A details change is already in review. Withdraw it on the branch page first.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {editOpen ? (
        <BranchDetailsEditModal branch={branch} onClose={() => setEditOpen(false)} />
      ) : null}
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
