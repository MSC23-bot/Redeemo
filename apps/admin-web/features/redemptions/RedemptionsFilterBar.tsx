'use client'

/**
 * RedemptionsFilterBar: the status chips + code search + include-test toggle row,
 * extracted from the global /redemptions page (D67) so the per-merchant Merchant
 * 360 Redemptions tab (A3) shares one control. Controlled: the caller owns all
 * state; this component only renders + reports changes. There is no merchant
 * filter here (the global page never had one, and the per-merchant tab is already
 * scoped by merchantId), so nothing needs hiding when scoped.
 */
import { type KeyboardEvent } from 'react'
import { Search } from 'lucide-react'
import { StatusChips, type StatusChipValue } from './StatusChips'

interface RedemptionsFilterBarProps {
  statusFilter: StatusChipValue
  onStatusChange: (value: StatusChipValue) => void
  codeInput: string
  onCodeInputChange: (value: string) => void
  onCodeSubmit: (value: string) => void
  includeTest: boolean
  onIncludeTestChange: (value: boolean) => void
}

export function RedemptionsFilterBar({
  statusFilter,
  onStatusChange,
  codeInput,
  onCodeInputChange,
  onCodeSubmit,
  includeTest,
  onIncludeTestChange,
}: RedemptionsFilterBarProps) {
  function onCodeKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      onCodeSubmit(codeInput.trim())
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <StatusChips active={statusFilter} onChange={onStatusChange} />

      <div className="relative min-w-[220px] flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={codeInput}
          onChange={(e) => onCodeInputChange(e.target.value)}
          onKeyDown={onCodeKeyDown}
          placeholder="Search by code or voucher title (press Enter)"
          aria-label="Search redemptions by code or voucher title"
          data-testid="redemptions-search-input"
          className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={includeTest}
          onChange={(e) => onIncludeTestChange(e.target.checked)}
          aria-label="Include test data"
          data-testid="redemptions-include-test-toggle"
          className="size-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        Include test data
      </label>
    </div>
  )
}
