'use client'

/**
 * StaffTab: the merchant's staff roster (spec merchant-360-spec.md, Tab 9; D44).
 *
 * Read-only v1 (Merchant 360 A4). Renders the A4 staff read: portal `members`
 * (role / status / branch scope / voucher-management) and branch `appLogins`
 * (mobile scan-and-validate logins). Staff MUTATIONS on behalf (invite, role
 * change, remove) are NOT built here: they arrive with the assisted-onboarding
 * wizard (Phase C) and the OD4 capability decision, so an honest footer says so.
 *
 * Redaction is enforced by the backend read (no passwordHash, no branch PIN, no
 * tokens); this surface only ever renders name / email / role / status / scope.
 * View is gated by the page (merchant:read); the backend requireAdminCapability
 * stays the enforcement.
 */
import { Loader2, AlertCircle, Users, Smartphone } from 'lucide-react'
import { useAdminStaff } from '@/lib/staff/useAdminStaff'
import { Badge } from '@/features/shared/Badge'
import type { BadgeTone } from '@/features/shared/Badge'
import type { StaffMember, StaffAppLogin } from '@/lib/api/staff'

function roleBadge(role: string): { label: string; tone: BadgeTone } {
  switch (role) {
    case 'OWNER':
      return { label: 'Owner', tone: 'info' }
    case 'BRANCH_MANAGER':
      return { label: 'Branch manager', tone: 'neutral' }
    case 'STAFF':
      return { label: 'Staff', tone: 'neutral' }
    default: {
      const words = role.toLowerCase().replace(/_/g, ' ')
      return { label: words.charAt(0).toUpperCase() + words.slice(1), tone: 'neutral' }
    }
  }
}

function statusBadge(status: string): { label: string; tone: BadgeTone } {
  switch (status) {
    case 'ACTIVE':
      return { label: 'Active', tone: 'success' }
    case 'SUSPENDED':
      return { label: 'Suspended', tone: 'danger' }
    case 'INACTIVE':
      return { label: 'Inactive', tone: 'neutral' }
    case 'DELETED':
      return { label: 'Removed', tone: 'neutral' }
    default: {
      const words = status.toLowerCase().replace(/_/g, ' ')
      return { label: words.charAt(0).toUpperCase() + words.slice(1), tone: 'neutral' }
    }
  }
}

function scopeLabel(m: StaffMember): string {
  if (m.allBranches) return 'All branches'
  if (m.branchScopes.length === 0) return 'No branch scope'
  return m.branchScopes.map((b) => b.name).join(', ')
}

function MemberRow({ m }: { m: StaffMember }) {
  const role = roleBadge(m.role)
  const status = statusBadge(m.status)
  return (
    <li data-testid={`staff-member-${m.id}`} className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{m.name || 'Unnamed member'}</p>
          <p className="mt-0.5 break-all text-sm text-muted-foreground">{m.email}</p>
          <p className="mt-1 text-xs text-muted-foreground" data-testid={`staff-member-scope-${m.id}`}>
            Scope: {scopeLabel(m)}
            {m.canManageVouchers ? ' · Can manage vouchers' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={role.tone}>{role.label}</Badge>
          <Badge tone={status.tone}>{status.label}</Badge>
          {m.emailVerified && <Badge tone="success">Verified email</Badge>}
        </div>
      </div>
    </li>
  )
}

function AppLoginRow({ u }: { u: StaffAppLogin }) {
  const status = statusBadge(u.status)
  return (
    <li data-testid={`staff-applogin-${u.id}`} className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{u.name || 'Unnamed login'}</p>
          <p className="mt-0.5 break-all text-sm text-muted-foreground">{u.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">Branch: {u.branch.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="info">App access</Badge>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </div>
    </li>
  )
}

interface StaffTabProps {
  merchantId: string
}

export function StaffTab({ merchantId }: StaffTabProps) {
  const { data, isLoading, isError, refetch } = useAdminStaff(merchantId, { enabled: true })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="workspace-staff-loading">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
        <AlertCircle className="mx-auto mb-3 size-6 text-destructive" aria-hidden="true" />
        <p className="mb-4 text-sm text-destructive">
          Could not load this merchant&apos;s staff. Check your connection and try again.
        </p>
        <button type="button" onClick={refetch} className="text-sm font-medium text-primary hover:underline">
          Retry
        </button>
      </div>
    )
  }

  const { members, appLogins } = data

  return (
    <div className="space-y-6" data-testid="workspace-staff">
      <h2 className="text-sm font-semibold text-foreground">Staff and access</h2>

      {/* Portal members */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Users className="size-4" aria-hidden="true" />
          Portal members ({members.length})
        </h3>
        {members.length === 0 ? (
          <div
            className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center"
            data-testid="staff-members-empty"
          >
            <p className="text-sm text-muted-foreground">No portal members yet.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {members.map((m) => (
              <MemberRow key={m.id} m={m} />
            ))}
          </ul>
        )}
      </section>

      {/* Branch app logins */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Smartphone className="size-4" aria-hidden="true" />
          Branch app logins ({appLogins.length})
        </h3>
        {appLogins.length === 0 ? (
          <div
            className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center"
            data-testid="staff-applogins-empty"
          >
            <p className="text-sm text-muted-foreground">
              No branch app logins yet. Branch staff scan-and-validate logins are a separate identity from
              portal members.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {appLogins.map((u) => (
              <AppLoginRow key={u.id} u={u} />
            ))}
          </ul>
        )}
      </section>

      {/* Honest footer: read-only for now; mutations arrive with assisted onboarding. */}
      <p
        className="rounded-md border border-border bg-secondary/30 px-4 py-3 text-xs text-muted-foreground"
        data-testid="staff-readonly-note"
      >
        This roster is read-only. Managing staff on the merchant&apos;s behalf (invite, change role or
        scope, remove, re-issue access links) arrives with the assisted-onboarding work; the branch
        redemption PIN and passwords are never shown here, and operators never set or see a password.
      </p>
    </div>
  )
}
