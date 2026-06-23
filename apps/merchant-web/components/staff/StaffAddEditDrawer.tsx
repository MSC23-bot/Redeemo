'use client'

/**
 * Staff & Access (v1) PR-C C4: the Add / Edit staff member drawer.
 *
 * D7 reconciliation (locked): in v1 this drawer creates / edits a PORTAL member
 * only (MerchantAdmin + MerchantMembership). It NEVER creates or toggles a
 * BranchUser. So:
 *   - Portal access is the active path (the drawer provisions portal access).
 *   - App access is DISPLAY-ONLY / DISABLED with informational copy; app-user
 *     lifecycle (reset password / deactivate / reactivate) lives on the App users
 *     row actions (C5), never here.
 *   - Submit fires ONLY the portal invite/update mutation.
 *
 * Fields: full name (first + last), email, job title; Portal role radios (Owner /
 * Branch manager / Staff) with Can / Cannot detail (ROLE_DETAIL); Extra
 * responsibilities (Manage vouchers = canManageVouchers, active, Branch-manager
 * only; Manage campaigns + Manage billing = disabled "coming soon"); Branches scope
 * (All / Specific, Specific gated on SPECIFIC_BRANCHES_ENABLED); Automated emails =
 * read-only informational (D9, no editable toggles). Title swaps "Add staff member"
 * / "Edit {name}".
 *
 * House style: brand tokens, no em-dashes, SVG icons not emojis.
 */
import * as React from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { CheckCircle2, X, Smartphone, Info } from '@/lib/icons'
import { ROLE_LABEL, ROLE_DETAIL } from '@/lib/staff/display'
import { SPECIFIC_BRANCHES_ENABLED } from '@/lib/staff/featureFlags'
import type { MemberRole, StaffInviteBody, StaffUpdateBody } from '@/lib/api/staff'
import type { PortalPerson } from './types'

export interface BranchOption {
  id: string
  name: string
}

export interface StaffDrawerSubmit {
  // For an edit, the portal mutation is updateStaff(memberId, body); for an add it
  // is inviteStaff(body). The page decides which based on `editing`.
  invite: StaffInviteBody
  update: StaffUpdateBody
}

const ROLES: MemberRole[] = ['OWNER', 'BRANCH_MANAGER', 'STAFF']

function RoleDetailList({ role }: { role: MemberRole }) {
  const detail = ROLE_DETAIL[role]
  return (
    <div className="space-y-2 rounded-[12px] p-3" style={{ background: 'var(--neutral)' }}>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--success)' }}>
          Can
        </p>
        <ul className="mt-1 space-y-1">
          {detail.can.map((line) => (
            <li key={line} className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              {line}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Cannot
        </p>
        <ul className="mt-1 space-y-1">
          {detail.cannot.map((line) => (
            <li key={line} className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

const sectionLabel = 'text-xs font-bold uppercase tracking-wide text-muted-foreground'

export function StaffAddEditDrawer({
  editing,
  branches,
  busy,
  errorMessage,
  onClose,
  onSubmit,
}: {
  /** The member being edited, or null for an Add. */
  editing: PortalPerson | null
  branches: BranchOption[]
  busy: boolean
  errorMessage: string | null
  onClose: () => void
  onSubmit: (payload: StaffDrawerSubmit) => void
}) {
  const isEdit = !!editing

  const [firstName, setFirstName] = React.useState(() => {
    if (!editing) return ''
    return editing.name.trim().split(/\s+/)[0] ?? ''
  })
  const [lastName, setLastName] = React.useState(() => {
    if (!editing) return ''
    const parts = editing.name.trim().split(/\s+/)
    return parts.slice(1).join(' ')
  })
  const [email, setEmail] = React.useState(editing?.email ?? '')
  const [jobTitle, setJobTitle] = React.useState('')
  const [role, setRole] = React.useState<MemberRole>(editing?.role ?? 'STAFF')
  const [canManageVouchers, setCanManageVouchers] = React.useState(editing?.canManageVouchers ?? false)
  const [allBranches, setAllBranches] = React.useState(editing?.allBranches ?? true)
  const [branchIds, setBranchIds] = React.useState<string[]>(editing?.branchIds ?? [])
  const [localError, setLocalError] = React.useState<string | null>(null)

  // Manage vouchers is a Branch-manager-only grant; clear it whenever the role is
  // not Branch manager (Owner has it implicitly, Staff can never receive it).
  const canGrantVouchers = role === 'BRANCH_MANAGER'
  React.useEffect(() => {
    if (!canGrantVouchers && canManageVouchers) setCanManageVouchers(false)
  }, [canGrantVouchers, canManageVouchers])

  function toggleBranch(id: string) {
    setBranchIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]))
  }

  function handleSubmit() {
    setLocalError(null)
    if (!isEdit) {
      if (!firstName.trim() || !lastName.trim()) {
        setLocalError('Enter the team member full name.')
        return
      }
      if (!email.trim()) {
        setLocalError('Enter an email so we can send their sign-in link.')
        return
      }
    }
    if (!allBranches && branchIds.length === 0) {
      setLocalError('Select at least one branch, or choose All branches.')
      return
    }
    const grant = canGrantVouchers && canManageVouchers
    const invite: StaffInviteBody = {
      email: email.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      jobTitle: jobTitle.trim() || undefined,
      role,
      allBranches,
      branchIds: allBranches ? undefined : branchIds,
      canManageVouchers: grant,
    }
    const update: StaffUpdateBody = {
      role,
      allBranches,
      branchIds: allBranches ? undefined : branchIds,
      canManageVouchers: grant,
    }
    onSubmit({ invite, update })
  }

  const shownError = localError ?? errorMessage

  return (
    <Dialog
      label={isEdit ? `Edit ${editing!.name}` : 'Add staff member'}
      onClose={onClose}
      panelTestId="staff-drawer"
      scrimTestId="staff-drawer-scrim"
    >
      <div className="max-h-[80vh] space-y-5 overflow-y-auto pr-1">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">
              {isEdit ? `Edit ${editing!.name}` : 'Add staff member'}
            </h2>
            <p className="text-sm text-muted-foreground">
              Portal access lets someone manage on the web. App access lets them validate at their
              branches.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-[var(--neutral)]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {shownError && (
          <div role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>
            {shownError}
          </div>
        )}

        {/* Identity */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="staff-first-name">First name</Label>
            <Input
              id="staff-first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={isEdit}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="staff-last-name">Last name</Label>
            <Input
              id="staff-last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={isEdit}
              autoComplete="off"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="staff-email">Email</Label>
          <Input
            id="staff-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isEdit}
            autoComplete="off"
          />
          {isEdit && (
            <p className="text-[12px] text-muted-foreground">
              Name and email cannot be changed here once a member is invited.
            </p>
          )}
        </div>
        {!isEdit && (
          <div className="space-y-1">
            <Label htmlFor="staff-job-title">Job title (optional)</Label>
            <Input
              id="staff-job-title"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              autoComplete="off"
            />
          </div>
        )}

        {/* Access: Portal active, App display-only/disabled (D7) */}
        <div className="space-y-2">
          <p className={sectionLabel}>Access</p>
          <div
            className="flex items-center justify-between rounded-[12px] p-3"
            style={{ background: 'var(--tint)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} aria-hidden="true" style={{ color: 'var(--success)' }} />
              <span className="text-sm font-semibold text-foreground">Portal access</span>
            </div>
            <span className="text-[12px] text-muted-foreground">Granted by this invite</span>
          </div>
          <div
            data-testid="app-access-display"
            className="flex items-start justify-between gap-3 rounded-[12px] p-3"
            style={{ background: 'var(--neutral)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-start gap-2">
              <Smartphone size={16} aria-hidden="true" className="mt-0.5" style={{ color: 'var(--text-muted)' }} />
              <div>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-tertiary)' }}>
                  App access
                </span>
                <p className="text-[12px] text-muted-foreground">
                  App access is managed on the App users view.
                </p>
              </div>
            </div>
            {/* Disabled, non-interactive: the drawer never creates a BranchUser. */}
            <Switch
              checked={false}
              disabled
              onCheckedChange={() => {}}
              label="App access (managed on the App users view)"
            />
          </div>
        </div>

        {/* Portal role */}
        <div className="space-y-2">
          <p className={sectionLabel}>Portal role</p>
          <div role="radiogroup" aria-label="Portal role" className="space-y-2">
            {ROLES.map((r) => (
              <label
                key={r}
                className="flex cursor-pointer items-center gap-3 rounded-[12px] border p-3"
                style={{
                  borderColor: role === r ? 'var(--rose)' : 'var(--border-subtle)',
                  background: role === r ? 'var(--tint)' : 'var(--card)',
                }}
              >
                <input
                  type="radio"
                  name="staff-role"
                  value={r}
                  checked={role === r}
                  onChange={() => setRole(r)}
                  className="size-4"
                  style={{ accentColor: 'var(--rose)' }}
                />
                <span className="text-sm font-semibold text-foreground">{ROLE_LABEL[r]}</span>
              </label>
            ))}
          </div>
          <RoleDetailList role={role} />
        </div>

        {/* Extra responsibilities */}
        <div className="space-y-2">
          <p className={sectionLabel}>Extra responsibilities</p>
          <div
            className="flex items-center justify-between rounded-[12px] p-3"
            style={{ background: 'var(--card)', border: '1px solid var(--border-subtle)' }}
          >
            <div>
              <span className="text-sm font-semibold text-foreground">Manage vouchers</span>
              <p className="text-[12px] text-muted-foreground">
                {canGrantVouchers
                  ? 'Let this branch manager create and edit vouchers across the business.'
                  : role === 'OWNER'
                    ? 'Owners can always manage vouchers.'
                    : 'Only a branch manager can be given voucher management.'}
              </p>
            </div>
            <Switch
              checked={role === 'OWNER' ? true : canManageVouchers}
              disabled={!canGrantVouchers}
              onCheckedChange={setCanManageVouchers}
              label="Manage vouchers"
            />
          </div>
          {(['Manage campaigns', 'Manage billing'] as const).map((label) => (
            <div
              key={label}
              className="flex items-center justify-between rounded-[12px] p-3 opacity-60"
              style={{ background: 'var(--card)', border: '1px solid var(--border-subtle)' }}
            >
              <div>
                <span className="text-sm font-semibold text-foreground">{label}</span>
                <p className="text-[12px] text-muted-foreground">Coming soon.</p>
              </div>
              <Switch checked={false} disabled onCheckedChange={() => {}} label={`${label} (coming soon)`} />
            </div>
          ))}
        </div>

        {/* Branches scope */}
        <div className="space-y-2">
          <p className={sectionLabel}>Branches</p>
          <div role="radiogroup" aria-label="Branch scope" className="space-y-2">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="staff-branch-scope"
                checked={allBranches}
                onChange={() => setAllBranches(true)}
                className="size-4"
                style={{ accentColor: 'var(--rose)' }}
              />
              <span className="text-sm font-semibold text-foreground">All branches</span>
            </label>
            {SPECIFIC_BRANCHES_ENABLED && (
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="radio"
                  name="staff-branch-scope"
                  checked={!allBranches}
                  onChange={() => setAllBranches(false)}
                  className="size-4"
                  style={{ accentColor: 'var(--rose)' }}
                />
                <span className="text-sm font-semibold text-foreground">Specific branches</span>
              </label>
            )}
          </div>
          {SPECIFIC_BRANCHES_ENABLED && !allBranches && (
            <div className="space-y-1.5 rounded-[12px] p-3" style={{ background: 'var(--neutral)' }}>
              {branches.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">You have no branches to assign yet.</p>
              ) : (
                branches.map((b) => (
                  <label key={b.id} className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={branchIds.includes(b.id)}
                      onChange={() => toggleBranch(b.id)}
                      className="size-4"
                      style={{ accentColor: 'var(--rose)' }}
                    />
                    <span className="text-sm text-foreground">{b.name}</span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>

        {/* Automated emails: read-only informational (D9) */}
        <div className="space-y-2">
          <p className={sectionLabel}>Automated emails</p>
          <div
            data-testid="automated-emails-info"
            className="flex items-start gap-2.5 rounded-[12px] p-3"
            style={{ background: 'var(--neutral)' }}
          >
            <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: 'var(--info)' }} />
            <p className="text-[13px] text-muted-foreground">
              {role === 'STAFF'
                ? 'Staff do not receive automated emails.'
                : 'Owners and branch managers receive redemption alerts and a monthly report once email is live.'}{' '}
              These defaults are set for you; per person email settings are coming later.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="gradient" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Saving...' : isEdit ? 'Save changes' : 'Send invite'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
