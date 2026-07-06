'use client'

import * as React from 'react'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Info, Mail } from '@/lib/icons'

// My Account "Activity and reports" (myaccount full-page prototype §4). STAGED
// HONESTLY: there is no monthly-report or recipient-list backend anywhere in this
// codebase, and production email is dark. The toggle and the recipient input are
// both disabled and neither calls a backend - the recipient field is inert (typed
// text is never sent anywhere), matching the instruction to not wire this UI to an
// absent backend or imply reports send today.
export function ActivityReportsCard() {
  const [draftRecipient, setDraftRecipient] = React.useState('')

  return (
    <Card className="gap-4" data-testid="activity-reports-card">
      <div className="space-y-1 px-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Activity and reports</h2>
        <p className="text-sm text-muted-foreground">
          Emails about how your business is doing. You receive these for what your access covers. Real time
          redemption alerts live on each branch, set who gets them under Branches.
        </p>
      </div>

      <div className="flex items-start gap-2 px-6 text-sm" role="status">
        <Info size={16} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          Email notifications are being switched on. This report will start sending once they go live; nothing
          below sends an email yet.
        </p>
      </div>

      <div className="space-y-4 px-6">
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border px-3 py-2.5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">Monthly performance report</p>
              <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6B7390]">
                For your whole business
              </span>
            </div>
            <p className="max-w-[52ch] text-xs text-muted-foreground">
              A monthly summary of how your vouchers are doing: redemptions, value delivered, customers, and your
              top vouchers and branches.
            </p>
          </div>
          <Switch checked={false} onCheckedChange={() => {}} disabled label="Monthly performance report (coming soon)" id="monthly-report-toggle" />
        </div>

        <div className="space-y-2 rounded-[10px] border border-dashed border-border px-3 py-3">
          <div className="flex items-center gap-2">
            <Mail size={14} aria-hidden className="text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Also send the monthly report to</p>
          </div>
          <p className="text-xs text-muted-foreground">
            For someone who does not use the portal, for example your accountant. They receive the monthly
            report only.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Input
              type="email"
              value={draftRecipient}
              onChange={(e) => setDraftRecipient(e.target.value)}
              placeholder="name@example.co.uk"
              disabled
              aria-label="Additional monthly report recipient"
            />
            <Button type="button" variant="secondary" size="sm" disabled>
              Add
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
