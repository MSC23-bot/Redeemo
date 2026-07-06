'use client'

// Business Profile M2: a calm read-only "awaiting review" banner shown whenever the
// merchant has a PENDING MerchantPendingEdit row (profile.pendingEdits). M2 ships NO
// withdraw control here (that lands with the M3/M4 edit lane, mirroring how
// Branches' PendingEditsList pairs a banner with a Withdraw action) - this is
// surfacing only.
import { Clock } from '@/lib/icons'
import type { MerchantProfile } from '@/lib/api/profile'

export function PendingEditBanner({ profile }: { profile: MerchantProfile }) {
  const hasPending = (profile.pendingEdits ?? []).some((e) => e.status === 'PENDING')
  if (!hasPending) return null

  return (
    <div
      data-testid="business-profile-pending-edit-banner"
      className="flex items-start gap-3 rounded-[14px] p-4"
      style={{ background: 'var(--tint)', border: '1px solid var(--border-subtle)' }}
    >
      <Clock size={16} aria-hidden style={{ color: 'var(--text-tertiary)', marginTop: 2 }} />
      <p className="text-sm text-foreground">You have a change awaiting Redeemo review.</p>
    </div>
  )
}
