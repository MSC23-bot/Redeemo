'use client'

// Branches PR-1 F12: the shared staff pill primitives. AccessPill + RoleChip were
// previously defined privately inside components/staff/StaffTable.tsx; they are
// extracted here VERBATIM (same markup + same brand-token styles) so both the
// Staff & Access table and the branch-detail "Staff at this branch" card share one
// definition. StaffTable now imports AccessPill + RoleChip from here; its rendered
// output is byte-identical to before.
//
// BranchRoleChip is the NEW colour-coded role chip the prototype branch-detail
// staff cards use (screenshots 05/06/09): OWNER=rose, BRANCH_MANAGER=navy,
// STAFF=teal. It is additive (it does NOT change StaffTable, which keeps the plain
// single-tone RoleChip on its own surface). House style: brand tokens, no
// em-dashes, SVG icons not emojis.
import type { MemberRole } from '@/lib/api/staff'

// Plain access pill (verbatim from StaffTable). The label text is supplied by the
// caller, so the branch-detail card passes the longer approved copy ("Portal + app"
// / "App access") while the Staff table passes the shorter "Portal" / "App".
export function AccessPill({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
      style={{ background: 'var(--subtle)', color: 'var(--text-tertiary)' }}
    >
      {label}
    </span>
  )
}

// Plain single-tone role chip (verbatim from StaffTable: tint background, navy text).
export function RoleChip({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: 'var(--tint)', color: 'var(--navy)' }}
    >
      {label}
    </span>
  )
}

// Colour-coded role chip for the branch-detail staff cards (F12). The colour
// encodes the role at a glance per the prototype: OWNER rose, BRANCH_MANAGER navy,
// STAFF teal. App-only BranchUsers are not portal roles, so they pass tone='app'.
type RoleTone = MemberRole | 'app'

const ROLE_TONE: Record<RoleTone, { bg: string; fg: string }> = {
  OWNER: { bg: 'var(--tint-deep)', fg: 'var(--rose)' },
  BRANCH_MANAGER: { bg: 'var(--tint)', fg: 'var(--navy)' },
  STAFF: { bg: 'rgba(13, 148, 136, 0.12)', fg: 'var(--vt-reusable)' },
  app: { bg: 'rgba(13, 148, 136, 0.12)', fg: 'var(--vt-reusable)' },
}

export function BranchRoleChip({ tone, label }: { tone: RoleTone; label: string }) {
  const c = ROLE_TONE[tone]
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: c.bg, color: c.fg }}
    >
      {label}
    </span>
  )
}
