'use client'

/**
 * Staff & Access (v1) PR-C: the people search box. Per the prototype + spec it only
 * appears when there are more than SEARCH_THRESHOLD (4) people; the page owns the
 * threshold check and the filter state, this is the controlled input.
 */
import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Search } from '@/lib/icons'

export function StaffSearch({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div className="relative max-w-sm">
      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
        style={{ color: 'var(--text-muted)' }}
      />
      <Input
        type="search"
        aria-label="Search people"
        placeholder="Search by name or email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9"
      />
    </div>
  )
}
