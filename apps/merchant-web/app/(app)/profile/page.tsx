'use client'

/**
 * Business Profile M2: the read-shell page. Mirrors the Branches detail page
 * pattern - the route owns the useMerchantProfile fetch + loading / error / success
 * states; the resolved-profile layout lives in <BusinessProfileScreen>.
 *
 * Role (M2): reachable by OWNER + BRANCH_MANAGER (STAFF is nav-excluded already at
 * the shell level - see components/shell nav filtering on viewerCapabilities). M2
 * is read-only for both roles, so there is no capability gate here; a role gate
 * only becomes relevant once M3/M4 add editing.
 */
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/auth/session'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'
import { BusinessProfileScreen } from '@/components/business-profile/BusinessProfileScreen'

export default function BusinessProfilePage() {
  const session = useSession()
  const profile = useMerchantProfile(session.isAuthenticated)

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold text-foreground">Business profile</h1>
        <p className="text-sm text-muted-foreground">
          Your business record and compliance. Your public identity is what customers see on Redeemo; your
          registered details, contact, documents and compliance are internal account information held for
          your account.
        </p>
      </header>

      {profile.isLoading ? (
        <Card>
          <div role="status" aria-live="polite" className="px-6 text-sm text-muted-foreground">
            Loading your business profile...
          </div>
        </Card>
      ) : profile.isError || !profile.data ? (
        <Card>
          <div role="alert" className="space-y-3 px-6">
            <p className="text-sm text-foreground">We could not load your business profile.</p>
            <Button variant="secondary" onClick={() => profile.refetch()}>
              Try again
            </Button>
          </div>
        </Card>
      ) : (
        <BusinessProfileScreen profile={profile.data} />
      )}
    </div>
  )
}
