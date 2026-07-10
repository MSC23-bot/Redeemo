'use client'

// Branches PR-1 F2: the overview body. Three summary cards + a branch table, all
// derived from the single useBranches list payload (NO per-branch fetch). Mirrors
// the Vouchers/Redemptions list-page conventions (design-system primitives, brand
// tokens, role=alert/role=status states owned by the page orchestrator).
//
// SECURITY (wire hygiene 2026-07-05, revising the PR-1 trade-off): the #377
// backend emits a server-derived `redemptionPinSet` boolean and strips the
// ciphertext. Set/not-set is read via the shared branchPinSet bridge, which
// also tolerates an OLDER backend during deploy skew (legacy presence-only
// fallback; value never read/rendered/logged). The decrypted PIN is fetched
// on demand via the guarded reveal route only.

import * as React from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from '@/components/ui/table'
import { MapPin, Clock, CircleCheck, KeyRound, Plus, Grid3x3 } from '@/lib/icons'
import { openNow, type OpeningHoursRow } from '@/lib/branches/openNow'
import { formatDay } from '@/lib/branches/hoursFormat'
import { isWithRedeemo } from '@/lib/branches/withRedeemo'
import { AddBranchModal } from '@/components/branches/AddBranchModal'
import type { Branch } from '@/lib/api/branch'
import { branchPinSet } from '@/lib/branches/pinSet'

// Set/not-set via the shared bridge; the legacy field stays typed presence-only
// for the old-backend skew window (see lib/branches/pinSet.ts removal trigger).
type BranchRow = Branch & { redemptionPin?: string | null; localityName?: string | null; postTown?: string | null }

export function BranchesOverview({
  branches,
  merchantLive,
  isOwner,
  onOpen,
}: {
  branches: Branch[]
  merchantLive: boolean
  // PR-5 §6: gates the live "Add branch" CTA (create is OWNER-only per D3 + the
  // backend). A non-owner sees no add control. The backend owner-only resolver is
  // the real boundary; this only drives which control renders.
  isOwner: boolean
  onOpen: (id: string) => void
}) {
  const now = new Date()
  const [addOpen, setAddOpen] = React.useState(false)

  const locationsCount = branches.length
  // Only ACTIVE branches can be "Open right now": an inactive branch shows as
  // Closed in its row, so it must not be counted as open in the summary.
  const openNowCount = branches.filter(
    (b) => b.isActive !== false && openNow((b.openingHours ?? []) as OpeningHoursRow[], now),
  ).length
  // The lifecycle gate lives here, not in withRedeemo.ts: when the merchant is not
  // Live, it is not on Redeemo at all, so the count is 0 regardless of any
  // per-branch MANUALLY_CONFIRMED flag.
  const withRedeemoCount = merchantLive ? branches.filter((b) => isWithRedeemo(b)).length : 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard testId="summary-locations" icon={<MapPin size={14} />} label="Locations" value={locationsCount} />
        <SummaryCard testId="summary-open-now" icon={<Clock size={14} />} label="Open right now" value={openNowCount} />
        <SummaryCard
          testId="summary-with-redeemo"
          icon={<CircleCheck size={14} />}
          label="With Redeemo"
          value={withRedeemoCount}
        />
      </div>

      <Card className="overflow-hidden py-0">
        {branches.length === 0 ? (
          <TableEmpty>
            <p className="font-display text-lg font-semibold text-foreground">No branches yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {isOwner
                ? 'Your branches will appear here. Add your first branch to get started.'
                : 'Your branches will appear here.'}
            </p>
            {isOwner ? (
              <div className="mt-4 flex justify-center">
                <AddBranchButton onClick={() => setAddOpen(true)} />
              </div>
            ) : null}
          </TableEmpty>
        ) : (
          <>
            {isOwner ? (
              <div className="flex items-center justify-end px-3 pt-4">
                <AddBranchButton onClick={() => setAddOpen(true)} />
              </div>
            ) : null}
            {/* Responsive (F14): on a narrow viewport the 4-column table scrolls
                horizontally instead of being clipped by the Card's overflow-hidden,
                matching the established RedemptionsTable / StaffTable pattern. */}
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR className="border-border">
                    <TH>Branch</TH>
                    <TH>Today</TH>
                    <TH>Setup</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {branches.map((b) => (
                    <BranchTableRow key={b.id} branch={b as BranchRow} now={now} onOpen={onOpen} />
                  ))}
                </TBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      {/* The modal is already only mounted for an owner; pass the OWNER-grade
          `canDropPin` explicitly so the chained pin-drop step's OWNER-only gate
          (addendum §9.3) is consistent with the LocationCard entry point. */}
      {addOpen ? <AddBranchModal onClose={() => setAddOpen(false)} canDropPin={isOwner} /> : null}
    </div>
  )
}

function SummaryCard({
  testId,
  icon,
  label,
  value,
}: {
  testId: string
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <Card data-testid={testId} className="gap-2 py-5">
      <div className="flex items-center gap-1.5 px-6 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
        {/* Prototype 01/12: the summary-card icons are muted/dark to match the gray
            label. Green is reserved for the live row open-status dot, not these icons. */}
        <span className="text-muted-foreground" aria-hidden>
          {icon}
        </span>
        {label}
      </div>
      <p className="px-6 font-display text-3xl font-semibold text-foreground">{value}</p>
    </Card>
  )
}

function BranchTableRow({
  branch,
  now,
  onOpen,
}: {
  branch: BranchRow
  now: Date
  onOpen: (id: string) => void
}) {
  const locality = branch.city ?? branch.localityName ?? branch.postTown ?? null
  const address = [branch.addressLine1, locality, branch.postcode].filter(Boolean).join(', ')
  const today = formatTodaysHours((branch.openingHours ?? []) as OpeningHoursRow[], now)
  const isOpen = openNow((branch.openingHours ?? []) as OpeningHoursRow[], now)
  const amenityCount = branch.amenities?.length ?? 0
  const pinSet = branchPinSet(branch)

  return (
    <TR
      role="button"
      tabIndex={0}
      onClick={() => onOpen(branch.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(branch.id)
        }
      }}
      className="cursor-pointer hover:bg-[#F8F9FA]"
    >
      <TD>
        <div className="flex items-center gap-2">
          <span className="font-display font-semibold text-foreground">{branch.name}</span>
          {branch.isMainBranch ? <Badge variant="neutral">Main</Badge> : null}
        </div>
        {address ? <p className="mt-0.5 text-[13px] text-muted-foreground">{address}</p> : null}
      </TD>
      <TD className="text-[13px] text-muted-foreground">{today}</TD>
      <TD>
        <div className="flex items-center gap-4 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <KeyRound size={14} aria-hidden />
            {pinSet ? 'PIN' : 'No PIN'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Grid3x3 size={14} aria-hidden />
            {amenityCount}
          </span>
        </div>
      </TD>
      <TD>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
          <span
            aria-hidden
            className="inline-block size-1.5 rounded-full"
            style={{ backgroundColor: branch.isActive === false ? 'var(--muted-foreground)' : 'var(--success)' }}
          />
          {branch.isActive === false ? (
            <span className="text-muted-foreground">Closed</span>
          ) : (
            <span className="text-foreground">{isOpen ? 'Open now' : 'Active'}</span>
          )}
        </span>
      </TD>
    </TR>
  )
}

// Branches PR-5 §6: the Add-branch CTA is now LIVE (was the PR-1 disabled
// LockedAffordance). Owner-only (the caller renders it only when isOwner); the click
// opens the AddBranchModal create form. The brand gradient + Plus glyph match prototype
// 01's top-right "Add branch" button.
function AddBranchButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" data-testid="add-branch-button" onClick={onClick}>
      <Plus size={16} aria-hidden /> Add branch
    </Button>
  )
}

// --- Today's-hours cell -----------------------------------------------------
// Looks up TODAY's rows (Europe/London weekday) and renders ALL of that day's windows
// as a friendly "9am to 2pm, 5pm to 11pm" string, or "Closed". Reuses openNow's London
// day-of-week derivation so the Today cell and the Open-now count agree, and the shared
// formatDay so the multi-window rendering matches the day-2 OpeningHoursCard table.

const LONDON_WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

function londonDayOfWeek(now: Date): number {
  const weekday = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
  })
    .formatToParts(now)
    .find((p) => p.type === 'weekday')?.value
  return weekday ? LONDON_WEEKDAY_MAP[weekday] : -1
}

export function formatTodaysHours(openingHours: OpeningHoursRow[], now: Date): string {
  const dow = londonDayOfWeek(now)
  if (dow < 0) return 'Closed'
  return formatDay(openingHours, dow)
}
