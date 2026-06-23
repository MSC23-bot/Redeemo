'use client'

// Branches PR-1 F2: the overview body. Three summary cards + a branch table, all
// derived from the single useBranches list payload (NO per-branch fetch). Mirrors
// the Vouchers/Redemptions list-page conventions (design-system primitives, brand
// tokens, role=alert/role=status states owned by the page orchestrator).
//
// SECURITY (plan §6 / §7): the list row carries the AES-encrypted redemptionPin.
// We derive ONLY a set / not-set indicator from its presence; the value is NEVER
// rendered, logged, or extracted. The decrypted PIN is fetched on demand in F6.

import * as React from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from '@/components/ui/table'
import { MapPin, Clock, CircleCheck, KeyRound, Plus, Grid3x3 } from '@/lib/icons'
import { openNow, type OpeningHoursRow } from '@/lib/branches/openNow'
import { isWithRedeemo } from '@/lib/branches/withRedeemo'
import type { Branch } from '@/lib/api/branch'

// A branch row carries the encrypted pin under `redemptionPin` (passthrough). We
// only ever read its presence, never its value.
type BranchRow = Branch & { redemptionPin?: string | null; localityName?: string | null; postTown?: string | null }

export function BranchesOverview({
  branches,
  merchantLive,
  onOpen,
}: {
  branches: Branch[]
  merchantLive: boolean
  onOpen: (id: string) => void
}) {
  const now = new Date()

  const locationsCount = branches.length
  const openNowCount = branches.filter((b) => openNow((b.openingHours ?? []) as OpeningHoursRow[], now)).length
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
              Your branches will appear here. Adding a branch is coming in this Branches rollout.
            </p>
            <div className="mt-4 flex justify-center">
              <AddBranchButton />
            </div>
          </TableEmpty>
        ) : (
          <>
            <div className="flex items-center justify-end px-3 pt-4">
              <AddBranchButton />
            </div>
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
          </>
        )}
      </Card>
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
        <span className="text-success" aria-hidden>
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
  const pinSet = branch.redemptionPin != null

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

// Branches PR-1 F13 lands a shared LockedAffordance; for F2 the Add-branch control
// is a disabled button with the rollout subtext, performing NO network call.
function AddBranchButton() {
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="gradient"
        disabled
        title="Coming in this Branches rollout"
        aria-label="Add branch (coming in this Branches rollout)"
      >
        <Plus size={16} aria-hidden /> Add branch
      </Button>
      <span className="text-[11px] text-muted-foreground">Coming in this Branches rollout</span>
    </span>
  )
}

// --- Today's-hours cell -----------------------------------------------------
// Looks up TODAY's row (Europe/London weekday) and renders it as a friendly
// "9am to 11pm" / "noon to 5pm" string, or "Closed". Reuses openNow's London
// day-of-week derivation so the Today cell and the Open-now count agree.

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
  const today = openingHours.find((h) => h.dayOfWeek === dow)
  if (!today || today.isClosed || !today.openTime || !today.closeTime) return 'Closed'
  return `${friendlyTime(today.openTime)} to ${friendlyTime(today.closeTime)}`
}

// "HH:MM" (24h) -> "9am" / "12:30pm" / "noon" / "midnight".
function friendlyTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (Number.isNaN(h)) return hhmm
  if (m === 0 && h === 12) return 'noon'
  if (m === 0 && (h === 0 || h === 24)) return 'midnight'
  const period = h >= 12 && h < 24 ? 'pm' : 'am'
  let hour12 = h % 12
  if (hour12 === 0) hour12 = 12
  return m === 0 ? `${hour12}${period}` : `${hour12}:${String(m).padStart(2, '0')}${period}`
}
