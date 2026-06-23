'use client'

// Branches PR-1 F12: the owner-only "Staff at this branch" card (prototype 05/06/09).
// It merges the two owner-gated staff feeds (portal members via useStaff + app users
// via useBranchAppUsers), filters both to THIS branch, and renders a person card per
// row with a colour-coded role chip + an access pill using the EXACT umbrella-spec
// labels ("Portal + app" for a portal member, "App access" for an app-only
// BranchUser). DISPLAY-ONLY: no staff WRITE in PR-1; the only action is a cross-link
// to the existing Staff & Access surface.
//
// Owner-only: the whole panel renders ONLY when isOwner (the staff queries 403 for a
// non-owner). It also stays hidden until `ready` so there is no premature flash.
//
// SECURITY (plan §6 #9): the curated staff payloads carry no passwordHash / PIN /
// phone; this card renders only name / role / access / status and never any secret.
// The portal<->app email correlation is DISPLAY-ONLY and never merges identities.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import { useRouter } from 'next/navigation'
import { useStaff, useBranchAppUsers } from '@/lib/staff/useStaff'
import type { MemberRow, AppUsersList } from '@/lib/api/staff'
import { ROLE_LABEL, memberStatusLabel } from '@/lib/staff/display'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BranchRoleChip, AccessPill } from '@/components/branches/StaffPills'
import { Users, ArrowRight } from '@/lib/icons'

// The two access-pill label strings are the locked umbrella-spec copy. They are
// LITERAL strings (not derived) so a fidelity test can pin them.
const PORTAL_ACCESS_LABEL = 'Portal + app'
const APP_ACCESS_LABEL = 'App access'

interface StaffAtBranchRow {
  key: string
  name: string
  roleLabel: string
  roleTone: 'OWNER' | 'BRANCH_MANAGER' | 'STAFF' | 'app'
  accessLabel: string
  /** "Invite pending" / "Deactivated" / null. Display only. */
  statusLabel: string | null
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Portal members assigned to this branch: allBranches OR branchIds includes id.
function portalRowsForBranch(members: MemberRow[], branchId: string): StaffAtBranchRow[] {
  return members
    .filter((m) => m.allBranches || m.branchIds.includes(branchId))
    .map((m) => {
      const status = memberStatusLabel(m.status, m.claimed)
      return {
        key: `portal:${m.id}`,
        name: m.name,
        roleLabel: ROLE_LABEL[m.role],
        roleTone: m.role,
        accessLabel: PORTAL_ACCESS_LABEL,
        statusLabel: status === 'Active' ? null : status,
      }
    })
}

// App users (BranchUsers) assigned to this branch: the matching branches group.
function appRowsForBranch(data: AppUsersList | undefined, branchId: string): StaffAtBranchRow[] {
  if (!data) return []
  const out: StaffAtBranchRow[] = []
  for (const group of data.branches) {
    if (group.branchId !== branchId) continue
    for (const u of group.users) {
      out.push({
        key: `app:${u.id}`,
        name: `${u.firstName} ${u.lastName}`.trim(),
        roleLabel: u.jobTitle?.trim() || 'App user',
        roleTone: 'app',
        accessLabel: APP_ACCESS_LABEL,
        statusLabel: u.status === 'INACTIVE' ? 'Deactivated' : null,
      })
    }
  }
  return out
}

export function StaffAtBranchCard({
  branchId,
  isOwner,
  ready,
}: {
  branchId: string
  isOwner: boolean
  ready: boolean
}) {
  const router = useRouter()
  // These queries are owner-gated server-side; only fetch when we believe the
  // caller is the owner. A non-owner never reaches here (the panel does not render).
  const enabled = ready && isOwner
  const members = useStaff(enabled)
  const appUsers = useBranchAppUsers(enabled)

  // The whole panel is owner-only. Hidden for a non-owner and until the gate settles.
  if (!ready || !isOwner) return null

  const rows: StaffAtBranchRow[] = [
    ...portalRowsForBranch((members.data as MemberRow[] | undefined) ?? [], branchId),
    ...appRowsForBranch(appUsers.data as AppUsersList | undefined, branchId),
  ]

  const loading = members.isLoading || appUsers.isLoading

  return (
    <Card className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6">
        <div className="flex items-center gap-2">
          <Users size={16} aria-hidden style={{ color: 'var(--text-tertiary)' }} />
          <h2 className="font-display text-lg font-semibold text-foreground">Staff at this branch</h2>
          {rows.length > 0 ? <Badge variant="neutral">{rows.length}</Badge> : null}
        </div>
        <button
          type="button"
          onClick={() => router.push('/staff')}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6B7390] hover:text-[#010C35]"
        >
          <ArrowRight size={15} aria-hidden /> Assign or manage staff
        </button>
      </div>

      {loading ? (
        <div role="status" aria-live="polite" className="px-6 text-sm text-muted-foreground">
          Loading the team at this branch...
        </div>
      ) : rows.length === 0 ? (
        <div className="px-6 text-sm text-muted-foreground">
          No one is assigned to this branch yet. Use Assign or manage staff to add a portal member or
          app user.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 px-6 sm:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.key}
              data-testid="staff-at-branch-row"
              className="flex items-start gap-3 rounded-[14px] p-3"
              style={{ background: 'var(--cream)', border: '1px solid var(--border-subtle)' }}
            >
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: 'var(--tint-deep)', color: 'var(--rose)' }}
              >
                {initials(row.name)}
              </span>
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate font-semibold text-foreground">{row.name}</span>
                  {row.statusLabel ? (
                    <Badge variant={row.statusLabel === 'Deactivated' ? 'restrictive' : 'caution'}>
                      {row.statusLabel}
                    </Badge>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <BranchRoleChip tone={row.roleTone} label={row.roleLabel} />
                  <AccessPill label={row.accessLabel} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
