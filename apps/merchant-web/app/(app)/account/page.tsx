'use client'

/**
 * My Account (§BP-ACC): the read shell page. Mirrors the Business Profile page
 * pattern - the route owns the useMerchantAccount + useMerchantSessions fetches
 * and their loading/error states; the resolved data is handed to
 * <MyAccountScreen>. Available to ANY authenticated merchant admin (not
 * role-gated the way Business Profile is - My Account is the logged-in person's
 * own account, so there is no "wrong role" for it).
 */
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LoadingStatus, SkeletonCardList } from '@/components/ui/skeleton'
import { useSession } from '@/lib/auth/session'
import { useMerchantAccount } from '@/lib/account/useMerchantAccount'
import { useMerchantSessions } from '@/lib/account/useMerchantSessions'
import { MyAccountScreen } from '@/components/account/MyAccountScreen'

export default function MyAccountPage() {
  const session = useSession()
  const account = useMerchantAccount(session.isAuthenticated)
  const sessions = useMerchantSessions(session.isAuthenticated)

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold text-foreground">My account</h1>
        <p className="text-sm text-muted-foreground">
          Your personal account: your details, how you sign in, and the emails you get from Redeemo. Your
          business, branches and team each have their own home in the menu.
        </p>
      </header>

      {account.isLoading ? (
        <LoadingStatus label="Loading your account...">
          <SkeletonCardList count={4} lines={2} />
        </LoadingStatus>
      ) : account.isError || !account.data ? (
        <Card>
          <div role="alert" className="space-y-3 px-6">
            <p className="text-sm text-foreground">We could not load your account.</p>
            <Button variant="secondary" onClick={() => account.refetch()}>
              Try again
            </Button>
          </div>
        </Card>
      ) : (
        <MyAccountScreen
          account={account.data}
          businessName={session.businessName}
          sessions={sessions.data}
          sessionsLoading={sessions.isLoading}
          sessionsError={sessions.isError}
        />
      )}
    </div>
  )
}
