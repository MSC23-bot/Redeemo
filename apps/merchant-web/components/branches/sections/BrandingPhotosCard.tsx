'use client'

// Branches PR-1 F11: branding + photos display (prototype 05/06/09). It surfaces the
// branch logo mark (small cream box), the banner hero, and the photo gallery with each
// existing photo marked "Approved" and an in-review counter driven by the PENDING photo
// edits on the payload (pendingEdits where includesPhotos). When no banner is set it
// shows the prototype "Add a wide banner image" placeholder.
//
// EDIT semantics (plan §F11): logo + banner are SENSITIVE identity fields that apply
// via the reviewed edit-request lane, so the "Edit" control here OPENS the F7
// BranchDetailsEditModal (owner-only). F11 builds NO separate logo/banner editor.
//
// SCOPE / SECURITY (plan §6 #7): the photo GALLERY add/replace/remove is DISPLAY-ONLY
// in PR-1. "Add photo" / "Add a new banner" are DISABLED locked affordances (gallery
// review ships in PR-3). F11 NEVER calls requestBranchPhotoEdit.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { Image as ImageIcon, CheckCircle2, Clock, Pencil } from '@/lib/icons'
import { LockedAffordance } from '@/components/branches/LockedAffordance'
import { BranchDetailsEditModal } from '@/components/branches/BranchDetailsEditModal'
import type { Branch } from '@/lib/api/branch'

export function BrandingPhotosCard({ branch, isOwner }: { branch: Branch; isOwner: boolean }) {
  const [editOpen, setEditOpen] = React.useState(false)

  const photos = branch.photos ?? []
  // The number of photo edits currently in review (PENDING-only rows on the payload).
  const photosInReview = (branch.pendingEdits ?? []).filter((e) => e.includesPhotos).length

  return (
    <Card className="gap-4" data-testid="branch-branding-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6">
        <div className="flex items-center gap-2">
          <ImageIcon size={16} aria-hidden style={{ color: 'var(--text-tertiary)' }} />
          <h2 className="font-display text-lg font-semibold text-foreground">Branding and photos</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Reviewed by Redeemo
          </span>
          {/* Logo/banner edit routes into the F7 reviewed-edit modal (owner only). */}
          {isOwner ? (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6B7390] hover:text-[#010C35]"
            >
              <Pencil size={15} aria-hidden /> Edit
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-5 px-6">
        {/* Logo + banner display row. */}
        <div className="grid grid-cols-[auto_1fr] gap-4">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Logo</p>
            <div
              className="flex size-20 items-center justify-center overflow-hidden rounded-[14px] border"
              style={{ background: 'var(--cream)', borderColor: 'var(--border-subtle)' }}
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
                <span className="font-display text-2xl font-semibold" style={{ color: 'var(--rose)' }}>
                  {branch.name.trim().charAt(0).toUpperCase() || '?'}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Banner</p>
            {branch.bannerUrl ? (
              <div
                className="relative h-20 w-full overflow-hidden rounded-[14px] border"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <Image src={branch.bannerUrl} alt="" fill sizes="100vw" className="object-cover" unoptimized />
              </div>
            ) : (
              <div
                className="flex h-20 w-full flex-col items-center justify-center gap-1.5 rounded-[14px] border"
                style={{ background: 'var(--tint)', borderColor: 'var(--border-subtle)' }}
              >
                <ImageIcon size={18} aria-hidden style={{ color: 'var(--text-tertiary)' }} />
                {/* Locked PR-3 banner add: disabled, no network, never requestBranchPhotoEdit. */}
                <LockedAffordance label="Add a new banner" variant="link" subtext={false} />
              </div>
            )}
          </div>
        </div>

        {/* Photo gallery: read-only with per-photo Approved markers + in-review counter. */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Photos
            </p>
            {photosInReview > 0 ? (
              <span
                data-testid="photos-in-review-counter"
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}
              >
                <Clock size={12} aria-hidden /> {photosInReview} in review
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {photos.map((p) => (
              <figure
                key={p.id}
                data-testid="branch-photo"
                className="relative overflow-hidden rounded-[12px] border"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="relative aspect-square w-full" style={{ background: 'var(--page)' }}>
                  <Image src={p.url} alt="" fill sizes="160px" className="object-cover" unoptimized />
                </div>
                <figcaption
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--success)' }}
                >
                  <CheckCircle2 size={11} aria-hidden /> Approved
                </figcaption>
              </figure>
            ))}

            {/* Locked PR-3 photo add: disabled, no network, never requestBranchPhotoEdit. */}
            <div
              className="flex aspect-square items-center justify-center rounded-[12px] border border-dashed"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <LockedAffordance label="Add photo" subtext={false} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            New images are checked before they show to customers. Approved images stay live while a new one
            is in review.
          </p>
        </div>
      </div>

      {editOpen ? <BranchDetailsEditModal branch={branch} onClose={() => setEditOpen(false)} /> : null}
    </Card>
  )
}
