'use client'

// Branches PR-1 F7: the Branch details card (prototype 07/11). It surfaces the
// reviewed identity values (name, about, address, town/city, postcode) read-only with
// a "Reviewed by Redeemo" note. An owner gets:
//   - an Edit button that opens the F7 reviewed-edit modal (BranchDetailsEditModal),
//     which submits an admin-reviewed edit-request (existing values stay live until
//     approval), and
//   - a pending banner + Withdraw (PendingEditsList) whenever an identity edit is in
//     review. While one is pending the Edit button is DISABLED so a second concurrent
//     request can never be created; the user must withdraw first.
// A non-owner is read-only: no Edit, no Withdraw.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import { Card } from '@/components/ui/card'
import { Pencil } from '@/lib/icons'
import { BranchDetailsEditModal } from '@/components/branches/BranchDetailsEditModal'
import { PendingEditsList } from '@/components/branches/PendingEditsList'
import type { Branch } from '@/lib/api/branch'

function val(v: string | null | undefined): string {
  return (v ?? '').trim()
}

export function BranchDetailsCard({ branch, isOwner }: { branch: Branch; isOwner: boolean }) {
  const [editOpen, setEditOpen] = React.useState(false)

  // An identity (non-photo) edit currently in review blocks a second concurrent edit.
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
    <Card className="gap-4" data-testid="branch-details-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Branch details</h2>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Reviewed by Redeemo
          </span>
          {isOwner ? (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              disabled={hasPendingIdentityEdit}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6B7390] hover:text-[#010C35] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Pencil size={15} aria-hidden /> Edit
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 px-6">
        {/* Pending-edit banner + withdraw (owner only gets the withdraw control). */}
        <PendingEditsList branch={branch} isOwner={isOwner} />

        <Field label="Branch name" value={val(branch.name)} empty="No name set" />
        <Field label="Description" value={val(branch.about)} empty="No description added" />
        <Field label="Address" value={address} empty="No address added" />
      </div>

      {editOpen ? <BranchDetailsEditModal branch={branch} onClose={() => setEditOpen(false)} /> : null}
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
