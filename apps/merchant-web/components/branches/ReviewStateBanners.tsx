'use client'

// Branches PR-1 F3: the review-state banners that surface on a branch detail page
// when something is mid-review (prototype 07). Two independent banners:
//   - Photos awaiting review : driven by pendingEdits[] entries with
//     includesPhotos === true (the PENDING-only rows shipped on the branch payload).
//     The count is the number of in-review photo edits.
//   - Awaiting location check : driven by locationConfidence !== MANUALLY_CONFIRMED.
//
// An approved + confirmed branch (no photo edits in review, location manually
// confirmed) shows NEITHER banner. Copy is taken verbatim from screenshot 07.
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import { Clock, Info } from '@/lib/icons'
import type { Branch } from '@/lib/api/branch'

export function ReviewStateBanners({ branch }: { branch: Branch }) {
  const photosInReview = (branch.pendingEdits ?? []).filter((e) => e.includesPhotos).length
  const awaitingLocation = branch.locationConfidence !== 'MANUALLY_CONFIRMED'

  if (photosInReview === 0 && !awaitingLocation) return null

  return (
    <div className="space-y-3">
      {photosInReview > 0 ? (
        <div
          data-testid="banner-photos-review"
          role="status"
          className="flex items-start gap-3 rounded-[14px] p-4"
          style={{ background: 'var(--tint)', border: '1px solid var(--border-subtle)' }}
        >
          <Clock size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--rose)' }} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Photos awaiting review</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Redeemo is reviewing the changes below. Your current photos stay live for customers until
              each is approved. {photosInReview} {photosInReview === 1 ? 'photo' : 'photos'} in review.
            </p>
          </div>
        </div>
      ) : null}

      {awaitingLocation ? (
        <div
          data-testid="banner-awaiting-location"
          role="status"
          className="flex items-start gap-3 rounded-[14px] p-4"
          style={{ background: 'var(--warning-bg)', border: '1px solid #F4D9A8' }}
        >
          <Info size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Awaiting location check</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              We are checking the exact spot from the address. The pin may be approximate until confirmed.
              Nothing for you to do.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
