'use client'

/**
 * Staff & Access (v1) PR-C: the unified person table. Columns:
 *   Person   : avatar/initials, name, owner star, "Deactivated" pill, email
 *   Role + access : role chip (Owner / Branch manager / Staff); "+ Vouchers" extras
 *                   chip for a Branch manager with canManageVouchers; access pills
 *                   (Portal / App)
 *   Branches : All branches / branch name / N branches; "Last seen {ago}" or
 *              "Not signed in yet" from lastLoginAt
 *   (kebab)  : the row-actions menu (rendered by the page via renderRowActions so
 *              C5 StaffRowActions owns the menu; the table is layout only)
 *
 * Portal members and app users render in one table (the prototype-shaped unified
 * view). The email<->app correlation is display-only and never authorization
 * (spec §7 #7). House style: brand tokens, no em-dashes, SVG icons not emojis.
 */
import * as React from 'react'
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Star } from '@/lib/icons'
import { formatRelativeTime } from '@/lib/notifications/relativeTime'
import { ROLE_LABEL, branchCoverageLabel, lastSeenLabel } from '@/lib/staff/display'
import type { Person } from './types'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function AccessPill({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
      style={{ background: 'var(--subtle)', color: 'var(--text-tertiary)' }}
    >
      {label}
    </span>
  )
}

function RoleChip({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: 'var(--tint)', color: 'var(--navy)' }}
    >
      {label}
    </span>
  )
}

function PersonCell({ person }: { person: Person }) {
  const deactivated = person.status === 'INACTIVE'
  const isOwner = person.kind === 'portal' && person.role === 'OWNER'
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{ background: 'var(--tint-deep)', color: 'var(--rose)' }}
      >
        {initials(person.name)}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-semibold text-foreground">{person.name}</span>
          {isOwner && (
            <Star
              size={14}
              aria-label="Owner"
              className="shrink-0"
              style={{ color: 'var(--featured)', fill: 'var(--featured)' }}
            />
          )}
          {deactivated && <Badge variant="restrictive">Deactivated</Badge>}
        </div>
        <span className="truncate text-[13px] text-muted-foreground">{person.email}</span>
      </div>
    </div>
  )
}

function RoleAccessCell({ person }: { person: Person }) {
  if (person.kind === 'app') {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <RoleChip label="App user" />
        <AccessPill label="App" />
      </div>
    )
  }
  const showVouchers = person.role === 'BRANCH_MANAGER' && person.canManageVouchers
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <RoleChip label={ROLE_LABEL[person.role]} />
      {showVouchers && (
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: 'var(--tint-deep)', color: 'var(--rose)' }}
        >
          + Vouchers
        </span>
      )}
      <AccessPill label="Portal" />
    </div>
  )
}

function BranchesCell({
  person,
  branchNameById,
}: {
  person: Person
  branchNameById: (id: string) => string | undefined
}) {
  const coverage =
    person.kind === 'app'
      ? person.branchName
      : branchCoverageLabel(person.allBranches, person.branchIds, branchNameById)
  const seen = lastSeenLabel(person.lastLoginAt)
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-foreground">{coverage}</span>
      <span className="text-[12px] text-muted-foreground">
        {seen.value ? `${seen.prefix} ${formatRelativeTime(seen.value)}` : seen.prefix}
      </span>
    </div>
  )
}

export function StaffTable({
  people,
  branchNameById,
  renderRowActions,
}: {
  people: Person[]
  branchNameById: (id: string) => string | undefined
  /** The page supplies the kebab menu (C5). When omitted, no actions column shows. */
  renderRowActions?: (person: Person) => React.ReactNode
}) {
  if (people.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <TableEmpty>No one matches your search.</TableEmpty>
      </div>
    )
  }

  const showActions = !!renderRowActions

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <Table>
        <THead>
          <TR>
            <TH>Person</TH>
            <TH>Role and access</TH>
            <TH>Branches</TH>
            {showActions && <TH className="text-right">Actions</TH>}
          </TR>
        </THead>
        <TBody>
          {people.map((person) => (
            <TR key={`${person.kind}:${person.id}`}>
              <TD>
                <PersonCell person={person} />
              </TD>
              <TD>
                <RoleAccessCell person={person} />
              </TD>
              <TD>
                <BranchesCell person={person} branchNameById={branchNameById} />
              </TD>
              {showActions && <TD className="text-right">{renderRowActions!(person)}</TD>}
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  )
}
