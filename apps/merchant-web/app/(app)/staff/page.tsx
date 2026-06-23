'use client'

/**
 * Staff & Access (v1) PR-C: the merchant portal Staff & Access module.
 *
 * Owners build and manage their team here: invite portal members (Branch managers /
 * Staff) by email, assign role + branch scope, optionally delegate voucher
 * management, deactivate / reactivate / remove, resend invites; plus a read-only
 * app-user (BranchUser) surface with reset-password / deactivate / reactivate.
 *
 * Lifecycle gating (spec §6 / §6.1):
 *   - suspended : BLOCKED (the standard suspended-account state; the resolver throws
 *                 MERCHANT_SUSPENDED so the data never loads).
 *   - pre-live  : owner-only ("for now it is just you"); Add is disabled until live.
 *   - live      : full team + Add enabled.
 *
 * Owner-only management (D7): member management is owner-only in v1. The backend
 * assertOwner is the security boundary; a non-owner GET /staff returns 403, and the
 * UI hides Add + row-actions. The UI is display only, never the boundary.
 *
 * House style: brand tokens, no em-dashes, SVG icons not emojis.
 */
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { UserPlus } from '@/lib/icons'
import { ApiError } from '@/lib/api/client'
import { useSession } from '@/lib/auth/session'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'
import { deriveStatusPill, homeFor } from '@/lib/auth/lifecycle'
import { listBranches } from '@/lib/api/branch'
import {
  useStaff,
  useBranchAppUsers,
  useInviteStaff,
  useUpdateStaff,
  useDeactivateStaff,
  useReactivateStaff,
  useRemoveStaff,
  useResendInvite,
  useResetAppUserPassword,
  useDeactivateAppUser,
  useReactivateAppUser,
} from '@/lib/staff/useStaff'
import { SEARCH_THRESHOLD } from '@/lib/staff/display'
import { staffErrorMessage } from '@/lib/staff/errorMessages'
import { StaffSummaryCards, type StaffCounts } from '@/components/staff/StaffSummaryCards'
import { StaffSearch } from '@/components/staff/StaffSearch'
import { StaffTable } from '@/components/staff/StaffTable'
import { StaffRowActions, type StaffRowActionHandlers } from '@/components/staff/StaffRowActions'
import { StaffAddEditDrawer, type BranchOption, type StaffDrawerSubmit } from '@/components/staff/StaffAddEditDrawer'
import { InviteDeliveryNotice, type InviteDelivery } from '@/components/staff/InviteDeliveryNotice'
import type { Person, PortalPerson, AppPerson } from '@/components/staff/types'
import type { MemberRow, AppUsersList } from '@/lib/api/staff'

// --- Person assembly --------------------------------------------------------
function buildPortalPeople(members: MemberRow[]): PortalPerson[] {
  const activeOwners = members.filter((m) => m.role === 'OWNER' && m.status === 'ACTIVE')
  const lastOwnerId = activeOwners.length === 1 ? activeOwners[0].id : null
  return members.map((m) => ({
    kind: 'portal',
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    status: m.status,
    canManageVouchers: m.canManageVouchers,
    allBranches: m.allBranches,
    branchIds: m.branchIds,
    claimed: m.claimed,
    lastLoginAt: m.lastLoginAt,
    isLastActiveOwner: m.id === lastOwnerId,
    raw: m,
  }))
}

function buildAppPeople(data: AppUsersList | undefined): AppPerson[] {
  if (!data) return []
  const out: AppPerson[] = []
  for (const branch of data.branches) {
    for (const u of branch.users) {
      out.push({
        kind: 'app',
        id: u.id,
        name: `${u.firstName} ${u.lastName}`.trim(),
        email: u.email,
        status: u.status,
        jobTitle: u.jobTitle,
        branchId: branch.branchId,
        branchName: branch.branchName,
        appUserCount: branch.appUserCount,
        lastLoginAt: u.lastLoginAt,
        raw: u,
      })
    }
  }
  return out
}

type Confirm =
  | { kind: 'deactivate-member'; person: PortalPerson }
  | { kind: 'remove-member'; person: PortalPerson }
  | { kind: 'deactivate-appuser'; person: AppPerson }
  | null

export default function StaffPage() {
  const session = useSession()
  const profile = useMerchantProfile(session.isAuthenticated)

  const lifecycleState = profile.data ? deriveStatusPill(profile.data) : null
  const suspended = lifecycleState === 'suspended'
  const preLive = lifecycleState ? homeFor(lifecycleState) === 'pre-live' : false

  // Data is only fetched when authenticated and the merchant is not suspended (the
  // resolver would throw MERCHANT_SUSPENDED anyway; gating avoids a noisy 403).
  const dataEnabled = session.isAuthenticated && !!profile.data && !suspended
  const staff = useStaff(dataEnabled)
  const appUsers = useBranchAppUsers(dataEnabled)
  const branchesQuery = useQuery({
    queryKey: ['merchantBranches'],
    queryFn: listBranches,
    enabled: dataEnabled,
    staleTime: 60_000,
  })

  // Owner detection (defence-in-depth; the backend assertOwner is the boundary): a
  // non-owner GET /staff returns INSUFFICIENT_PERMISSIONS (403). When that is the
  // error, hide management affordances.
  const staffForbidden =
    staff.isError && staff.error instanceof ApiError && staff.error.code === 'INSUFFICIENT_PERMISSIONS'
  const isOwner = staff.isSuccess && !staffForbidden

  // Mutations.
  const invite = useInviteStaff()
  const update = useUpdateStaff()
  const deactivateMember = useDeactivateStaff()
  const reactivateMember = useReactivateStaff()
  const removeMember = useRemoveStaff()
  const resend = useResendInvite()
  const resetAppPw = useResetAppUserPassword()
  const deactivateAppUser = useDeactivateAppUser()
  const reactivateAppUser = useReactivateAppUser()

  // UI state.
  const [search, setSearch] = React.useState('')
  const [drawer, setDrawer] = React.useState<{ open: boolean; editing: PortalPerson | null }>({
    open: false,
    editing: null,
  })
  const [drawerError, setDrawerError] = React.useState<string | null>(null)
  const [confirm, setConfirm] = React.useState<Confirm>(null)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [inviteResult, setInviteResult] = React.useState<InviteDelivery | null>(null)
  const [resetResult, setResetResult] = React.useState<{ branchName: string; temporaryPassword: string } | null>(null)

  if (profile.isError) {
    return (
      <PageError onRetry={() => profile.refetch()} />
    )
  }
  if (profile.isLoading || !profile.data) {
    return (
      <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
        Loading your team...
      </div>
    )
  }

  // Suspended = BLOCKED (spec §6.1): the standard suspended-account state, not a
  // read-only team table.
  if (suspended) {
    return (
      <div className="space-y-6">
        <Header />
        <div
          role="status"
          className="rounded-[16px] p-5"
          style={{ background: 'var(--danger-bg)', border: '1px solid #F4C7C7' }}
        >
          <p className="text-base font-bold" style={{ color: 'var(--danger)' }}>
            Your account is suspended
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Team management is unavailable while your account is suspended. Please contact Redeemo to put
            this right.
          </p>
        </div>
      </div>
    )
  }

  const portalPeople = buildPortalPeople(staff.data ?? [])
  const appPeople = buildAppPeople(appUsers.data)
  const people: Person[] = [...portalPeople, ...appPeople]

  const branchOptions: BranchOption[] = (branchesQuery.data ?? []).map((b) => ({ id: b.id, name: b.name }))
  const branchNameById = (id: string) => branchOptions.find((b) => b.id === id)?.name

  // Counts for the summary cards.
  const peopleActive = people.filter((p) => p.status !== 'INACTIVE').length
  const peopleDeactivated = people.filter((p) => p.status === 'INACTIVE').length
  const counts: StaffCounts = {
    peopleActive,
    peopleDeactivated,
    portalUsed: portalPeople.length,
    appUsed: appPeople.length,
  }

  // Search filter (people-count threshold from the prototype).
  const showSearch = people.length > SEARCH_THRESHOLD
  const term = search.trim().toLowerCase()
  const filtered = term
    ? people.filter((p) => p.name.toLowerCase().includes(term) || p.email.toLowerCase().includes(term))
    : people

  const dataLoading = staff.isLoading || appUsers.isLoading

  // The drawer + row actions render only for owners (UI hide; backend enforces).
  const canManage = isOwner && !preLive

  function openAdd() {
    setDrawerError(null)
    setInviteResult(null)
    setDrawer({ open: true, editing: null })
  }
  function openEdit(person: Person) {
    if (person.kind !== 'portal') return
    setDrawerError(null)
    setDrawer({ open: true, editing: person })
  }
  function closeDrawer() {
    setDrawer({ open: false, editing: null })
    setDrawerError(null)
  }

  async function handleDrawerSubmit(payload: StaffDrawerSubmit) {
    setDrawerError(null)
    try {
      if (drawer.editing) {
        await update.mutateAsync({ memberId: drawer.editing.id, body: payload.update })
        closeDrawer()
      } else {
        const res = await invite.mutateAsync(payload.invite)
        closeDrawer()
        setInviteResult({ inviteDelivery: res.inviteDelivery, email: payload.invite.email })
      }
    } catch (err) {
      setDrawerError(staffErrorMessage(err))
    }
  }

  async function runResend(person: Person) {
    setActionError(null)
    setInviteResult(null)
    try {
      const res = await resend.mutateAsync(person.id)
      setInviteResult({ inviteDelivery: res.inviteDelivery, email: person.email })
    } catch (err) {
      setActionError(staffErrorMessage(err))
    }
  }

  async function runReactivateMember(person: Person) {
    setActionError(null)
    try {
      await reactivateMember.mutateAsync(person.id)
    } catch (err) {
      setActionError(staffErrorMessage(err))
    }
  }

  async function runReactivateAppUser(person: Person) {
    if (person.kind !== 'app') return
    setActionError(null)
    try {
      await reactivateAppUser.mutateAsync(person.branchId)
    } catch (err) {
      setActionError(staffErrorMessage(err))
    }
  }

  async function runResetAppPassword(person: Person) {
    if (person.kind !== 'app') return
    setActionError(null)
    setResetResult(null)
    try {
      const res = await resetAppPw.mutateAsync(person.branchId)
      setResetResult({ branchName: person.branchName, temporaryPassword: res.temporaryPassword })
    } catch (err) {
      setActionError(staffErrorMessage(err))
    }
  }

  async function runConfirm() {
    if (!confirm) return
    setActionError(null)
    try {
      if (confirm.kind === 'deactivate-member') await deactivateMember.mutateAsync(confirm.person.id)
      else if (confirm.kind === 'remove-member') await removeMember.mutateAsync(confirm.person.id)
      else if (confirm.kind === 'deactivate-appuser') await deactivateAppUser.mutateAsync(confirm.person.branchId)
      setConfirm(null)
    } catch (err) {
      setActionError(staffErrorMessage(err))
      setConfirm(null)
    }
  }

  const rowHandlers: StaffRowActionHandlers = {
    onEditAccess: openEdit,
    onDeactivateMember: (p) => p.kind === 'portal' && setConfirm({ kind: 'deactivate-member', person: p }),
    onReactivateMember: runReactivateMember,
    onRemoveMember: (p) => p.kind === 'portal' && setConfirm({ kind: 'remove-member', person: p }),
    onResendInvite: runResend,
    onResetAppPassword: runResetAppPassword,
    onDeactivateAppUser: (p) => p.kind === 'app' && setConfirm({ kind: 'deactivate-appuser', person: p }),
    onReactivateAppUser: runReactivateAppUser,
  }

  return (
    <div className="space-y-6">
      <Header
        action={
          canManage ? (
            <Button variant="gradient" onClick={openAdd}>
              <UserPlus size={16} /> Add staff member
            </Button>
          ) : preLive && isOwner ? (
            <Button variant="gradient" disabled title="Available once your business is live">
              <UserPlus size={16} /> Add staff member
            </Button>
          ) : null
        }
      />

      {staffForbidden && (
        <Card>
          <div className="px-6 text-sm text-muted-foreground">
            You can see your team, but only an owner can invite or change members.
          </div>
        </Card>
      )}

      <StaffSummaryCards counts={counts} />

      {inviteResult && <InviteDeliveryNotice result={inviteResult} />}
      {actionError && (
        <div role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>
          {actionError}
        </div>
      )}

      {preLive && (
        <div
          role="status"
          className="rounded-[14px] p-4"
          style={{ background: 'var(--tint)', border: '1px solid var(--border-subtle)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            For now it is just you. Once your business is live you can invite your team and give them portal
            or app access.
          </p>
        </div>
      )}

      {showSearch && <StaffSearch value={search} onChange={setSearch} />}

      {dataLoading ? (
        <Card>
          <div role="status" aria-live="polite" className="px-6 text-sm text-muted-foreground">
            Loading your team...
          </div>
        </Card>
      ) : staff.isError && !staffForbidden ? (
        <Card>
          <div role="alert" className="space-y-3 px-6">
            <p className="text-sm text-foreground">We could not load your team.</p>
            <Button variant="secondary" onClick={() => staff.refetch()}>
              Try again
            </Button>
          </div>
        </Card>
      ) : (
        <StaffTable
          people={filtered}
          branchNameById={branchNameById}
          renderRowActions={
            canManage ? (person) => <StaffRowActions person={person} handlers={rowHandlers} /> : undefined
          }
        />
      )}

      {drawer.open && (
        <StaffAddEditDrawer
          editing={drawer.editing}
          branches={branchOptions}
          busy={invite.isPending || update.isPending}
          errorMessage={drawerError}
          onClose={closeDrawer}
          onSubmit={handleDrawerSubmit}
        />
      )}

      {confirm && (
        <ConfirmDialog
          confirm={confirm}
          busy={deactivateMember.isPending || removeMember.isPending || deactivateAppUser.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirm}
        />
      )}

      {resetResult && (
        <ResetPasswordDialog result={resetResult} onClose={() => setResetResult(null)} />
      )}
    </div>
  )
}

function Header({ action }: { action?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold text-foreground">Staff and access</h1>
        <p className="text-sm text-muted-foreground">
          Portal access lets someone manage on the web. App access lets them validate at their branches.
        </p>
      </div>
      {action}
    </header>
  )
}

function PageError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-6" role="alert">
      <h1 className="font-display text-2xl font-semibold text-foreground">Something went wrong</h1>
      <Card>
        <div className="space-y-3 px-6">
          <p className="text-sm text-foreground">We could not load your team. Check your connection and try again.</p>
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </Card>
    </div>
  )
}

function ConfirmDialog({
  confirm,
  busy,
  onCancel,
  onConfirm,
}: {
  confirm: NonNullable<Confirm>
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const copy =
    confirm.kind === 'deactivate-member'
      ? {
          title: `Deactivate ${confirm.person.name}?`,
          body: 'They will be signed out and lose portal access until you reactivate them. Their history is kept.',
          cta: 'Deactivate',
        }
      : confirm.kind === 'remove-member'
        ? {
            title: `Remove ${confirm.person.name} from the team?`,
            body: 'They will lose portal access and drop off your team list. You can invite them again later.',
            cta: 'Remove',
          }
        : {
            title: 'Deactivate this app user?',
            body: 'They will be signed out of the validation app until you reactivate them.',
            cta: 'Deactivate',
          }
  return (
    <Dialog label={copy.title} onClose={onCancel} panelTestId="staff-confirm" scrimTestId="staff-confirm-scrim">
      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">{copy.title}</h2>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working...' : copy.cta}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function ResetPasswordDialog({
  result,
  onClose,
}: {
  result: { branchName: string; temporaryPassword: string }
  onClose: () => void
}) {
  return (
    <Dialog
      label="Temporary password"
      onClose={onClose}
      panelTestId="staff-reset-dialog"
      scrimTestId="staff-reset-scrim"
    >
      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">App password reset</h2>
        <p className="text-sm text-muted-foreground">
          Share this one-time password with the app user at {result.branchName}. They will be asked to set
          a new password on their next sign-in.
        </p>
        <div
          className="rounded-[12px] p-4 text-center font-mono text-lg font-semibold tracking-widest text-foreground"
          style={{ background: 'var(--neutral)', border: '1px solid var(--border-subtle)' }}
        >
          {result.temporaryPassword}
        </div>
        <div className="flex justify-end">
          <Button variant="navy" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
