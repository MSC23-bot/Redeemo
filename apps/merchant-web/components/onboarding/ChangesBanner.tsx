// M2 F1 (D8c): the changes-requested banner shown ONLY in the `changes`
// (NEEDS_CHANGES) lifecycle state. The reason is DYNAMIC, sourced from
// AdminApproval.comment via GET /onboarding/status. We do NOT hardcode the
// prototype's 3 demo reason items. When the comment is empty/placeholder we show
// a calm generic fallback that does NOT imply specifics (the admin may have left
// no detail; we must not invent any).
//
// The "Manage your documents" link ALWAYS shows (not keyword-triggered off the
// comment text): a change request may implicate documents (e.g. proof of
// address) even when the admin's note does not name them explicitly.

import Link from 'next/link'

const GENERIC_FALLBACK =
  'Our team reviewed your business and asked for a few changes before you go live. Update the relevant steps below and resubmit.'

export function ChangesBanner({ comment }: { comment: string | null }) {
  const reason = comment && comment.trim().length > 0 ? comment.trim() : GENERIC_FALLBACK

  return (
    <div
      role="status"
      className="mb-6 rounded-[16px] p-5"
      style={{ background: '#FEF6EC', border: '1px solid #F3D8AE' }}
    >
      <div className="flex items-start gap-3">
        <svg
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#B45309"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        >
          <path d="M12 8.5v4.5M12 16.6h.01M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
        </svg>
        <div className="flex-1">
          <div className="text-base font-bold" style={{ color: '#92400E' }}>
            A few changes are needed before you go live
          </div>
          <p className="mt-1 max-w-[72ch] text-sm leading-relaxed" style={{ color: '#9a6418' }}>
            {reason}
          </p>
          <p className="mt-3 text-[13px]" style={{ color: '#9a6418' }}>
            Sort these and resubmit. It usually takes us under two working days to take another look.
          </p>
          <Link
            href="/profile"
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold underline underline-offset-2"
            style={{ color: '#92400E' }}
          >
            Manage your documents
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#92400E"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  )
}
