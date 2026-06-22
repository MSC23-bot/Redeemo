'use client'

import { Button } from '@/components/ui/button'
import type { AdminProposed, AvailabilityWindow } from '@/lib/api/voucher'

// Day-2 Vouchers B6: the concierge proposed-vs-current diff. When a voucher is
// CHANGES_REQUESTED, the admin can write corrected fields into
// merchantFields.adminProposed (+ an adminNote). This panel renders the proposed
// values next to the merchant's current values and lets the merchant apply them.
//
// The merchant's content is the source of truth until they accept: "Apply
// Redeemo's suggestions" writes the proposed values into the builder form (via
// onApply); the merchant can still edit further or ignore. A comment-only changes
// request (no adminProposed) shows just the note.
//
// B-3 reuses the same row-building logic in a non-applying ConciergeReadOnly variant
// that the read-only VoucherDetail renders for a CHANGES_REQUESTED voucher.

export interface ConciergeCurrent {
  title?: string
  description?: string
  terms?: string
  estimatedSaving?: number
  availabilityWindows?: AvailabilityWindow[]
  cooldownSeconds?: number | null
}

export type DiffRow = {
  key: keyof ConciergeCurrent
  label: string
  current: string
  proposed: string
}

function money(n: number): string {
  const r = Math.round(n * 100) / 100
  return r % 1 === 0 ? String(r) : r.toFixed(2)
}

function formatCooldown(seconds: number): string {
  if (seconds % 604800 === 0) {
    const w = seconds / 604800
    return `${w} ${w === 1 ? 'week' : 'weeks'}`
  }
  if (seconds % 86400 === 0) {
    const d = seconds / 86400
    return `${d} ${d === 1 ? 'day' : 'days'}`
  }
  if (seconds % 3600 === 0) {
    const h = seconds / 3600
    return `${h} ${h === 1 ? 'hour' : 'hours'}`
  }
  const m = Math.round(seconds / 60)
  return `${m} minutes`
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// B-10: a human-readable summary of the availability windows for the diff.
function formatWindows(windows: AvailabilityWindow[]): string {
  if (windows.length === 0) return '(none)'
  return windows
    .map((w) => `${DAY_NAMES[w.dayOfWeek] ?? '?'} ${w.openTime}-${w.closeTime}`)
    .join(', ')
}

function fmt(key: keyof ConciergeCurrent, v: unknown): string {
  if (key === 'availabilityWindows') {
    return Array.isArray(v) ? formatWindows(v as AvailabilityWindow[]) : '(none)'
  }
  if (key === 'cooldownSeconds') {
    return typeof v === 'number' ? formatCooldown(v) : '(none)'
  }
  if (v == null || v === '') return '(empty)'
  if (key === 'estimatedSaving' && typeof v === 'number') return `£${money(v)}`
  return String(v)
}

// Build the proposed-vs-current diff rows. Only fields the admin actually proposed
// (key present on adminProposed) appear. Exported so the read-only variant (B-3)
// reuses the exact same row logic.
export function buildRows(proposed: AdminProposed, current: ConciergeCurrent): DiffRow[] {
  const rows: DiffRow[] = []
  const fields: Array<{ key: keyof ConciergeCurrent; label: string }> = [
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
    { key: 'terms', label: 'Terms' },
    { key: 'estimatedSaving', label: 'Saving' },
    // B-10: windows + cooldown corrections show in the diff (the apply path already
    // handles them).
    { key: 'availabilityWindows', label: 'When it is available' },
    { key: 'cooldownSeconds', label: 'How often it can be used' },
  ]
  for (const { key, label } of fields) {
    const p = (proposed as Record<string, unknown>)[key]
    if (p === undefined) continue // the admin did not propose a change to this field.
    rows.push({ key, label, current: fmt(key, current[key]), proposed: fmt(key, p) })
  }
  return rows
}

export function hasProposed(proposed: AdminProposed | null | undefined): proposed is AdminProposed {
  if (!proposed) return false
  return Object.values(proposed).some((v) => v !== undefined)
}

export function ConciergeDiff({
  proposed,
  note,
  current,
  onApply,
}: {
  proposed: AdminProposed | null
  note: string | null
  current: ConciergeCurrent
  onApply: (proposed: AdminProposed) => void
}) {
  const showSuggestions = hasProposed(proposed)
  const rows = showSuggestions ? buildRows(proposed, current) : []

  return (
    <div
      data-testid="concierge-diff"
      className="rounded-[16px] border border-[#E0D7D0] bg-[#FFF6EC] p-5"
    >
      <p className="text-sm font-bold text-[#B45309]">The Redeemo team suggested some changes</p>
      {note ? (
        <p data-testid="concierge-note" className="mt-2 text-[13px] leading-relaxed text-[#4B5366]">
          {note}
        </p>
      ) : null}

      {showSuggestions ? (
        <>
          <div className="mt-4 space-y-3">
            {rows.map((r) => (
              <div key={r.key} className="rounded-[12px] border border-[#E5E7EB] bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-[#8089A4]">{r.label}</p>
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase text-[#8089A4]">Your version</p>
                    <p data-testid={`concierge-current-${r.key}`} className="text-sm text-[#4B5366]">
                      {r.current}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase text-[#16A34A]">Suggested</p>
                    <p data-testid={`concierge-proposed-${r.key}`} className="text-sm font-medium text-[#010C35]">
                      {r.proposed}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Button variant="navy" size="sm" onClick={() => onApply(proposed)}>
              Apply Redeemo&apos;s suggestions
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}

// B-3: the READ-ONLY concierge summary rendered on the voucher detail page when a
// voucher is CHANGES_REQUESTED. It shows the adminNote + the same proposed-vs-current
// rows as ConciergeDiff, but has NO Apply action (applying happens in the Edit
// builder). It points the merchant at "Edit to resubmit". Distinct testIds
// (concierge-readonly-*) so a page test can target the read view unambiguously.
export function ConciergeReadOnly({
  proposed,
  note,
  current,
}: {
  proposed: AdminProposed | null
  note: string | null
  current: ConciergeCurrent
}) {
  const showSuggestions = hasProposed(proposed)
  const rows = showSuggestions ? buildRows(proposed, current) : []

  return (
    <div
      data-testid="concierge-readonly"
      className="rounded-[16px] border border-[#E0D7D0] bg-[#FFF6EC] p-5"
    >
      <p className="text-sm font-bold text-[#B45309]">The Redeemo team suggested some changes</p>
      {note ? (
        <p
          data-testid="concierge-readonly-note"
          className="mt-2 text-[13px] leading-relaxed text-[#4B5366]"
        >
          {note}
        </p>
      ) : null}

      {showSuggestions ? (
        <div className="mt-4 space-y-3">
          {rows.map((r) => (
            <div key={r.key} className="rounded-[12px] border border-[#E5E7EB] bg-white p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-[#8089A4]">{r.label}</p>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase text-[#8089A4]">Your version</p>
                  <p
                    data-testid={`concierge-readonly-current-${r.key}`}
                    className="text-sm text-[#4B5366]"
                  >
                    {r.current}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase text-[#16A34A]">Suggested</p>
                  <p
                    data-testid={`concierge-readonly-proposed-${r.key}`}
                    className="text-sm font-medium text-[#010C35]"
                  >
                    {r.proposed}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-4 text-[13px] font-semibold text-[#B45309]">
        Edit to resubmit with these changes.
      </p>
    </div>
  )
}
