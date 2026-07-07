'use client'

import { YourDetailsCard } from './YourDetailsCard'
import { LoginSecurityCard } from './LoginSecurityCard'
import { NotificationPreferencesCard } from './NotificationPreferencesCard'
import { ActivityReportsCard } from './ActivityReportsCard'
import type { MerchantAccount, MerchantSession } from '@/lib/api/account'

// My Account (§BP-ACC) read shell orchestrator. Mirrors BusinessProfileScreen: the
// route owns the fetches (account + sessions) and their loading/error states; this
// component just lays out the 4 prototype sections in order. Available to ANY
// authenticated merchant admin - this is the logged-in PERSON'S own account, not
// role-gated like Business Profile.
export function MyAccountScreen({
  account,
  businessName,
  sessions,
  sessionsLoading,
  sessionsError,
}: {
  account: MerchantAccount
  businessName: string | null
  sessions: MerchantSession[] | undefined
  sessionsLoading: boolean
  sessionsError: boolean
}) {
  return (
    <div className="space-y-5" data-testid="my-account-screen">
      <YourDetailsCard account={account} businessName={businessName} />
      <LoginSecurityCard
        account={account}
        sessions={sessions}
        sessionsLoading={sessionsLoading}
        sessionsError={sessionsError}
      />
      <NotificationPreferencesCard />
      <ActivityReportsCard />
    </div>
  )
}
