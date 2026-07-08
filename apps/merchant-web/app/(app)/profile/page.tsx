'use client'

/**
 * Business Profile M2: the read-shell page. Mirrors the Branches detail page
 * pattern - the route owns the useMerchantProfile fetch + loading / error / success
 * states; the resolved-profile layout lives in <BusinessProfileScreen>.
 *
 * Role: the nav already hides "Business profile" from STAFF (FULL_NAV_ROLES in
 * components/shell/navItems.ts allowlists OWNER + BRANCH_MANAGER only). That is a
 * UX convenience, not a boundary - a STAFF viewer (or any future/unknown role) can
 * still reach `/profile` directly by URL. The Business Profile backend read
 * (`getMerchantProfile`) is intentionally MEMBER-READ (any active member can read
 * the merchant row), so the backend will not 403 here the way Insights does; the
 * role gate has to live client-side, on this page, fail-closed. This mirrors the
 * `canViewBusinessProfile` allowlist added server-side for the owner-PII fields
 * (`ownerContact` / `agreement`) - same allowlist, same fail-closed posture, now
 * also gating the WHOLE page rather than just those two fields, because the
 * Registered Details / Compliance cards on this screen are account-internal
 * information a STAFF viewer should not see by direct-URL access either.
 */
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LoadingStatus, SkeletonCard } from '@/components/ui/skeleton'
import { Lock } from '@/lib/icons'
import { useSession } from '@/lib/auth/session'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'
import { BusinessProfileScreen } from '@/components/business-profile/BusinessProfileScreen'

// Explicit ALLOWLIST (not `!== 'STAFF'`) so a future newly-added role FAILS
// CLOSED - it must be added here deliberately to gain access, never by default.
// Mirrors FULL_NAV_ROLES (components/shell/navItems.ts) and the backend
// `canViewBusinessProfile` gate (src/api/merchant/profile/service.ts).
const PRIVILEGED_ROLES = new Set(['OWNER', 'BRANCH_MANAGER'])

function BusinessProfileAccessRestricted() {
  return (
    <Card>
      <div
        data-testid="business-profile-access-restricted"
        role="status"
        className="flex flex-col items-start gap-3 px-6 py-2"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Lock size={22} aria-hidden />
        </span>
        <h2 className="text-lg font-semibold text-foreground">
          Business profile isn&apos;t available for your role
        </h2>
        <p className="max-w-[60ch] text-sm text-muted-foreground">
          Your business&apos;s registered details, contact and compliance information are visible to the
          account owner and branch managers. Your own tools live in Home and Redemptions; ask the account
          owner if you need something from here.
        </p>
      </div>
    </Card>
  )
}

export default function BusinessProfilePage() {
  const session = useSession()
  const profile = useMerchantProfile(session.isAuthenticated)
  const role = profile.data?.viewerCapabilities?.role ?? null
  const isPrivileged = role !== null && PRIVILEGED_ROLES.has(role)

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
        <LoadingStatus label="Loading your business profile...">
          <div className="space-y-6">
            <SkeletonCard lines={3} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SkeletonCard lines={3} />
              <SkeletonCard lines={3} />
            </div>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
        </LoadingStatus>
      ) : profile.isError || !profile.data ? (
        <Card>
          <div role="alert" className="space-y-3 px-6">
            <p className="text-sm text-foreground">We could not load your business profile.</p>
            <Button variant="secondary" onClick={() => profile.refetch()}>
              Try again
            </Button>
          </div>
        </Card>
      ) : !isPrivileged ? (
        <BusinessProfileAccessRestricted />
      ) : (
        <BusinessProfileScreen profile={profile.data} />
      )}
    </div>
  )
}
