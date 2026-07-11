/**
 * SelfApprovedFilter — History-court toggle that narrows the visible rows to
 * self-approved-only (Team & Roles S4, spec
 * 2026-07-10-admin-capability-grants-field-role.md §5.3, flag 4 resolved by
 * owner lock 2026-07-10).
 *
 * SUPER_ADMIN-ONLY. This is deliberately a ROLE check, not a capability gate:
 * the "Self-approved" BADGE (features/shared/SelfApprovedBadge.tsx) is
 * ungated transparency visible to everyone who can see the row, but this
 * NARROWING control is the oversight surface reserved for the role that
 * manages the team and grants `approval:action` in the first place — the
 * same `role === 'SUPER_ADMIN'` pattern already used for the force-release
 * affordance in features/review/ActionBar.tsx. Two-layer note: this is a VIEW
 * control over an already-fetched, already-authorised page (queue History is
 * gated on `approval:read`), not a new write/read capability, so there is no
 * paired backend capability gate to add here — the backend field it filters
 * on (`selfOnboarded`) is already visible to any approval:read holder (the
 * badge), and hiding the FILTER for non-SUPER_ADMIN is UI-only by design.
 */
import { cn } from '@/lib/utils'

interface SelfApprovedFilterProps {
  active: boolean
  onChange: (active: boolean) => void
}

export function SelfApprovedFilter({ active, onChange }: SelfApprovedFilterProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      data-testid="self-approved-filter"
      onClick={() => onChange(!active)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground'
      )}
    >
      Self-approved only
    </button>
  )
}
