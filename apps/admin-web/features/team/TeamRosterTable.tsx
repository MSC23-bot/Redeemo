'use client'

/**
 * TeamRosterTable — the Team & Roles roster (S2).
 *
 * Columns: Admin (name + email) | Role | Status | Active grants | Created |
 * Actions. Per-row actions (Change role / Grant / Revoke / Deactivate) render
 * only when `canManage` is true (the parent passes `can('admin:manage-team')`)
 * — a read-blocked admin never reaches this page at all (page-level gate), but
 * this mirrors the MerchantsTable convention of a capability-gated actions
 * column regardless. Deactivate is always disabled on the signed-in admin's
 * own row, with a visible reason (never merely a silent no-op).
 */
import { Badge } from '@/features/shared/Badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { roleLabel, capabilityLabel } from './labels'
import type { TeamAdmin } from '@/lib/api/team'
import type { BadgeTone } from '@/features/shared/Badge'

function formatCreated(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function roleTone(role: string): BadgeTone {
  if (role === 'SUPER_ADMIN') return 'violet'
  if (role === 'FIELD') return 'cyan'
  return 'neutral'
}

function AdminAvatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
    >
      {initials || '?'}
    </span>
  )
}

interface ActionCellProps {
  admin: TeamAdmin
  canManage: boolean
  isSelf: boolean
  onChangeRole: (admin: TeamAdmin) => void
  onGrant: (admin: TeamAdmin) => void
  onRevoke: (admin: TeamAdmin) => void
  onDeactivate: (admin: TeamAdmin) => void
}

function ActionCell({ admin, canManage, isSelf, onChangeRole, onGrant, onRevoke, onDeactivate }: ActionCellProps) {
  if (!canManage) {
    return <span className="text-sm text-muted-foreground">-</span>
  }
  const hasApprovalGrant = admin.activeGrants.includes('approval:action')

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChangeRole(admin)}
        data-testid={`team-change-role-${admin.id}`}
      >
        Change role
      </Button>
      {hasApprovalGrant ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onRevoke(admin)}
          data-testid={`team-revoke-approval-${admin.id}`}
        >
          Revoke approve
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onGrant(admin)}
          data-testid={`team-grant-approval-${admin.id}`}
        >
          Grant approve
        </Button>
      )}
      {admin.isActive ? (
        <span title={isSelf ? 'You cannot deactivate your own account.' : undefined}>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isSelf}
            onClick={() => onDeactivate(admin)}
            data-testid={`team-deactivate-${admin.id}`}
          >
            Deactivate
          </Button>
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">-</span>
      )}
    </div>
  )
}

interface TeamRosterTableProps {
  items: TeamAdmin[]
  canManage: boolean
  currentAdminId: string | null
  onChangeRole: (admin: TeamAdmin) => void
  onGrant: (admin: TeamAdmin) => void
  onRevoke: (admin: TeamAdmin) => void
  onDeactivate: (admin: TeamAdmin) => void
}

export function TeamRosterTable({
  items,
  canManage,
  currentAdminId,
  onChangeRole,
  onGrant,
  onRevoke,
  onDeactivate,
}: TeamRosterTableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">No admin accounts yet.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/40">
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Admin
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Role
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Status
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Active grants
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Created
            </th>
            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const isSelf = currentAdminId != null && item.id === currentAdminId
            return (
              <tr
                key={item.id}
                data-testid={`team-row-${item.id}`}
                className={cn(
                  'border-b border-border last:border-0',
                  idx % 2 === 0 ? 'bg-card' : 'bg-secondary/10'
                )}
              >
                {/* Admin */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <AdminAvatar name={item.name} />
                    <div>
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        {item.name}
                        {isSelf && (
                          <span
                            className="rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary-foreground"
                            data-testid={`team-you-badge-${item.id}`}
                          >
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{item.email}</div>
                    </div>
                  </div>
                </td>

                {/* Role */}
                <td className="px-4 py-3">
                  <Badge tone={roleTone(item.role)}>{roleLabel(item.role)}</Badge>
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <Badge tone={item.isActive ? 'success' : 'danger'}>
                    {item.isActive ? 'Active' : 'Deactivated'}
                  </Badge>
                </td>

                {/* Active grants */}
                <td className="px-4 py-3">
                  {item.activeGrants.length === 0 ? (
                    <span className="text-sm text-muted-foreground">None</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {item.activeGrants.map((cap) => (
                        <Badge key={cap} tone="info">
                          {capabilityLabel(cap)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </td>

                {/* Created */}
                <td className="px-4 py-3 text-muted-foreground">{formatCreated(item.createdAt)}</td>

                {/* Actions */}
                <td className="px-4 py-3 text-right">
                  <ActionCell
                    admin={item}
                    canManage={canManage}
                    isSelf={isSelf}
                    onChangeRole={onChangeRole}
                    onGrant={onGrant}
                    onRevoke={onRevoke}
                    onDeactivate={onDeactivate}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
