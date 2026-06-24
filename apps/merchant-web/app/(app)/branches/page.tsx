'use client'

/**
 * Branches PR-1 F2: the merchant Branches overview page. Three summary cards
 * (Locations / Open right now / With Redeemo) and a branch table, all derived
 * from the single GET /merchant/branches list payload (no per-branch fetch). The
 * "With Redeemo" count is gated by the merchant-lifecycle guard: it is the true
 * active + MANUALLY_CONFIRMED total only when the merchant is Live, otherwise 0.
 *
 * Owner vs Branch Manager: the list is scoped server-side, so it shows only the
 * branches the caller is allowed to see. The "Add branch" CTA is now LIVE and
 * OWNER-only (PR-5 §6): it opens the create form. A Branch Manager sees no add
 * control (create/close are owner-only per D3 + the backend resolver).
 *
 * Privacy: the list row ships the AES-encrypted redemptionPin; this surface only
 * derives a set / not-set indicator from its presence and NEVER renders the value.
 */
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useBranches } from '@/lib/branches/useBranches'
import { useBranchCapability } from '@/lib/branches/useBranchCapability'
import { useSession } from '@/lib/auth/session'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'
import { deriveStatusPill, homeFor } from '@/lib/auth/lifecycle'
import { BranchesOverview } from '@/components/branches/BranchesOverview'

export default function BranchesPage() {
  const router = useRouter()
  const { isAuthenticated } = useSession()
  const branches = useBranches()
  const profile = useMerchantProfile(isAuthenticated)
  // PR-5 §6: gate the live "Add branch" CTA on the owner signal (create is OWNER-only
  // per D3). Only render the add control once the gate has SETTLED, so it does not flash
  // for a Branch Manager before the capability probe resolves.
  const { isOwner, ready } = useBranchCapability(isAuthenticated)

  // The single canonical merchant-lifecycle source (plan §1.1 naming trap, §3 F2):
  // the merchant is "Live" (on Redeemo) iff status === 'ACTIVE'. Anything else
  // (REGISTERED / PENDING_APPROVAL / INACTIVE / SUSPENDED / DELETED) means the
  // merchant is not on Redeemo, so the "With Redeemo" count is 0. NEVER 'APPROVED'.
  const merchantLive = profile.data ? homeFor(deriveStatusPill(profile.data)) === 'live' : false

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold text-foreground">Branches</h1>
          <p className="text-sm text-muted-foreground">
            Hours, amenities, contact and PIN save instantly. Name, address, images and closures go
            to Redeemo to review.
          </p>
        </div>
      </header>

      {branches.isLoading ? (
        <Card>
          <div role="status" aria-live="polite" className="px-6 text-sm text-muted-foreground">
            Loading your branches...
          </div>
        </Card>
      ) : branches.isError ? (
        <Card>
          <div role="alert" className="space-y-3 px-6">
            <p className="text-sm text-foreground">We could not load your branches.</p>
            <Button variant="secondary" onClick={() => branches.refetch()}>
              Try again
            </Button>
          </div>
        </Card>
      ) : (
        <BranchesOverview
          branches={branches.data ?? []}
          merchantLive={merchantLive}
          isOwner={ready && isOwner}
          onOpen={(id) => router.push(`/branches/${id}`)}
        />
      )}
    </div>
  )
}
