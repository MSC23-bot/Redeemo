'use client'

import { Button } from '@/components/ui/button'
import type { AdminProposed } from '@/lib/api/voucher'

// Day-2 Vouchers B6: the concierge proposed-vs-current diff. When a voucher is
// CHANGES_REQUESTED, the admin can write corrected fields into
// merchantFields.adminProposed (+ an adminNote). This panel renders the proposed
// values next to the merchant's current values and lets the merchant apply them.
//
// The merchant's content is the source of truth until they accept: "Apply
// Redeemo's suggestions" writes the proposed values into the builder form (via
// onApply); the merchant can still edit further or ignore. A comment-only changes
// request (no adminProposed) shows just the note.

export interface ConciergeCurrent {
  title?: string
  description?: string
  terms?: string
  estimatedSaving?: number
}

type DiffRow = {
  key: keyof ConciergeCurrent
  label: string
  current: string
  proposed: string
}

function money(n: number): string {
  const r = Math.round(n * 100) / 100
  return r % 1 === 0 ? String(r) : r.toFixed(2)
}

function fmt(key: keyof ConciergeCurrent, v: unknown): string {
  if (v == null || v === '') return '(empty)'
  if (key === 'estimatedSaving' && typeof v === 'number') return `£${money(v)}`
  return String(v)
}

function buildRows(proposed: AdminProposed, current: ConciergeCurrent): DiffRow[] {
  const rows: DiffRow[] = []
  const fields: Array<{ key: keyof ConciergeCurrent; label: string }> = [
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
    { key: 'terms', label: 'Terms' },
    { key: 'estimatedSaving', label: 'Saving' },
  ]
  for (const { key, label } of fields) {
    const p = (proposed as Record<string, unknown>)[key]
    if (p === undefined) continue // the admin did not propose a change to this field.
    rows.push({ key, label, current: fmt(key, current[key]), proposed: fmt(key, p) })
  }
  return rows
}

function hasProposed(proposed: AdminProposed | null | undefined): proposed is AdminProposed {
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
