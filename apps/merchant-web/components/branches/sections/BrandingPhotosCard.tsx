'use client'

// Branches PR-3 §7: branding + photo GALLERY review lane (prototype 05/06/09).
// The card surfaces the branch logo mark, the banner hero, and a real per-photo
// gallery that replaces PR-1's blanket-"Approved" render:
//   - APPROVED rows (branch.photos where moderationStatus === 'APPROVED') are the
//     LIVE gallery; for the OWNER each one carries a Remove (X) control that calls
//     the instant-removal route (PR-3 §6b) optimistically.
//   - IN-REVIEW thumbnails come from the open PENDING photo edit's
//     proposedChanges.add URLs (no row exists yet; admin decides). NO remove control.
//   - "Add photo" (owner) uploads the asset via the branch-scoped upload (PR-3 §6c)
//     then opens an add-via-review request (PR-3 §6a); the new photo shows "In review".
//
// EDIT semantics (unchanged from PR-1): logo + banner are SENSITIVE identity fields
// applied via the F7 reviewed edit-request lane, so the header "Edit" control OPENS
// the F7 BranchDetailsEditModal (Edit affordance owner-only here - see GATES below). Banner stays the F7 lane (PR-3 §7
// default); the gallery manages branch PHOTOS only, not the banner.
//
// Fidelity polish (2026-07-07 audit): the empty-banner slot used to render a
// LockedAffordance ("Add a new banner" / "Coming in this Branches rollout"), but
// banner upload has ALREADY shipped via this card's Edit button (BranchDetailsEditModal
// carries a live banner FileUpload) - so that copy was stale/misleading, not a real
// gate. The empty state now just names the gap and, for an owner, points at the
// live Edit control above rather than claiming the feature is "coming soon".
//
// GATES (D-BM1 + PR-3 §7 / D-PR3-4): Add-photo now flips via `canManage` (the
// per-branch effective capability - the deferred signal this comment once
// anticipated). Per-photo REMOVE stays OWNER-only (explicit D-PR3-4 exception;
// BM parity is a separate unapproved owner decision). The branding Edit
// affordance also stays OWNER-only - it is not in the approved D-BM1 flip list;
// a BM reaches the same modal via BranchDetailsCard on LIVE merchants. All
// presentational only; the backend is the real boundary.
//
// SECURITY: never render redemptionPin or any encrypted/secret field (PR-1 discipline).
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { Image as ImageIcon, CheckCircle2, Clock, Pencil, Plus, X } from '@/lib/icons'
import { BranchDetailsEditModal } from '@/components/branches/BranchDetailsEditModal'
import { uploadBranchPhoto } from '@/lib/api/branch'
import { useRequestBranchPhotoEdit, useRemoveBranchPhoto } from '@/lib/branches/useBranches'
import { ApiError } from '@/lib/api/client'
import type { Branch } from '@/lib/api/branch'

// Client-side image pre-checks (mirror the FileUpload control + backend photo caps).
const ACCEPTED_TYPES = ['image/png', 'image/jpeg']
const PHOTO_MAX_BYTES = 5 * 1024 * 1024

export function BrandingPhotosCard({ branch, canManage, isOwner }: { branch: Branch; canManage: boolean; isOwner: boolean }) {
  const { toast } = useToast()
  const requestEdit = useRequestBranchPhotoEdit()
  const removePhoto = useRemoveBranchPhoto()

  const [editOpen, setEditOpen] = React.useState(false)
  const [addError, setAddError] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState(false)
  // The photo id with an in-flight removal (drives optimistic dim + disable).
  const [removingId, setRemovingId] = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const allPhotos = branch.photos ?? []
  // LIVE gallery: ONLY APPROVED rows are customer-visible + removable. The backend
  // GUARANTEES the field (Prisma BranchPhoto.moderationStatus is non-nullable with
  // @default(PENDING), and GET /branches/:id ships the whole row via `photos: true`),
  // so a strict equality gate is correct: PENDING / FLAGGED rows must NEVER render as
  // live/approved. The client schema now requires moderationStatus too, so there is no
  // "missing field" case to fall back on.
  const approvedPhotos = allPhotos.filter((p) => p.moderationStatus === 'APPROVED')

  // IN-REVIEW thumbnails: the open PENDING photo edit's proposed add URLs. There is
  // at most one PENDING edit per branch (PENDING_EDIT_EXISTS), so take the first.
  const pendingPhotoEdit = (branch.pendingEdits ?? []).find((e) => e.includesPhotos)
  const inReviewUrls = (pendingPhotoEdit?.proposedChanges.add ?? []).filter(
    (u): u is string => typeof u === 'string' && u.length > 0,
  )
  const inReviewCount = inReviewUrls.length
  const hasPendingPhotoEdit = !!pendingPhotoEdit

  function openFilePicker() {
    setAddError(null)
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const file = input.files?.[0]
    input.value = '' // reset so re-picking the same file refires onChange
    if (!file) return

    setAddError(null)
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setAddError('Use a PNG or JPG image.')
      return
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setAddError('That image is too large. Keep it under 5MB.')
      return
    }

    setUploading(true)
    try {
      // 1. Upload the asset via the branch-scoped upload (no canManageVouchers).
      const { url } = await uploadBranchPhoto(branch.id, file)
      // 2. Submit the add. During onboarding (draft window: REGISTERED /
      //    NEEDS_CHANGES) the backend applies it DIRECTLY as a live APPROVED
      //    photo (status: 'APPLIED') instead of staging a review request, so a
      //    not-yet-live branch's first photos are not honestly-falsely reported
      //    as "in review" (owner decision, walkthrough finding 7-photos).
      const result = await requestEdit.mutateAsync({ id: branch.id, addUrls: [url] })
      const appliedDirectly =
        !!result && typeof result === 'object' && (result as { status?: string }).status === 'APPLIED'
      toast({
        message: appliedDirectly ? 'Photo added.' : 'Photo submitted for review.',
        variant: 'success',
      })
    } catch (err) {
      // PENDING_EDIT_EXISTS: a change is already in review (cannot stack a second).
      if (err instanceof ApiError && err.code === 'PENDING_EDIT_EXISTS') {
        setAddError('A photo change is already in review. Wait for it to be reviewed before adding another.')
      } else {
        setAddError('We could not submit that photo. Please try again.')
      }
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove(photoId: string) {
    setRemovingId(photoId)
    try {
      await removePhoto.mutateAsync({ id: branch.id, photoId })
      toast({ message: 'Photo removed.', variant: 'success' })
    } catch (err) {
      // 409 PHOTO_NOT_REMOVABLE / 404 BRANCH_PHOTO_NOT_FOUND: stay calm, no crash.
      const code = err instanceof ApiError ? err.code : undefined
      const message =
        code === 'PHOTO_NOT_REMOVABLE'
          ? 'That photo cannot be removed right now.'
          : code === 'BRANCH_PHOTO_NOT_FOUND'
            ? 'That photo has already been removed.'
            : 'We could not remove that photo. Please try again.'
      toast({ message, variant: 'error' })
    } finally {
      setRemovingId(null)
    }
  }

  // Add affordance is busy while uploading or while the review-request is in flight.
  const addBusy = uploading || requestEdit.isPending

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
        {/* Logo + banner display row (unchanged: banner stays the F7 lane). */}
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
                {/* Banner is the F7 reviewed-edit lane, not the photo gallery (PR-3 §7).
                    Upload already works via the header Edit button above (live banner
                    FileUpload in BranchDetailsEditModal) - this is a plain empty state,
                    not a "coming soon" claim. */}
                <p className="text-[11px] font-medium text-muted-foreground" data-testid="banner-empty-state">
                  {isOwner ? 'No banner yet. Add one via Edit above.' : 'No banner yet.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Photo gallery: real per-photo state (approved live rows + in-review). */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Photos
            </p>
            {inReviewCount > 0 ? (
              <span
                data-testid="photos-in-review-counter"
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}
              >
                <Clock size={12} aria-hidden /> {inReviewCount} in review
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* APPROVED live photos (removable by the owner). */}
            {approvedPhotos.map((p) => {
              const isRemoving = removingId === p.id
              return (
                <figure
                  key={p.id}
                  data-testid="branch-photo"
                  className="group relative overflow-hidden rounded-[12px] border"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    opacity: isRemoving ? 0.5 : 1,
                  }}
                >
                  <div className="relative aspect-square w-full" style={{ background: 'var(--page)' }}>
                    <Image src={p.url} alt="" fill sizes="160px" className="object-cover" unoptimized />
                  </div>
                  {isOwner ? (
                    <button
                      type="button"
                      data-testid="branch-photo-remove"
                      onClick={() => handleRemove(p.id)}
                      disabled={isRemoving}
                      aria-label="Remove photo"
                      title="Remove photo"
                      className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-full text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ background: 'rgba(1, 12, 53, 0.72)' }}
                    >
                      <X size={13} aria-hidden />
                    </button>
                  ) : null}
                  <figcaption
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--success)' }}
                  >
                    <CheckCircle2 size={11} aria-hidden /> Approved
                  </figcaption>
                </figure>
              )
            })}

            {/* IN-REVIEW thumbnails (from the open pending edit's add URLs; no remove). */}
            {inReviewUrls.map((url) => (
              <figure
                key={`review-${url}`}
                data-testid="branch-photo-in-review"
                className="relative overflow-hidden rounded-[12px] border"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="relative aspect-square w-full" style={{ background: 'var(--page)' }}>
                  <Image src={url} alt="" fill sizes="160px" className="object-cover opacity-80" unoptimized />
                </div>
                <figcaption
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--warning)' }}
                >
                  <Clock size={11} aria-hidden /> In review
                </figcaption>
              </figure>
            ))}

            {/* Add photo: D-BM1 flip - OWNER or assigned BM (effectiveCanManage). */}
            {canManage ? (
              <button
                type="button"
                data-testid="branch-photo-add"
                onClick={openFilePicker}
                disabled={addBusy || hasPendingPhotoEdit}
                title={
                  hasPendingPhotoEdit
                    ? 'A photo change is already in review'
                    : 'Add a photo for review'
                }
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[12px] border border-dashed text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}
              >
                {addBusy ? (
                  <span>Uploading...</span>
                ) : (
                  <>
                    <Plus size={18} aria-hidden />
                    <span>Add photo</span>
                  </>
                )}
              </button>
            ) : null}

            {/* The native file input the Add button triggers (same D-BM1 gate). */}
            {canManage ? (
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                aria-label="Add branch photo"
                className="sr-only"
                onChange={handleFileChange}
              />
            ) : null}
          </div>

          {addError ? (
            <p
              role="alert"
              data-testid="branch-photo-add-error"
              className="text-xs font-medium"
              style={{ color: 'var(--destructive)' }}
            >
              {addError}
            </p>
          ) : null}

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
