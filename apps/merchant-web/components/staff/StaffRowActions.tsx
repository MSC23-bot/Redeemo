'use client'

/**
 * Staff & Access (v1) PR-C C5: the per-row kebab actions menu.
 *
 * Portal-member actions: Edit access; Reactivate (deactivated only); Deactivate
 * (active, not the last owner); Remove from team (not the last owner); Resend invite
 * (not-yet-claimed only, claimed === false). The last-owner actions are replaced by
 * a lock footnote when the member is the only active owner (D8).
 *
 * App-user actions: Reset app password; Deactivate; Reactivate; each DISABLED when
 * that branch's appUserCount > 1 (the §5.3 UI guard, driven by the backend count).
 *
 * The menu is presentation + intent only: the page owns the mutations + confirm
 * dialogs (passed via the callbacks). Owner-only management is enforced server-side;
 * the page only renders this menu for owners.
 *
 * House style: brand tokens, no em-dashes, SVG icons not emojis.
 */
import * as React from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { MoreVertical, Pencil, Power, Trash2, Send, KeyRound, Lock } from '@/lib/icons'
import type { Person } from './types'

export interface StaffRowActionHandlers {
  onEditAccess: (person: Person) => void
  onDeactivateMember: (person: Person) => void
  onReactivateMember: (person: Person) => void
  onRemoveMember: (person: Person) => void
  onResendInvite: (person: Person) => void
  onResetAppPassword: (person: Person) => void
  onDeactivateAppUser: (person: Person) => void
  onReactivateAppUser: (person: Person) => void
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-[var(--neutral)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
      style={{ color: danger ? 'var(--danger)' : 'var(--text-primary)' }}
    >
      <span aria-hidden="true" className="shrink-0">
        {icon}
      </span>
      {label}
    </button>
  )
}

function PortalActions({
  person,
  handlers,
  close,
}: {
  person: Extract<Person, { kind: 'portal' }>
  handlers: StaffRowActionHandlers
  close: () => void
}) {
  const deactivated = person.status === 'INACTIVE'
  const lastOwner = person.isLastActiveOwner
  const run = (fn: (p: Person) => void) => () => {
    close()
    fn(person)
  }
  return (
    <div role="menu" className="flex min-w-[200px] flex-col">
      <MenuItem icon={<Pencil size={15} />} label="Edit access" onClick={run(handlers.onEditAccess)} />

      {!person.claimed && (
        <MenuItem icon={<Send size={15} />} label="Resend invite" onClick={run(handlers.onResendInvite)} />
      )}

      {deactivated ? (
        <MenuItem icon={<Power size={15} />} label="Reactivate" onClick={run(handlers.onReactivateMember)} />
      ) : (
        !lastOwner && (
          <MenuItem icon={<Power size={15} />} label="Deactivate" onClick={run(handlers.onDeactivateMember)} />
        )
      )}

      {!lastOwner && (
        <MenuItem
          icon={<Trash2 size={15} />}
          label="Remove from team"
          danger
          onClick={run(handlers.onRemoveMember)}
        />
      )}

      {lastOwner && (
        <p
          data-testid="last-owner-lock"
          className="flex items-start gap-2 px-3 py-2 text-[12px]"
          style={{ color: 'var(--text-muted)' }}
        >
          <Lock size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
          The last active owner cannot be deactivated or removed.
        </p>
      )}
    </div>
  )
}

function AppActions({
  person,
  handlers,
  close,
}: {
  person: Extract<Person, { kind: 'app' }>
  handlers: StaffRowActionHandlers
  close: () => void
}) {
  const deactivated = person.status === 'INACTIVE'
  // §5.3 UI guard: a branch with >1 app user cannot have a single user targeted
  // safely (the backend refuses with MULTIPLE_BRANCH_USERS), so the actions are
  // disabled with an explanatory note.
  const ambiguous = person.appUserCount > 1
  const run = (fn: (p: Person) => void) => () => {
    close()
    fn(person)
  }
  return (
    <div role="menu" className="flex min-w-[220px] flex-col">
      <MenuItem
        icon={<KeyRound size={15} />}
        label="Reset app password"
        disabled={ambiguous}
        onClick={run(handlers.onResetAppPassword)}
      />
      {deactivated ? (
        <MenuItem
          icon={<Power size={15} />}
          label="Reactivate"
          disabled={ambiguous}
          onClick={run(handlers.onReactivateAppUser)}
        />
      ) : (
        <MenuItem
          icon={<Power size={15} />}
          label="Deactivate"
          disabled={ambiguous}
          onClick={run(handlers.onDeactivateAppUser)}
        />
      )}
      {ambiguous && (
        <p
          data-testid="multi-app-user-note"
          className="px-3 py-2 text-[12px]"
          style={{ color: 'var(--text-muted)' }}
        >
          This branch has more than one app user, so these actions are unavailable for now.
        </p>
      )}
    </div>
  )
}

export function StaffRowActions({
  person,
  handlers,
}: {
  person: Person
  handlers: StaffRowActionHandlers
}) {
  const [open, setOpen] = React.useState(false)
  const close = () => setOpen(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${person.name}`}
          className="inline-flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-[var(--neutral)]"
        >
          <MoreVertical size={18} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-1">
        {person.kind === 'portal' ? (
          <PortalActions person={person} handlers={handlers} close={close} />
        ) : (
          <AppActions person={person} handlers={handlers} close={close} />
        )}
      </PopoverContent>
    </Popover>
  )
}
