'use client'

/**
 * RedemptionsPagination: Previous / Next pager, extracted from the global
 * /redemptions page (D67) so the per-merchant Merchant 360 Redemptions tab (A3)
 * shares one pager. Controlled by offset + total; the caller owns the page state.
 * Renders nothing when there are no rows.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface RedemptionsPaginationProps {
  offset: number
  total: number
  pageSize: number
  onPrev: () => void
  onNext: () => void
}

export function RedemptionsPagination({
  offset,
  total,
  pageSize,
  onPrev,
  onNext,
}: RedemptionsPaginationProps) {
  if (total <= 0) return null

  const page = Math.floor(offset / pageSize) + 1
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Page {page} of {totalPages} · {total} {total === 1 ? 'redemption' : 'redemptions'}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={offset <= 0}
          data-testid="redemptions-prev-page"
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-foreground transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={offset + pageSize >= total}
          data-testid="redemptions-next-page"
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-foreground transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
