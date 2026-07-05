'use client'

// Branches PR-1 F10 + PR-4 + PR-8: the Opening hours card (prototype 03/08). It renders
// the full Monday..Sunday day/time table showing the CURRENT LIVE hours read-only, with
// the Europe/London Today row highlighted.
//
// PR-4 (§6) made the cool-off behaviour live:
//   - The Edit control is a LIVE editor (was a disabled LockedAffordance). It reuses the
//     onboarding hours model (hoursModel.ts): prefill from the live hours, validate +
//     build the payload on save, copy-Monday + Open-24h helpers. On save it STAGES via
//     useStageBranchHours (the change does NOT go live immediately).
//   - The "2 hour customer cool off" chip is rendered near the title.
//   - A pending-hours BANNER (mirroring PendingEditsList) shows the proposed change +
//     a "Goes live at <time>" line + a Cancel control wired to useCancelPendingHours,
//     whenever the branch carries a PENDING staged change.
//   - The live table keeps showing the CURRENT live hours (NOT the pending), so the
//     merchant always sees both "what customers see now" (table) and "what will go
//     live and when" (banner). Customers keep seeing the live hours until promotion.
//
// PR-8 (§6) makes MULTI-WINDOW live:
//   - The editor now edits N windows per day (add / remove window controls). The
//     previously LOCKED "Add a second window" affordance is gone; the live control is
//     inside the editor, per day.
//   - The live table + the pending banner render N windows per day (e.g. "9am to 2pm,
//     5pm to 11pm"), ordered by openTime, via the shared formatDay / formatDayWindows.
//   - The edit still routes through the PR-4 cool-off STAGE-not-apply path + the same
//     OWNER-only client gate; only the window UI + the payload cardinality changed.
//
// CLIENT GATING (PR-4 §6 #4, updated for D-BM1): the Edit + Cancel controls
// gate on `canManage` (the per-branch effective capability), so OWNER and
// assigned Branch Managers both see them. The backend assertCanManageBranch is
// the real authorization boundary; this only drives which controls render.
// STAFF / unassigned members see the read-only table only.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { Dialog } from '@/components/ui/dialog'
import { Clock, Pencil, Plus, X } from '@/lib/icons'
import { useStageBranchHours, useCancelPendingHours } from '@/lib/branches/useBranches'
import {
  DAY_LABELS,
  addWindow,
  applyOpen24h,
  copyMondayToAllDays,
  copyMondayToWeekdays,
  hoursStateFromBranch,
  removeWindow,
  setWindow,
  toHoursPayload,
  validateHoursState,
  type DayHours,
  type BranchHoursRow,
} from '@/components/onboarding/branch/lib/hoursModel'
import { formatDay } from '@/lib/branches/hoursFormat'
import type { OpeningHoursRow } from '@/lib/branches/openNow'
import type { Branch } from '@/lib/api/branch'

// Display order: Monday first through Sunday (prototype 03/08). dayOfWeek 0=Sun.
const DAYS: { dow: number; label: string }[] = [
  { dow: 1, label: 'Monday' },
  { dow: 2, label: 'Tuesday' },
  { dow: 3, label: 'Wednesday' },
  { dow: 4, label: 'Thursday' },
  { dow: 5, label: 'Friday' },
  { dow: 6, label: 'Saturday' },
  { dow: 0, label: 'Sunday' },
]

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
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' })
    .formatToParts(now)
    .find((p) => p.type === 'weekday')?.value
  return weekday ? LONDON_WEEKDAY_MAP[weekday] : -1
}

// Europe/London friendly go-live time, matching the card's London framing. ISO -> e.g.
// "24 Jun 2026 at 4:30pm". Falls back to the raw string if the date does not parse.
function friendlyGoLive(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const day = get('day')
  const month = get('month')
  const year = get('year')
  // dayPeriod comes through as "am"/"pm" (or "AM"/"PM" on some engines); normalise.
  const period = (get('dayPeriod') || '').toLowerCase().replace(/\s/g, '')
  const hour = get('hour')
  const minute = get('minute')
  return `${day} ${month} ${year} at ${hour}:${minute}${period}`
}

export function OpeningHoursCard({
  branch,
  canManage,
  now = new Date(),
}: {
  branch: Branch
  canManage: boolean
  now?: Date
}) {
  const { toast } = useToast()
  const hours = (branch.openingHours ?? []) as OpeningHoursRow[]
  const todayDow = londonDayOfWeek(now)

  // At most one PENDING staged change (backend take:1). undefined when none.
  const pending = branch.pendingHours?.[0]

  const stage = useStageBranchHours()
  const cancel = useCancelPendingHours()
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [cancelError, setCancelError] = React.useState<string | null>(null)

  async function onCancelPending() {
    setCancelError(null)
    try {
      await cancel.mutateAsync(branch.id)
      toast({ message: 'Staged change cancelled. Your live hours stay as they are.', variant: 'success' })
    } catch {
      // A stale/missing pending (already promoted, or cancelled in another tab) is a
      // calm no-op: the invalidate still re-reads the branch so the banner reconciles.
      setCancelError('We could not cancel that change. It may have already gone live. Refresh to check.')
    }
  }

  return (
    <Card className="gap-4" data-testid="branch-hours-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Clock size={16} aria-hidden style={{ color: 'var(--text-tertiary)' }} />
          <h2 className="font-display text-lg font-semibold text-foreground">Opening hours</h2>
          {/* PR-4: the now-live cool-off chip (prototype 03), sits beside the title. */}
          <span
            data-testid="cool-off-chip"
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
            style={{ background: 'var(--tint-deep)', color: 'var(--rose)' }}
          >
            <Clock size={12} aria-hidden />2 hour customer cool off
          </span>
        </div>
        {/* PR-4: LIVE Edit control (owner-gated client-side; server-enforced). */}
        {canManage ? (
          <button
            type="button"
            data-testid="hours-edit"
            onClick={() => setEditorOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold transition-colors"
            style={{ color: 'var(--rose)' }}
          >
            <Pencil size={14} aria-hidden />
            Edit
          </button>
        ) : null}
      </div>

      {/* PR-4: the pending-hours banner (mirrors PendingEditsList). Shows the proposed
          change + the go-live time + an owner Cancel. Live hours are untouched. */}
      {pending ? (
        <div className="px-6">
          {cancelError ? (
            <p
              role="alert"
              className="mb-3 rounded-[10px] border px-3 py-2 text-sm font-medium"
              style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
            >
              {cancelError}
            </p>
          ) : null}
          <div
            data-testid="pending-hours-banner"
            className="rounded-[14px] p-4"
            style={{ background: 'var(--tint)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <Clock size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--rose)' }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">A new schedule is on the way</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Your customers keep seeing the current hours below. Your new hours go live at{' '}
                    <span className="font-semibold text-foreground" data-testid="pending-hours-golive">
                      {friendlyGoLive(pending.effectiveAt)}
                    </span>
                    . You can cancel before then.
                  </p>
                </div>
              </div>
              {canManage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  data-testid="pending-hours-cancel"
                  onClick={onCancelPending}
                  disabled={cancel.isPending}
                >
                  {cancel.isPending ? 'Cancelling...' : 'Cancel'}
                </Button>
              ) : null}
            </div>

            {/* The proposed weekly schedule (N windows per day), so the merchant can
                verify the staged change. */}
            <dl className="mt-3 divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {DAYS.map(({ dow, label }) => {
                const text = formatDay(pending.proposedHours as OpeningHoursRow[], dow)
                return (
                  <div
                    key={dow}
                    className="flex items-center justify-between py-1.5 text-[13px]"
                    data-testid={`pending-hours-row-${dow}`}
                  >
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className={text === 'Closed' ? 'text-muted-foreground' : 'text-foreground'}>
                      {text}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </div>
        </div>
      ) : null}

      <div className="px-6">
        {/* The CURRENT LIVE hours (what customers see now), N windows per day. */}
        <dl className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {DAYS.map(({ dow, label }) => {
            const text = formatDay(hours, dow)
            const isToday = dow === todayDow
            const closed = text === 'Closed'
            return (
              <div
                key={dow}
                className="flex items-center justify-between py-2.5 text-sm"
                data-testid={`hours-row-${dow}`}
              >
                <dt className="flex items-center gap-2 text-foreground">
                  {label}
                  {isToday ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
                      style={{ background: 'var(--tint-deep)', color: 'var(--rose)' }}
                    >
                      Today
                    </span>
                  ) : null}
                </dt>
                <dd className={closed ? 'text-muted-foreground' : 'text-foreground'}>{text}</dd>
              </div>
            )
          })}
        </dl>
      </div>

      {editorOpen ? (
        <HoursEditorModal
          branch={branch}
          stage={stage}
          onClose={() => setEditorOpen(false)}
          onStaged={() => {
            setEditorOpen(false)
            toast({
              message: 'Hours staged. They go live for customers in 2 hours, and you can cancel before then.',
              variant: 'success',
            })
          }}
        />
      ) : null}
    </Card>
  )
}

// PR-4 + PR-8 editor: the MULTI-WINDOW day editor reusing hoursModel.ts. Prefill from
// the LIVE hours (grouping rows into windows per day), validate + build the payload on
// save, copy-Monday + Open-24h + per-day add/remove window. On save it STAGES (the
// change does not go live for 2 hours). Closing without saving is a no-op. Mirrors the
// onboarding BranchStepForm hours section.
function HoursEditorModal({
  branch,
  stage,
  onClose,
  onStaged,
}: {
  branch: Branch
  stage: ReturnType<typeof useStageBranchHours>
  onClose: () => void
  onStaged: () => void
}) {
  const [state, setState] = React.useState<DayHours[]>(() =>
    hoursStateFromBranch((branch.openingHours ?? []) as BranchHoursRow[]),
  )
  const [errors, setErrors] = React.useState<Record<number, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)

  function patchDay(dayOfWeek: number, fn: (d: DayHours) => DayHours) {
    setState((prev) => prev.map((d) => (d.dayOfWeek === dayOfWeek ? fn(d) : d)))
  }

  async function onSave() {
    setFormError(null)
    const v = validateHoursState(state)
    setErrors(v)
    if (Object.keys(v).length > 0) return
    try {
      await stage.mutateAsync({ id: branch.id, hours: toHoursPayload(state) })
      onStaged()
    } catch {
      setFormError('We could not stage your hours. Please try again.')
    }
  }

  return (
    <Dialog
      label="Edit opening hours"
      onClose={onClose}
      panelTestId="hours-editor-modal"
      scrimTestId="hours-editor-scrim"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-foreground">Edit opening hours</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-[#6B7390] hover:text-[#010C35]"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      {/* Cool-off explainer: saving stages, it does not go live instantly. */}
      <div
        className="mt-4 flex items-start gap-3 rounded-[14px] p-4"
        style={{ background: 'var(--tint)', border: '1px solid var(--border-subtle)' }}
      >
        <Clock size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--rose)' }} />
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">There is a 2 hour customer cool off.</span> When
          you save, your current hours stay live for customers for 2 hours. You can cancel the change before
          it goes live.
        </p>
      </div>

      {formError ? (
        <p
          role="alert"
          data-testid="hours-editor-error"
          className="mt-4 rounded-[10px] border px-3 py-2 text-sm font-medium"
          style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
        >
          {formError}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2.5">
        <BulkButton onClick={() => setState((s) => copyMondayToWeekdays(s))}>
          Copy Monday to weekdays
        </BulkButton>
        <BulkButton onClick={() => setState((s) => copyMondayToAllDays(s))}>
          Copy Monday to all days
        </BulkButton>
      </div>

      <div className="mt-4 max-h-[50vh] space-y-2.5 overflow-y-auto pr-1">
        {DAY_LABELS.map(({ dayOfWeek, label }) => {
          const day = state.find((d) => d.dayOfWeek === dayOfWeek)!
          const rowError = errors[dayOfWeek]
          return (
            <div
              key={dayOfWeek}
              data-testid={`editor-hours-row-${dayOfWeek}`}
              className="rounded-[14px] border px-4 py-3"
              style={{ borderColor: 'var(--border-subtle)', background: 'var(--page)' }}
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <span className="w-[92px] shrink-0 text-sm font-bold text-foreground">{label}</span>
                <div className="flex items-center gap-2">
                  <Switch
                    label={`Open on ${label}`}
                    checked={!day.isClosed}
                    onCheckedChange={(open) =>
                      patchDay(dayOfWeek, (d) =>
                        open
                          ? // Reopen: give it one default window if it had none.
                            { ...d, isClosed: false, windows: d.windows.length > 0 ? d.windows : [{ openTime: '09:00', closeTime: '17:00' }] }
                          : { ...d, isClosed: true, windows: [] },
                      )
                    }
                  />
                  <span className="text-[13px] font-semibold text-muted-foreground">
                    {day.isClosed ? 'Closed' : 'Open'}
                  </span>
                </div>

                {!day.isClosed ? (
                  <div className="flex flex-col gap-2">
                    {day.windows.map((w, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <TimeField
                          id={`hours-edit-${dayOfWeek}-${i}-open`}
                          label={`${label} opening time, window ${i + 1}`}
                          value={w.openTime}
                          onChange={(v) => patchDay(dayOfWeek, (d) => setWindow(d, i, { openTime: v }))}
                        />
                        <span aria-hidden="true" className="text-sm text-[#8089A4]">
                          to
                        </span>
                        <TimeField
                          id={`hours-edit-${dayOfWeek}-${i}-close`}
                          label={`${label} closing time, window ${i + 1}`}
                          value={w.closeTime}
                          onChange={(v) => patchDay(dayOfWeek, (d) => setWindow(d, i, { closeTime: v }))}
                        />
                        {i === 0 ? (
                          <button
                            type="button"
                            onClick={() => patchDay(dayOfWeek, (d) => applyOpen24h(d))}
                            className="rounded-[8px] border border-[#E3E7EE] bg-white px-2.5 py-1.5 text-[12px] font-bold text-[#455373] hover:border-[#E20C04] hover:text-[#E20C04]"
                          >
                            Open 24 hours
                          </button>
                        ) : null}
                        {day.windows.length > 1 ? (
                          <button
                            type="button"
                            data-testid={`editor-remove-window-${dayOfWeek}-${i}`}
                            aria-label={`Remove ${label} window ${i + 1}`}
                            onClick={() => patchDay(dayOfWeek, (d) => removeWindow(d, i))}
                            className="inline-flex size-7 items-center justify-center rounded-[8px] border border-[#E3E7EE] bg-white text-[#8089A4] hover:border-[#E20C04] hover:text-[#E20C04]"
                          >
                            <X size={14} aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    ))}
                    <button
                      type="button"
                      data-testid={`editor-add-window-${dayOfWeek}`}
                      onClick={() => patchDay(dayOfWeek, (d) => addWindow(d))}
                      className="inline-flex w-fit items-center gap-1 rounded-[8px] px-1.5 py-1 text-[12px] font-bold text-[#E20C04] hover:underline"
                    >
                      <Plus size={13} aria-hidden />
                      Add a window
                    </button>
                  </div>
                ) : null}
              </div>
              {rowError ? (
                <span role="alert" className="mt-1.5 block text-xs font-medium text-[#B91C1C]">
                  {rowError}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-[#8089A4]">
        Use 24 hour times. Add a window for a split day (for example a lunch close). A closing time earlier
        than the opening time means you stay open past midnight.
      </p>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={stage.isPending}>
          Cancel
        </Button>
        <Button type="button" data-testid="hours-editor-save" onClick={onSave} disabled={stage.isPending}>
          {stage.isPending ? 'Staging...' : 'Stage new hours'}
        </Button>
      </div>
    </Dialog>
  )
}

function TimeField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <span className="inline-flex flex-col">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        aria-label={label}
        type="text"
        inputMode="numeric"
        placeholder="09:00"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-[88px] rounded-[10px] border-[1.5px] border-[#E3E7EE] bg-white px-2.5 text-center text-[14px] tabular-nums text-[#010C35] outline-none focus-visible:border-[#E20C04]"
      />
    </span>
  )
}

function BulkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-[#E3E7EE] bg-white px-3.5 py-1.5 text-[12.5px] font-bold text-[#455373] transition-colors hover:border-[#E20C04] hover:text-[#E20C04]"
    >
      {children}
    </button>
  )
}
