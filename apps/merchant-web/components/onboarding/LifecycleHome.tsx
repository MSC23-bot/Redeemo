'use client'

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { LifecycleState } from '@/components/shell/StatusPill'
import type { OnboardingStatus } from '@/lib/api/onboarding'

// M2 F1: the non-hub lifecycle homes. `setup` and `changes` render the staircase
// hub (owned by the page); this component renders the READ-ONLY / live homes:
// submitted, in_review, suspended, rejected, live/live_new.
//
// IMPORTANT (D8c): the onboarding-status `comment` is shown ONLY on the rejected
// home (where it is the admin's not-approved reason). On submitted/in_review the
// comment is a system placeholder ("Merchant submitted for onboarding approval"),
// never an admin reason, so it is deliberately NOT shown.

interface LifecycleHomeProps {
  state: LifecycleState
  businessName: string
  status: OnboardingStatus | null
}

export function LifecycleHome({ state, businessName, status }: LifecycleHomeProps) {
  if (state === 'live' || state === 'live_new') {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold text-foreground">Welcome back, {businessName}</h1>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Your business is live</CardTitle>
            <CardDescription>
              Customers can discover and redeem your vouchers. Your full dashboard with insights and management
              tools is coming soon.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (state === 'suspended') {
    return (
      <ReadOnlyNotice
        tone="danger"
        title="Your account is suspended"
        body="Your vouchers are paused and nothing is visible to customers right now. The portal is read only. Please contact Redeemo to put this right."
      />
    )
  }

  if (state === 'rejected') {
    // DESIGNED home (the prototype has none). Mirrors the suspended read-only +
    // reason + Contact Redeemo pattern. Copy is OWNER-REVIEW-NEEDED (no prototype
    // reference). Calm + factual; never invents specifics.
    const reason = status?.comment && status.comment.trim().length > 0 ? status.comment.trim() : null
    return (
      <ReadOnlyNotice
        tone="danger"
        title="Your business was not approved"
        body="After reviewing your business, our team was not able to approve it for Redeemo at this time. Your setup is saved and read only. If you think this is a mistake, or you would like to understand the decision, please contact Redeemo."
        reason={reason}
      />
    )
  }

  // submitted / in_review: the read-only "we are reviewing" home. The status
  // comment is intentionally NOT surfaced here.
  const reviewing = state === 'in_review'
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-foreground">
        {reviewing ? `Thanks, ${businessName}. Your business is in review.` : 'Submitted. We are reviewing your business.'}
      </h1>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">{reviewing ? 'Under review' : 'Submitted for review'}</CardTitle>
          <CardDescription>
            {reviewing
              ? 'An adviser is looking at your business now, usually within two working days. We will email you the moment there is news. Your setup is locked while we review so nothing changes underneath us.'
              : 'Your business is in the queue. We check most businesses within two working days and will email you the moment there is news. Your setup is locked while we review.'}
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

function ReadOnlyNotice({
  tone,
  title,
  body,
  reason,
}: {
  tone: 'danger'
  title: string
  body: string
  reason?: string | null
}) {
  const accent = tone === 'danger' ? '#B91C1C' : '#B45309'
  const tint = tone === 'danger' ? '#FEECEC' : '#FEF6EC'
  const border = tone === 'danger' ? '#F4C7C7' : '#F3D8AE'
  return (
    <div className="space-y-6">
      <div role="status" className="rounded-[16px] p-5" style={{ background: tint, border: `1px solid ${border}` }}>
        <div className="flex items-start gap-3">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke={accent}
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          >
            <path d="M12 3.5 21.5 20H2.5ZM12 10v4M12 17.6h.01" />
          </svg>
          <div className="flex-1">
            <div className="text-base font-bold" style={{ color: accent }}>
              {title}
            </div>
            <p className="mt-1 max-w-[70ch] text-sm leading-relaxed" style={{ color: '#6B5050' }}>
              {body}
            </p>
            {reason ? (
              <div
                className="mt-3 rounded-[11px] bg-white p-3 text-[13px] leading-relaxed text-[#1F2A4A]"
                style={{ border: `1px solid ${border}` }}
              >
                <span className="font-bold text-[#010C35]">What the team said: </span>
                {reason}
              </div>
            ) : null}
            {/* Interim mailto affordance (owner-approved merchants@redeemo.co.uk per the
                D-F email decision) pending the real support-model decision. `role="button"`
                keeps this affordance discoverable via getByRole('button', ...) the same way
                the previous inert <button> was, since the visual treatment and surrounding
                copy are unchanged - only the element (and its functionality) changed. */}
            <a
              href="mailto:merchants@redeemo.co.uk"
              role="button"
              className="mt-3.5 inline-flex h-9 items-center rounded-[10px] border bg-white px-4 text-[13px] font-bold"
              style={{ borderColor: accent, color: accent }}
            >
              Contact Redeemo
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
