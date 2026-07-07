'use client'

/**
 * "Recent redemptions" feed (home-1) from GET /merchant/redemptions?sort=recent&limit=5.
 * Rows are already first-name + last-initial only server-side; this feed shows only WHAT
 * was redeemed and WHERE, never WHO. House style: no emojis, no em-dashes, tokens only.
 */
import * as React from 'react'
import Link from 'next/link'
import { Lock, ArrowRight } from '@/lib/icons'
import { formatRelativeTime } from '@/lib/notifications/relativeTime'
import type { RedemptionRow } from '@/lib/api/redemptions'

export function RecentRedemptions({ rows }: { rows: RedemptionRow[] }) {
  return (
    <section
      data-testid="home-recent-redemptions"
      aria-labelledby="home-recent-heading"
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm"
      style={{ borderColor: 'var(--border)' }}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: '#0F7A3E' }}
          />
          <h2 id="home-recent-heading" className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
            Recent redemptions
          </h2>
        </div>
        <Link
          href="/redemptions"
          className="inline-flex items-center gap-1 text-sm font-semibold"
          style={{ color: 'var(--primary)' }}
        >
          View all
          <ArrowRight size={15} aria-hidden />
        </Link>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No redemptions yet. Your first ones will show here.
        </p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: 'var(--coral)' }}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold" style={{ color: 'var(--navy)' }}>
                    {row.voucher.title}
                  </span>
                  <span className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {row.branch.name}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>
                {formatRelativeTime(row.redeemedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
        <Lock size={12} aria-hidden />
        What was redeemed and where, never who.
      </p>
    </section>
  )
}
