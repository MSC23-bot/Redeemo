'use client'

// Branches PR-7 (§6 / §8): the Redemption alerts card (prototype 04). The PR-1 disabled
// locked affordance is now a LIVE single per-branch on/off switch that reads
// branch.redemptionAlertsEnabled and writes it via PATCH /branches/:id/redemption-alerts
// (useSetRedemptionAlerts). When ON, an in-store validation surfaces an IN-APP bell
// (the notification bell in the topbar) to the team; email is dark / coming later.
//
// Recipient list: a read-only "who is alerted" list (active owner(s) + the branch's
// scope-covering Branch Managers) sourced from the EXISTING owner-gated useStaff query
// (no new field plumbing). It mirrors the backend fan-out (mini-spec §6c). STAFF and
// app users are NOT recipients and are excluded. Per-recipient on/off toggles and the
// "Add an extra recipient" email field are DEFERRED (a later email-enabled slice).
//
// Gate: `isOwner` (UX gate only, the same fallback PR-6's LocationCard used). merchant-web
// has no per-branch BRANCH_MANAGER `canManage` signal today, so an assigned Branch Manager
// does not see the control here; the backend assertCanManageBranch is the real boundary.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { Bell } from '@/lib/icons'
import { useSetRedemptionAlerts } from '@/lib/branches/useBranches'
import { useStaff } from '@/lib/staff/useStaff'
import type { Branch } from '@/lib/api/branch'
import type { MemberRow } from '@/lib/api/staff'
import { ROLE_LABEL } from '@/lib/staff/display'

interface RecipientRow {
  key: string
  name: string
  roleLabel: string
}

// The bell recipients (mini-spec §6c): active (status ACTIVE) OWNERs on any branch,
// plus BRANCH_MANAGERs whose scope covers THIS branch (allBranches OR branchIds
// includes the branch id). STAFF + app users are not recipients. Mirrors the backend
// fan-out so the read-only list matches who actually gets the alert.
function recipientsForBranch(members: MemberRow[], branchId: string): RecipientRow[] {
  return members
    .filter((m) => m.status === 'ACTIVE')
    .filter(
      (m) =>
        m.role === 'OWNER' ||
        (m.role === 'BRANCH_MANAGER' && (m.allBranches || m.branchIds.includes(branchId))),
    )
    .map((m) => ({ key: m.id, name: m.name, roleLabel: ROLE_LABEL[m.role] }))
}

export function RedemptionAlertsCard({ branch, isOwner }: { branch: Branch; isOwner: boolean }) {
  const { toast } = useToast()
  const set = useSetRedemptionAlerts(branch.id)

  // The persisted value (nullish on a pre-PR-7 payload -> treat as off).
  const persisted = branch.redemptionAlertsEnabled === true
  // Optimistic local view of the switch while a write is in flight. Cleared on
  // settle so the switch tracks the freshly-invalidated branch value.
  const [optimistic, setOptimistic] = React.useState<boolean | null>(null)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const checked = optimistic ?? persisted

  // The recipient list is owner-only data (useStaff 403s for a non-owner) and the
  // toggle is owner-gated, so only fetch when this is the owner branch.
  const members = useStaff(isOwner)
  const recipients = isOwner
    ? recipientsForBranch((members.data as MemberRow[] | undefined) ?? [], branch.id)
    : []

  async function handleToggle(next: boolean) {
    setActionError(null)
    setOptimistic(next)
    try {
      await set.mutateAsync(next)
      toast({
        message: next ? 'Redemption alerts are on.' : 'Redemption alerts are off.',
        variant: 'success',
      })
    } catch {
      // Revert to the persisted value and explain calmly.
      setActionError('We could not update redemption alerts. Please try again.')
    } finally {
      setOptimistic(null)
    }
  }

  return (
    <Card className="gap-4" data-testid="branch-alerts-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6">
        <div className="flex items-center gap-2">
          <Bell size={16} aria-hidden style={{ color: 'var(--text-tertiary)' }} />
          <h2 className="font-display text-lg font-semibold text-foreground">Redemption alerts</h2>
        </div>
        {isOwner ? (
          <Switch
            checked={checked}
            disabled={set.isPending}
            onCheckedChange={handleToggle}
            label="Redemption alerts for this branch"
            id="branch-redemption-alerts-toggle"
          />
        ) : null}
      </div>

      <div className="space-y-4 px-6">
        <p className="text-sm text-muted-foreground">
          When this is on, your team is alerted in the portal (the notification bell) every time a
          voucher is validated in store here, so you can keep an eye on activity. Email alerts are
          coming later.
        </p>

        <p className="text-sm text-muted-foreground">
          The alert shows the voucher, the branch, and the validation time. It never shows the
          customer personal details.
        </p>

        {actionError ? (
          <p
            role="alert"
            className="rounded-[10px] border px-3 py-2 text-sm font-medium"
            style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
          >
            {actionError}
          </p>
        ) : null}

        {/* Read-only "who is alerted" list. Owner-only data (useStaff). The active
            owner(s) + the branch's scope-covering Branch Managers; STAFF + app users
            are not recipients. NOT a per-recipient control: there are no per-person
            on/off toggles and no add-recipient field (deferred). */}
        {isOwner && checked ? (
          <div className="space-y-2" data-testid="branch-alerts-recipients">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Who is alerted
            </p>
            {members.isLoading ? (
              <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                Loading the team for this branch...
              </p>
            ) : recipients.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No owners or branch managers cover this branch yet. Assign someone on the Staff page.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {recipients.map((r) => (
                  <li
                    key={r.key}
                    data-testid="branch-alerts-recipient-row"
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <span
                      aria-hidden
                      className="inline-block size-1.5 rounded-full"
                      style={{ background: 'var(--rose)' }}
                    />
                    <span className="font-medium">{r.name}</span>
                    <span className="text-muted-foreground">· {r.roleLabel}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </Card>
  )
}
