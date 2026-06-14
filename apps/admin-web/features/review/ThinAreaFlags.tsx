/**
 * ThinAreaFlags — callout card surfacing known data-model limitations.
 *
 * Highlights information the platform cannot yet capture or verify:
 * registered office, company type, sector evidence. These are platform limits,
 * not merchant failures.
 */
import type { ReviewThinAreas } from '@/lib/api/review'
import { cn } from '@/lib/utils'

interface ThinAreaFlagsProps {
  thinAreas: ReviewThinAreas
}

interface FlagItemProps {
  label: string
  description: string
  captured: boolean
}

function FlagItem({ label, description, captured }: FlagItemProps) {
  if (captured) return null

  return (
    <li className="flex items-start gap-3 py-2.5 border-b border-border/60 last:border-0">
      <span
        aria-hidden="true"
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-secondary border border-border text-[10px] text-muted-foreground mt-0.5"
      >
        -
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </li>
  )
}

export function ThinAreaFlags({ thinAreas }: ThinAreaFlagsProps) {
  const gaps = [
    {
      key: 'companyTypeCaptured' as const,
      label: 'Company type',
      description: 'Sole trader, limited company, partnership, etc. not yet captured in the platform.',
    },
    {
      key: 'registeredOfficeCaptured' as const,
      label: 'Registered office address',
      description: 'Registered office distinct from trading address is not yet captured.',
    },
    {
      key: 'sectorEvidenceCaptured' as const,
      label: 'Sector evidence',
      description: 'Trade body memberships, licences, or sector certifications are not yet captured.',
    },
    {
      key: 'companyNumberProvided' as const,
      label: 'Company number',
      description: 'No company registration number provided by the merchant.',
    },
    {
      key: 'vatNumberProvided' as const,
      label: 'VAT number',
      description: 'No VAT registration number provided by the merchant.',
    },
    {
      key: 'documentsUploaded' as const,
      label: 'Supporting documents',
      description: 'No identity or business documents have been uploaded.',
    },
  ]

  const activeGaps = gaps.filter((g) => !thinAreas[g.key])

  if (activeGaps.length === 0) {
    return (
      <section aria-labelledby="thin-areas-heading" data-testid="thin-area-flags">
        <h2 id="thin-areas-heading" className="text-sm font-semibold text-foreground mb-3">
          Known gaps in today's model
        </h2>
        {thinAreas.documentsGated === false && (
          <div
            className="mb-3 rounded-lg border border-border bg-secondary/20 px-4 py-3"
            data-testid="documents-not-gated-notice"
          >
            <p className="text-xs text-muted-foreground">
              Documents are not required by the current submission gate.
            </p>
          </div>
        )}
        <div className="rounded-lg border border-border bg-card px-4 py-4">
          <p className="text-sm text-muted-foreground">No gaps flagged for this submission.</p>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="thin-areas-heading" data-testid="thin-area-flags">
      <h2 id="thin-areas-heading" className="text-sm font-semibold text-foreground mb-3">
        Known gaps in today's model
      </h2>

      {thinAreas.documentsGated === false && (
        <div
          className="mb-3 rounded-lg border border-border bg-secondary/20 px-4 py-3"
          data-testid="documents-not-gated-notice"
        >
          <p className="text-xs text-muted-foreground">
            Documents are not required by the current submission gate.
          </p>
        </div>
      )}

      <div
        className={cn(
          'overflow-hidden rounded-lg border border-border bg-card'
        )}
      >
        <div className="px-4 py-3 bg-secondary/40 border-b border-border">
          <p className="text-xs text-muted-foreground">
            These are platform limits, not merchant failures.
          </p>
        </div>

        <ul role="list" className="px-4 py-1">
          {activeGaps.map((g) => (
            <FlagItem
              key={g.key}
              label={g.label}
              description={g.description}
              captured={thinAreas[g.key]}
            />
          ))}
        </ul>
      </div>
    </section>
  )
}
