'use client'

import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSession } from '@/lib/auth/session'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'
import { deriveStatusPill, homeFor } from '@/lib/auth/lifecycle'
import type { LifecycleState } from '@/components/shell/StatusPill'

// M1 Slice 5: the lifecycle home. Two PLACEHOLDER homes (pre-live vs live) keyed off
// the derived StatusPill state. The real dashboard is a later phase.
const PRE_LIVE_COPY: Partial<Record<LifecycleState, { title: string; body: string }>> = {
  setup: {
    title: 'Finish setting up',
    body: 'Add your branches, vouchers, and contract to submit your business for approval. Your setup tools are coming soon.',
  },
  submitted: {
    title: 'Submitted for review',
    body: 'Your business has been submitted. Our team will review it and email you with the next steps.',
  },
  in_review: {
    title: 'Under review',
    body: 'Our team is reviewing your business. We will email you as soon as it is approved.',
  },
  changes: {
    title: 'Changes needed',
    body: 'We have asked for a few changes before your business can go live. Check your email for the details.',
  },
  suspended: {
    title: 'Account suspended',
    body: 'This account is currently suspended. Please contact support to resolve it.',
  },
}

export default function HomePage() {
  const session = useSession()
  const profile = useMerchantProfile(session.isAuthenticated)

  if (profile.isError) {
    return (
      <div className="space-y-6" role="alert">
        <h1 className="font-display text-2xl font-semibold text-foreground">Something went wrong</h1>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">We could not load your account</CardTitle>
            <CardDescription>
              There was a problem reaching Redeemo. Check your connection and try again.
            </CardDescription>
          </CardHeader>
        </Card>
        <Button onClick={() => profile.refetch()}>Try again</Button>
      </div>
    )
  }

  if (profile.isLoading || !profile.data) {
    return (
      <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
        Loading your account...
      </div>
    )
  }

  const state = deriveStatusPill(profile.data)
  const businessName = profile.data.businessName

  if (homeFor(state) === 'live') {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold text-foreground">Welcome back, {businessName}</h1>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Your business is live</CardTitle>
            <CardDescription>
              Customers can discover and redeem your vouchers. Your full dashboard with insights and management tools is
              coming soon.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const copy = PRE_LIVE_COPY[state] ?? PRE_LIVE_COPY.setup!
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-foreground">Welcome, {businessName}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">{copy.title}</CardTitle>
          <CardDescription>{copy.body}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
