'use client'

// Business Profile M2: a calm read-only "awaiting review" banner shown whenever the
// merchant has a PENDING MerchantPendingEdit row (profile.pendingEdits). M2 shipped
// NO withdraw control here (that lands with the M3/M4 edit lane, mirroring how
// Branches' PendingEditsList pairs a banner with a Withdraw action) - this is
// surfacing only.
//
// Fidelity polish (2026-07-07 audit): the banner used to show only generic copy
// ("You have a change awaiting Redeemo review.") with no detail. It now diffs the
// edit's proposedChanges against the CURRENT profile (computePendingEditDiff) and
// renders one "<Field label>: <old> -> <new>" row per changed field, plus the
// submission date (mirrors the Branches PendingEditsList treatment). Image fields
// (logoUrl/bannerUrl) never print the raw URL - they get a friendly
// "<Field> image (change pending)" row instead.
import { Clock, ArrowRight } from '@/lib/icons'
import { formatDateLabel } from '@/lib/business-profile/format'
import { computePendingEditDiff } from '@/lib/pendingEditDiff'
import type { MerchantProfile } from '@/lib/api/profile'

// The SENSITIVE_FIELDS this banner knows how to label + diff (mirrors the backend
// allow-list PublicIdentityEditModal submits from).
const FIELD_LABELS: Record<string, string> = {
  businessName: 'Registered business name',
  tradingName: 'Trading name',
  description: 'Description',
  logoUrl: 'Logo image',
  bannerUrl: 'Banner image',
}
const IMAGE_FIELDS = new Set(['logoUrl', 'bannerUrl'])

export function PendingEditBanner({ profile }: { profile: MerchantProfile }) {
  const edit = (profile.pendingEdits ?? []).find((e) => e.status === 'PENDING')
  if (!edit) return null

  const rows = computePendingEditDiff(edit.proposedChanges, profile, FIELD_LABELS, IMAGE_FIELDS)
  const submittedOn = formatDateLabel(edit.createdAt)
  // Mirrors the prototype's "<Field> awaiting review" heading tone: name the single
  // changed field when there is exactly one, otherwise a calm generic heading.
  const heading = rows.length === 1 ? `${rows[0].label} awaiting review` : 'Business details awaiting review'

  return (
    <div
      data-testid="business-profile-pending-edit-banner"
      className="rounded-[14px] p-4"
      style={{ background: 'var(--tint)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-start gap-3">
        <Clock size={16} aria-hidden style={{ color: 'var(--text-tertiary)', marginTop: 2 }} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{heading}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            You have a change awaiting Redeemo review. Your current details stay live for customers until it
            is approved.
            {submittedOn ? ` Submitted ${submittedOn}.` : null}
          </p>
        </div>
      </div>

      {rows.length > 0 ? (
        <dl className="mt-3 space-y-1.5 pl-[30px]" data-testid="business-profile-pending-edit-diff">
          {rows.map((row) => (
            <div key={row.field} className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
              <dt className="font-medium text-foreground">{row.label}:</dt>
              {row.isImage ? (
                <dd className="text-muted-foreground">{row.label} (change pending)</dd>
              ) : (
                <dd className="flex flex-wrap items-baseline gap-x-1.5 text-muted-foreground">
                  <span className="line-through">{row.oldDisplay}</span>
                  <ArrowRight size={13} aria-hidden className="shrink-0" />
                  <span className="font-semibold text-foreground">{row.newDisplay}</span>
                </dd>
              )}
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}
