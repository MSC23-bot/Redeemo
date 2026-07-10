'use client'

/**
 * /team page: Team & Roles roster (S2).
 *
 * Gated on the `admin:manage-team` capability, which is held ONLY by
 * SUPER_ADMIN (it is not in any role baseline and not grantable) — the page,
 * the nav link (components/admin-shell.tsx), and every mutation all gate on
 * it. Backend `requireAdminCapability` stays the enforcement (two-layer rule,
 * .claude/rules/admin-web.md); this client gate is UX only, fail-closed.
 *
 * Roster read (GET /admin/team, S2 addition) + five S1 mutations: create
 * account, set role, deactivate, grant/revoke the curated `approval:action`
 * capability. Dialogs are mounted at page level, keyed by the selected admin
 * + action kind (mirrors app/(app)/merchants/page.tsx's dialog pattern).
 */
import { useState } from 'react'
import { Users, Loader2, AlertCircle, UserPlus } from 'lucide-react'
import { useSession } from '@/lib/auth/useSession'
import { useTeamRoster } from '@/lib/team/useTeam'
import { TeamRosterTable } from '@/features/team/TeamRosterTable'
import { CreateAccountDialog } from '@/features/team/CreateAccountDialog'
import { ChangeRoleDialog } from '@/features/team/ChangeRoleDialog'
import { GrantApprovalConfirm } from '@/features/team/GrantApprovalConfirm'
import { RevokeApprovalConfirm } from '@/features/team/RevokeApprovalConfirm'
import { DeactivateConfirm } from '@/features/team/DeactivateConfirm'
import { Button } from '@/components/ui/button'
import type { TeamAdmin } from '@/lib/api/team'

// ── States ──────────────────────────────────────────────────────────────────

function ForbiddenState() {
  return (
    <div className="mx-auto max-w-xl py-20 text-center" data-testid="team-forbidden">
      <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mb-2 text-lg font-semibold text-foreground">Access denied</h2>
      <p className="text-sm text-muted-foreground">
        You do not have permission to view Team &amp; roles. Contact your administrator.
      </p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertCircle className="mx-auto mb-3 size-6 text-destructive" aria-hidden="true" />
      <p className="mb-4 text-sm text-destructive">
        Could not load the team roster. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="text-sm font-medium text-primary hover:underline"
      >
        Retry
      </button>
    </div>
  )
}

// ── Dialog state ────────────────────────────────────────────────────────────

type DialogState =
  | { kind: 'create' }
  | { kind: 'changeRole'; admin: TeamAdmin }
  | { kind: 'grant'; admin: TeamAdmin }
  | { kind: 'revoke'; admin: TeamAdmin }
  | { kind: 'deactivate'; admin: TeamAdmin }
  | null

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const { ready, can, adminId } = useSession()
  const canManage = ready && can('admin:manage-team')

  const { data, isLoading, isError, refetch } = useTeamRoster({ enabled: canManage })
  const [dialog, setDialog] = useState<DialogState>(null)

  if (!ready) {
    return <LoadingState />
  }
  if (!can('admin:manage-team')) {
    return <ForbiddenState />
  }

  const admins = data?.admins ?? []

  function closeDialog() {
    setDialog(null)
  }
  function onDialogSuccess() {
    setDialog(null)
    void refetch()
  }

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Users className="size-4" aria-hidden="true" />
            </span>
            <h1 className="text-xl font-semibold text-foreground">Team &amp; roles</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Create admin accounts, set base roles, and grant or revoke approval capability
          </p>
        </div>
        <Button type="button" onClick={() => setDialog({ kind: 'create' })} data-testid="team-create-account-button">
          <UserPlus className="size-4" aria-hidden="true" />
          Create account
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <TeamRosterTable
          items={admins}
          canManage={canManage}
          currentAdminId={adminId}
          onChangeRole={(admin) => setDialog({ kind: 'changeRole', admin })}
          onGrant={(admin) => setDialog({ kind: 'grant', admin })}
          onRevoke={(admin) => setDialog({ kind: 'revoke', admin })}
          onDeactivate={(admin) => setDialog({ kind: 'deactivate', admin })}
        />
      )}

      {/* Dialogs */}
      {dialog?.kind === 'create' && (
        <CreateAccountDialog onSuccess={onDialogSuccess} onCancel={closeDialog} />
      )}
      {dialog?.kind === 'changeRole' && (
        <ChangeRoleDialog admin={dialog.admin} onSuccess={onDialogSuccess} onCancel={closeDialog} />
      )}
      {dialog?.kind === 'grant' && (
        <GrantApprovalConfirm admin={dialog.admin} onSuccess={onDialogSuccess} onCancel={closeDialog} />
      )}
      {dialog?.kind === 'revoke' && (
        <RevokeApprovalConfirm admin={dialog.admin} onSuccess={onDialogSuccess} onCancel={closeDialog} />
      )}
      {dialog?.kind === 'deactivate' && (
        <DeactivateConfirm admin={dialog.admin} onSuccess={onDialogSuccess} onCancel={closeDialog} />
      )}
    </div>
  )
}
