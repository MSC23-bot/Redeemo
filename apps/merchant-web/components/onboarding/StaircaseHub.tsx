'use client'

import { useState } from 'react'
import { StepList } from '@/components/onboarding/StepList'
import { ChangesBanner } from '@/components/onboarding/ChangesBanner'
import { SubmitConfirmModal } from '@/components/onboarding/SubmitConfirmModal'
import { Button } from '@/components/ui/button'
import type { DerivedStaircase } from '@/lib/onboarding/stepState'
import type { OnboardingStatus } from '@/lib/api/onboarding'

// M2 F1: the guided onboarding staircase hub ("Get your business live"). Rendered
// for the `setup` and `changes` lifecycle states. In `changes` it leads with the
// dynamic changes-requested banner (D8c). The hub is the FIRST submit gate
// (enabled only at all_complete); the confirm modal carries the SECOND gate.

interface StaircaseHubProps {
  businessName: string
  staircase: DerivedStaircase
  state: 'setup' | 'changes'
  status: OnboardingStatus | null
  onNavigate: (href: string) => void
  onSubmit: () => void
  submitting: boolean
  submitError: string | null
}

export function StaircaseHub({
  businessName,
  staircase,
  state,
  status,
  onNavigate,
  onSubmit,
  submitting,
  submitError,
}: StaircaseHubProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[30px] font-semibold leading-tight tracking-tight text-[#010C35]">
          Welcome to Redeemo, {businessName}.
        </h1>
        <p className="mt-2.5 max-w-[62ch] text-[15px] leading-relaxed text-[#455373]">
          List your business for free and start bringing new customers through the door. Complete a few short
          steps and our team will review your business. Once we approve you, your business and vouchers appear to
          customers on the Redeemo app and website. Until then, nothing you set up is public.
        </p>
      </div>

      {state === 'changes' ? <ChangesBanner comment={status?.comment ?? null} /> : null}

      <div className="flex flex-wrap items-start gap-6">
        {/* Checklist (dominant). Below `sm` the fixed 420px min-width overflowed
            phone viewports (e.g. 375px) because the flex-wrap parent still tried
            to honour it before wrapping. `w-full` forces this section onto its
            own full-width row below `sm`, so the side column cleanly wraps under
            it instead of both columns being squeezed into one cramped row. At
            `sm` and above the original fixed-width two-column intent returns
            unchanged. */}
        <section className="w-full min-w-0 flex-[2] sm:w-auto sm:min-w-[420px] overflow-hidden rounded-[20px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(1,12,53,0.04),0_18px_44px_-28px_rgba(1,12,53,0.32)]">
          <div className="border-b border-[#F3ECE7] bg-[linear-gradient(180deg,#FFF9F5,#FFFFFF)] px-6 pb-5 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3.5">
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wide text-[#E84A00]">Your setup</div>
                <h2 className="mt-1 font-display text-[23px] font-semibold tracking-tight text-[#010C35]">
                  Get your business live
                </h2>
              </div>
              <div className="text-right">
                <div className="text-[15px] font-extrabold text-[#010C35]">
                  {staircase.doneCount} of {staircase.totalCount}
                </div>
                <div className="text-xs font-bold text-[#6B7390]">steps complete</div>
              </div>
            </div>
          </div>

          <div className="px-3 pb-3 pt-2">
            <StepList staircase={staircase} onNavigate={onNavigate} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-[#F3F4F6] px-6 pb-6 pt-4">
            <span className="text-[13px] text-[#6B7390]">
              Complete every step to submit your business for review.
            </span>
            <Button
              type="button"
              variant="gradient"
              disabled={!staircase.submitEnabled}
              onClick={() => setConfirmOpen(true)}
            >
              Submit for review
            </Button>
          </div>
        </section>

        {/* Side column: reassurance + locked teasers */}
        <div className="flex min-w-[288px] flex-1 flex-col gap-4">
          <div className="rounded-[18px] bg-[#010C35] p-5 text-white">
            <div className="flex items-center gap-2.5">
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 10.5h12v9H6ZM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
              </svg>
              <span className="text-[15px] font-bold">Nothing is public yet</span>
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed text-[#C4C9DE]">
              Customers cannot see your business, branches, or vouchers until our team approves you. Take your
              time and save as you go.
            </p>
          </div>

          <LockedTeaser
            title="Activity dashboard"
            body="See live redemptions, charts, and what is working. Unlocks the day you go live."
          />
          <LockedTeaser
            title="Performance and insights"
            body="Trends, top vouchers, and busiest branches, all anonymous. Unlocks when you go live."
          />
        </div>
      </div>

      {confirmOpen ? (
        <SubmitConfirmModal
          submitting={submitting}
          error={submitError}
          onClose={() => setConfirmOpen(false)}
          onConfirm={onSubmit}
        />
      ) : null}
    </div>
  )
}

function LockedTeaser({ title, body }: { title: string; body: string }) {
  return (
    <div className="relative overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white p-5">
      <div className="absolute right-3.5 top-3.5 inline-flex items-center gap-1.5 rounded-full bg-[#F3F4F6] px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide text-[#6B7390]">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#9CA3AF"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 10.5h12v9H6ZM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
        </svg>
        Locked
      </div>
      <div className="opacity-55 saturate-50">
        <div className="mt-1 text-[15px] font-bold text-[#010C35]">{title}</div>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[#6B7390]">{body}</p>
    </div>
  )
}
