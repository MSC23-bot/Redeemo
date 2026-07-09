'use client'

/**
 * BranchTable — read-only list of merchant branches.
 *
 * Shows each branch's name, address, location provenance (Branch Location Trust
 * Slice 2 badge), and active/main status. Branch PINs are never shown here.
 *
 * M6: when `canConfirmLocation` is true, each branch whose location is not yet
 * confirmed (POSTCODE_CENTROID / NEEDS_REVIEW) gets a "Confirm location" button
 * that calls `onConfirmLocation(branchId)`. Already-confirmed branches
 * (MANUALLY_CONFIRMED / ADDRESS_GEOCODED) show no button. The table stays
 * read-only otherwise (no PIN is ever rendered).
 *
 * Slice 2 (spec 2026-07-09 §2.4): provenance badges use the shared spec labels;
 * when any branch is NEEDS_REVIEW a "Needs location review (N)" filter chip
 * appears so the exception is discoverable in the list.
 */
import { useMemo, useState } from 'react'
import { Badge } from '@/features/shared/Badge'
import { LocationProvenanceBadge } from '@/features/shared/locationProvenance'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ReviewBranch } from '@/lib/api/review'

interface BranchTableProps {
  branches: ReviewBranch[]
  /** Whether the signed-in admin holds branch:confirm-location (UI gating only). */
  canConfirmLocation?: boolean
  /** Open the confirm-location dialog for a specific branch. */
  onConfirmLocation?: (branchId: string) => void
}

/** A branch location counts as "not confirmed" for POSTCODE_CENTROID or NEEDS_REVIEW. */
function isLocationUnconfirmed(confidence: string): boolean {
  return confidence === 'POSTCODE_CENTROID' || confidence === 'NEEDS_REVIEW'
}

function formatAddress(branch: ReviewBranch): string {
  const parts = [
    branch.addressLine1,
    branch.addressLine2,
    branch.city,
    branch.postcode,
  ].filter(Boolean)
  return parts.join(', ')
}

type LocationFilter = 'all' | 'needsReview'

export function BranchTable({
  branches,
  canConfirmLocation = false,
  onConfirmLocation,
}: BranchTableProps) {
  const [filter, setFilter] = useState<LocationFilter>('all')

  const needsReviewCount = useMemo(
    () => branches.filter((b) => b.locationConfidence === 'NEEDS_REVIEW').length,
    [branches],
  )
  const visibleBranches = useMemo(
    () =>
      filter === 'needsReview'
        ? branches.filter((b) => b.locationConfidence === 'NEEDS_REVIEW')
        : branches,
    [branches, filter],
  )

  if (branches.length === 0) {
    return (
      <section aria-labelledby="branches-heading" data-testid="branch-table">
        <h2 id="branches-heading" className="text-sm font-semibold text-foreground mb-3">
          Branches
        </h2>
        <div className="rounded-lg border border-border bg-card px-6 py-8 text-center">
          <p className="text-sm text-muted-foreground">No branches added yet.</p>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="branches-heading" data-testid="branch-table">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="branches-heading" className="text-sm font-semibold text-foreground">
          Branches ({branches.length})
        </h2>

        {/* Slice 2: NEEDS_REVIEW discoverability. The filter chip only appears when
            there is at least one branch to review, matching the queue chip style. */}
        {needsReviewCount > 0 && (
          <div role="tablist" aria-label="Filter branches by location review" className="flex gap-2">
            <button
              role="tab"
              type="button"
              aria-selected={filter === 'all'}
              onClick={() => setFilter('all')}
              data-testid="branch-filter-all"
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                filter === 'all'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              All branches
            </button>
            <button
              role="tab"
              type="button"
              aria-selected={filter === 'needsReview'}
              onClick={() => setFilter('needsReview')}
              data-testid="branch-filter-needs-review"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                filter === 'needsReview'
                  ? 'border-amber-400 bg-amber-100 text-amber-800'
                  : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              Needs location review
              <span
                className={cn(
                  'inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs leading-none',
                  filter === 'needsReview' ? 'bg-amber-200 text-amber-900' : 'bg-secondary text-muted-foreground',
                )}
              >
                {needsReviewCount}
              </span>
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Branch name
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Address
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Location
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleBranches.map((branch, idx) => (
              <tr
                key={branch.id}
                className={cn(
                  'border-b border-border last:border-0',
                  idx % 2 === 0 ? 'bg-card' : 'bg-secondary/10'
                )}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{branch.name}</span>
                    {branch.isMainBranch && (
                      <Badge tone="info">Main</Badge>
                    )}
                  </div>
                </td>

                <td className="px-4 py-3 text-muted-foreground">
                  {formatAddress(branch)}
                  {branch.localityName && (
                    <span className="ml-1 text-xs">({branch.localityName})</span>
                  )}
                </td>

                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-2">
                    <LocationProvenanceBadge confidence={branch.locationConfidence} />
                    {canConfirmLocation &&
                      isLocationUnconfirmed(branch.locationConfidence) &&
                      onConfirmLocation && (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => onConfirmLocation(branch.id)}
                          data-testid={`branch-confirm-location-${branch.id}`}
                        >
                          Confirm location
                        </Button>
                      )}
                  </div>
                </td>

                <td className="px-4 py-3">
                  <Badge tone={branch.isActive ? 'success' : 'neutral'}>
                    {branch.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border bg-secondary/20">
          Branch PINs are never shown here.
        </p>
      </div>
    </section>
  )
}
