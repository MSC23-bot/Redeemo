'use client'

// Business Profile M2: the "View signed agreement" modal. Read-only - shows the
// accepted version/date/method (from profile.agreement, when signed) plus the
// canonical agreement text fetched fresh from
// GET /api/v1/merchant/onboarding/contract (the same read the onboarding contract
// step uses). No accept affordance here - accepting only ever happens through the
// onboarding contract step.
import { useQuery } from '@tanstack/react-query'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getContract } from '@/lib/api/onboarding'
import { formatDateLabel, signatureMethodPhrase } from '@/lib/business-profile/format'
import type { MerchantProfile } from '@/lib/api/profile'

export function AgreementModal({
  profile,
  onClose,
}: {
  profile: MerchantProfile
  onClose: () => void
}) {
  const contract = useQuery({
    queryKey: ['onboardingContract'],
    queryFn: getContract,
    staleTime: 5 * 60_000,
  })

  const agreement = profile.agreement ?? null
  const acceptedDate = formatDateLabel(agreement?.acceptedAt)

  return (
    <Dialog label="Merchant agreement" onClose={onClose} panelTestId="agreement-modal" scrimTestId="agreement-modal-scrim">
      <div className="max-h-[75vh] space-y-4 overflow-y-auto">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold text-foreground">Merchant agreement</h2>
          {agreement && acceptedDate ? (
            <p className="text-sm text-muted-foreground">
              Accepted version {agreement.acceptedVersion} on {acceptedDate}{' '}
              {signatureMethodPhrase(agreement.signatureMethod)}.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">You have not signed the merchant agreement yet.</p>
          )}
        </div>

        {contract.isLoading ? (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            Loading the agreement...
          </p>
        ) : contract.isError || !contract.data ? (
          <div role="alert" className="space-y-2">
            <p className="text-sm text-foreground">We could not load the agreement text.</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => contract.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <div
            className="whitespace-pre-wrap rounded-[10px] p-4 text-sm leading-relaxed text-foreground"
            style={{ background: 'var(--tint)' }}
            data-testid="agreement-text"
          >
            {contract.data.text}
          </div>
        )}

        <div className="flex justify-end">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
