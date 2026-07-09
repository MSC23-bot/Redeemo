/**
 * LocationTrustPanel — the at-a-glance location provenance panel for one branch
 * on the admin approval screen.
 *
 * Branch Location Trust Slice 2 (spec 2026-07-09 §2.4). Shows the resolved
 * address, the provenance badge, the pin coordinates, and an "Open in Google
 * Maps" external link. For a NEEDS_REVIEW branch it also shows the staged Google
 * suggestion (the suggested pin vs the current postcode-centroid pin) with the
 * cross-check-failed framing, so an admin can judge and act in one glance.
 *
 * NO embedded map: the admin CSP (default-src 'self') blocks external map
 * iframes/tiles, so the "pin" is shown as coordinates + an external Google Maps
 * link (new-tab navigation, allowed by CSP). No maps SDK / API key.
 *
 * The correction path is the EXISTING confirmBranchLocation flow: this panel
 * deep-links to it via onCorrectLocation; it never re-enters location data.
 */
import { ExternalLink, MapPin, AlertTriangle } from 'lucide-react'
import { LocationProvenanceBadge, isLocationTrusted } from '@/features/shared/locationProvenance'
import { Button } from '@/components/ui/button'
import type { ReviewBranch } from '@/lib/api/review'

interface LocationTrustPanelProps {
  branch: ReviewBranch
  /** Whether the admin holds branch:confirm-location (UI gating only). */
  canCorrectLocation?: boolean
  /** Deep-link to the existing confirm-location correction flow for this branch. */
  onCorrectLocation?: (branchId: string) => void
}

function formatAddress(branch: ReviewBranch): string {
  return [branch.addressLine1, branch.addressLine2, branch.city, branch.postcode]
    .filter(Boolean)
    .join(', ')
}

function formatCoord(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

/**
 * Short, factual line telling the reviewer WHICH staged suggestion they are
 * seeing. `pending_edit` is the change an admin is about to approve (it wins over
 * the audit records); `branch_created_audit` is the create-time suggestion;
 * `branch_updated_audit` came with a draft-window direct address edit (the lane
 * that stamps NEEDS_REVIEW immediately on a failed cross-check). Branch Location
 * Trust Slice 3: `merchant_pin_drop` is a merchant self-set map pin that landed
 * OUTSIDE their postcode area (there is no Google place).
 */
function suggestionSourceLine(
  source: 'pending_edit' | 'branch_created_audit' | 'branch_updated_audit' | 'merchant_pin_drop',
): string {
  if (source === 'pending_edit') return "Source: staged with the merchant's pending edit request."
  if (source === 'branch_updated_audit') return 'Source: staged with a merchant address edit (draft window).'
  if (source === 'merchant_pin_drop') return 'Source: a merchant-set map pin that landed outside the postcode area.'
  return 'Source: staged when the branch was created.'
}

/** External Google Maps deep-link for a coordinate pair (opens in a new tab). */
function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

function OpenInMaps({ lat, lng, testId }: { lat: number; lng: number; testId: string }) {
  return (
    <a
      href={googleMapsUrl(lat, lng)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      data-testid={testId}
    >
      Open in Google Maps
      <ExternalLink className="size-3" aria-hidden="true" />
    </a>
  )
}

export function LocationTrustPanel({
  branch,
  canCorrectLocation = false,
  onCorrectLocation,
}: LocationTrustPanelProps) {
  const needsReview = branch.locationConfidence === 'NEEDS_REVIEW'
  const trusted = isLocationTrusted(branch.locationConfidence)
  const hasCoords = branch.latitude != null && branch.longitude != null
  const suggestion = branch.locationSuggestion

  return (
    <section
      className="rounded-lg border border-border bg-card p-4"
      data-testid={`location-trust-panel-${branch.id}`}
      aria-label={`Location provenance for ${branch.name}`}
    >
      {/* Header: branch name + provenance badge */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium text-foreground truncate">{branch.name}</span>
          {branch.isMainBranch && (
            <span className="text-xs text-muted-foreground">(main branch)</span>
          )}
        </div>
        <LocationProvenanceBadge confidence={branch.locationConfidence} />
      </div>

      {/* Resolved address */}
      <p className="mt-2 text-sm text-muted-foreground">{formatAddress(branch)}</p>

      {/* Pin coordinates + external map link (the "pin" without an embedded map) */}
      {hasCoords ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono text-xs text-foreground" data-testid={`location-coords-${branch.id}`}>
            {formatCoord(branch.latitude as number, branch.longitude as number)}
          </span>
          <OpenInMaps
            lat={branch.latitude as number}
            lng={branch.longitude as number}
            testId={`location-open-maps-${branch.id}`}
          />
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground" data-testid={`location-no-coords-${branch.id}`}>
          No precise pin yet; the branch uses its postcode-area centroid.
        </p>
      )}

      {/* NEEDS_REVIEW: the staged Google suggestion vs the current centroid. */}
      {needsReview && (
        <div
          className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3"
          data-testid={`location-needs-review-${branch.id}`}
        >
          <p className="flex items-start gap-1.5 text-xs font-medium text-amber-800">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {suggestion?.source === 'merchant_pin_drop'
                ? "The merchant's map pin landed outside their entered postcode area; this branch stayed on its postcode-area centroid and is queued for review."
                : "Google's pin did not cross-check against the entered postcode; this branch stayed on its postcode-area centroid and is queued for review."}
            </span>
          </p>
          {suggestion ? (
            <>
            <dl className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-[auto_1fr] sm:gap-x-3">
              <dt className="text-muted-foreground">Current (centroid)</dt>
              <dd className="font-mono text-foreground">
                {hasCoords
                  ? formatCoord(branch.latitude as number, branch.longitude as number)
                  : 'unresolved'}
              </dd>
              <dt className="text-muted-foreground">
                {suggestion.source === 'merchant_pin_drop' ? 'Suggested (merchant pin)' : 'Suggested (Google)'}
              </dt>
              <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-foreground" data-testid={`location-suggestion-coords-${branch.id}`}>
                  {formatCoord(suggestion.latitude, suggestion.longitude)}
                </span>
                <OpenInMaps
                  lat={suggestion.latitude}
                  lng={suggestion.longitude}
                  testId={`location-suggestion-open-maps-${branch.id}`}
                />
              </dd>
              {suggestion.postcode && (
                <>
                  <dt className="text-muted-foreground">
                    {suggestion.source === 'merchant_pin_drop' ? 'Entered postcode' : 'Google postcode'}
                  </dt>
                  <dd className="font-mono text-foreground">{suggestion.postcode}</dd>
                </>
              )}
            </dl>
            <p
              className="mt-1.5 text-xs text-muted-foreground"
              data-testid={`location-suggestion-source-${branch.id}`}
            >
              {suggestionSourceLine(suggestion.source)}
            </p>
            </>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              No staged Google suggestion is on file for this branch.
            </p>
          )}
        </div>
      )}

      {/* Correction path: deep-link to the EXISTING confirm-location flow. */}
      {canCorrectLocation && onCorrectLocation && (
        <div className="mt-3">
          <Button
            type="button"
            variant={trusted ? 'outline' : 'default'}
            size="sm"
            onClick={() => onCorrectLocation(branch.id)}
            data-testid={`location-correct-${branch.id}`}
          >
            {trusted ? 'Adjust location' : 'Confirm location'}
          </Button>
        </div>
      )}
    </section>
  )
}
