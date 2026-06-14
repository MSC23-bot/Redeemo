/**
 * ProfileCard — read-only merchant profile details.
 *
 * Shows registered details: company number, VAT number, website,
 * contract dates. No edit controls.
 */
import type { ReviewMerchant } from '@/lib/api/review'

interface ProfileCardProps {
  merchant: ReviewMerchant
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="grid grid-cols-[180px_1fr] gap-2 py-2 border-b border-border last:border-0">
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide self-center">
        {label}
      </dt>
      <dd className="text-sm text-foreground break-all">{value}</dd>
    </div>
  )
}

export function ProfileCard({ merchant }: ProfileCardProps) {
  const contractStart = merchant.contractStartDate
    ? new Date(merchant.contractStartDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  const contractEnd = merchant.contractEndDate
    ? new Date(merchant.contractEndDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  const registeredSince = new Date(merchant.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <section aria-labelledby="profile-card-heading" data-testid="profile-card">
      <h2 id="profile-card-heading" className="text-sm font-semibold text-foreground mb-3">
        Business details
      </h2>

      <div className="rounded-lg border border-border bg-card px-4 py-1">
        <dl>
          <Row label="Company number" value={merchant.companyNumber} />
          <Row label="VAT number" value={merchant.vatNumber} />
          <Row label="Website" value={merchant.websiteUrl} />
          <Row label="Onboarding step" value={merchant.onboardingStep} />
          <Row label="Registered since" value={registeredSince} />
          <Row label="Contract start" value={contractStart} />
          <Row label="Contract end" value={contractEnd} />
        </dl>

        {!merchant.companyNumber && !merchant.vatNumber && !merchant.websiteUrl && (
          <p className="py-4 text-sm text-muted-foreground italic">
            No additional details provided.
          </p>
        )}
      </div>
    </section>
  )
}
