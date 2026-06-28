'use client'

/**
 * PR-B Task B7: the Insights Reports card (spec 10, screenshot 05 "Reports to download").
 *
 * Two report actions for the active selection:
 *
 *   1) Redemption activity CSV (excluding direct customer identifiers). Uses the B1
 *      downloadInsightsExport helper, which returns EITHER a csv body (gate open) OR
 *      `{ available:false }` (the fail-closed runtime gate is CLOSED, spec 13.5). When
 *      gated we show a calm "Not available" status, NOT an error: the event-level CSV is
 *      inside the bounded privacy/legal review (spec 13.6) and is simply not offered to
 *      real users yet. On a gate-open result we trigger a client-side blob download.
 *
 *   2) A link to the client-rendered printable performance summary (report/page.tsx),
 *      carrying the active filters so it opens on the same selection.
 *
 * Locked copy (spec 2.4 / 10.1):
 *   - Caption: "No direct customer identifiers are included" (NEVER "no personal data
 *     ever") PLUS the caveat that event-level date/time + branch + voucher + method
 *     combinations may still be personal or identifiable.
 *   - There is NO Customer column (and the copy never implies one).
 *   - BANNED: "Delivered" / "Value delivered"; any "email you this report" promise.
 *
 * House style: no em dashes; no emojis; icons via @/lib/icons; colour via CSS var()
 * tokens (never hardcoded hex). No new dependency (hand-rolled blob download mirrors
 * lib/api/redemptions.ts downloadRedemptionsCsv).
 */
import * as React from 'react'
import { BarChart3, Grid3x3 } from '@/lib/icons'
import {
  downloadInsightsExport,
  type InsightsFilters,
} from '@/lib/api/insights'
import { periodLabel } from '@/lib/insights/format'
import { MetricInfo } from './MetricInfo'

export interface ReportsCardProps {
  /** The active filters (period + optional branch/voucher/custom range). */
  filters: InsightsFilters
  /** The server-resolved scope label for the selection (e.g. "All branches"). */
  scopeLabel: string
  /**
   * Whether the event-level CSV runtime gate is open. Display-only: the helper is the
   * real boundary (it returns { available:false } when closed). When false we render
   * the calm Not-available state up front rather than letting the user click into it.
   */
  gateOpen: boolean
}

/** Build the printable-report querystring from the active filters (drops empties). */
function reportHref(filters: InsightsFilters): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '' && v !== null) p.set(k, String(v))
  }
  const s = p.toString()
  return `/insights/report${s ? `?${s}` : ''}`
}

/** Trigger a client-side download of a csv body (mirrors downloadRedemptionsCsv). */
function triggerCsvDownload(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const CSV_LABEL = 'Redemption activity CSV excluding direct customer identifiers'

export function ReportsCard({ filters, scopeLabel, gateOpen }: ReportsCardProps) {
  const [busy, setBusy] = React.useState(false)
  // The gate-closed state. Pre-seeded from the gateOpen prop and confirmed by the
  // helper response (so a runtime close is honoured even if the prop says open).
  const [notAvailable, setNotAvailable] = React.useState(!gateOpen)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setNotAvailable(!gateOpen)
  }, [gateOpen])

  async function handleDownloadCsv() {
    setBusy(true)
    setError(null)
    try {
      const res = await downloadInsightsExport(filters)
      if ('available' in res) {
        // The fail-closed gate is shut: a calm Not-available status, never an error.
        setNotAvailable(true)
        return
      }
      setNotAvailable(false)
      triggerCsvDownload(res.csv, res.filename)
    } catch {
      setError('We could not prepare your export just now. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const selectionEcho = `For this selection: ${scopeLabel}. ${periodLabel(
    filters.period ?? 'this_month',
    filters.from,
    filters.to,
  )}.`

  return (
    <section
      data-testid="insights-reports"
      className="flex flex-col gap-4"
      aria-labelledby="insights-reports-heading"
    >
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <h2
            id="insights-reports-heading"
            className="text-base font-semibold"
            style={{ color: 'var(--navy)' }}
          >
            Reports to download
          </h2>
          <MetricInfo label="About reports" ariaLabel="What the reports cover">
            Reports cover the active selection: the period, the branches you can see, and
            any voucher-type filter. Figures separate redemptions customers logged from
            the subset later confirmed by staff. Excludes test, deleted, and removed
            records.
          </MetricInfo>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {selectionEcho}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* 1) Printable performance summary -------------------------------- */}
        <article
          className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'var(--tint)', color: 'var(--coral)' }}
              aria-hidden
            >
              <BarChart3 size={18} />
            </span>
            <div className="flex flex-col gap-0.5">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--navy)' }}>
                Performance summary
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Your headline figures for the period: redemptions logged, the subset
                confirmed by staff, and estimated savings. A printable page you can save
                as a PDF.
              </p>
            </div>
          </div>
          <a
            href={reportHref(filters)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--navy)' }}
          >
            Print or save report
          </a>
        </article>

        {/* 2) Redemption activity CSV ------------------------------------- */}
        <article
          className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'var(--tint)', color: 'var(--coral)' }}
              aria-hidden
            >
              <Grid3x3 size={18} />
            </span>
            <div className="flex flex-col gap-0.5">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--navy)' }}>
                Redemption activity export
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                A spreadsheet of redemption activity for your records: date and time,
                branch, voucher, type, estimated value, status, and validation method.
              </p>
            </div>
          </div>

          {notAvailable ? (
            <p
              data-testid="csv-not-available"
              role="status"
              className="flex h-11 w-full items-center justify-center rounded-xl border text-sm font-medium"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--tint)',
                color: 'var(--text-muted)',
              }}
            >
              Not available yet
            </p>
          ) : (
            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={busy}
              aria-label={CSV_LABEL}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border text-sm font-semibold transition-colors hover:bg-[var(--tint)] disabled:opacity-60"
              style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}
            >
              {busy ? 'Preparing...' : 'Download CSV'}
            </button>
          )}

          {error ? (
            <p role="alert" className="text-xs" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          ) : null}

          {/* The locked identifiability caption (10.1). Positive wording PLUS the
              caveat; never "no personal data ever". There is no Customer column. */}
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            No direct customer identifiers are included. Event-level date and time,
            branch, voucher, and method combinations may still be personal or
            identifiable, so handle and store this file accordingly.
          </p>
        </article>
      </div>
    </section>
  )
}
