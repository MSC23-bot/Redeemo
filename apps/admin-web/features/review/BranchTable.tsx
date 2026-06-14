/**
 * BranchTable — read-only list of merchant branches.
 *
 * Shows each branch's name, address, location confidence, and active/main
 * status. Branch PINs are never shown here.
 */
import { Badge } from '@/features/shared/Badge'
import { cn } from '@/lib/utils'
import type { ReviewBranch } from '@/lib/api/review'
import type { BadgeTone } from '@/features/shared/Badge'

interface BranchTableProps {
  branches: ReviewBranch[]
}

function locationConfidenceTone(confidence: string): BadgeTone {
  if (confidence === 'MANUALLY_CONFIRMED') return 'success'
  if (confidence === 'ADDRESS_GEOCODED') return 'info'
  if (confidence === 'POSTCODE_CENTROID') return 'warn'
  return 'neutral'
}

function locationConfidenceLabel(confidence: string): string {
  const map: Record<string, string> = {
    MANUALLY_CONFIRMED: 'Confirmed',
    ADDRESS_GEOCODED: 'Geocoded',
    POSTCODE_CENTROID: 'Postcode centroid',
    UNKNOWN: 'Unknown',
  }
  return map[confidence] ?? confidence
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

export function BranchTable({ branches }: BranchTableProps) {
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
      <h2 id="branches-heading" className="text-sm font-semibold text-foreground mb-3">
        Branches ({branches.length})
      </h2>

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
            {branches.map((branch, idx) => (
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
                  <Badge tone={locationConfidenceTone(branch.locationConfidence)}>
                    {locationConfidenceLabel(branch.locationConfidence)}
                  </Badge>
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
