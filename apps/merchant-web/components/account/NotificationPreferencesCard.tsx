'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Info } from '@/lib/icons'

// My Account "Account and security" (email notification preferences, myaccount
// full-page prototype §3). STAGED HONESTLY: there is no notification-preference
// backend anywhere in this codebase, and production email is dark
// (EMAIL_ENABLED default-off). Every toggle below is rendered disabled and
// unchecked - it does NOT call a backend, does NOT persist anything, and does NOT
// imply any of these emails send today. "Security alerts" has no toggle at all
// (it mirrors the prototype's non-negotiable "Always on" state) but is likewise
// NOT wired to a live alerting channel yet - it is shown as the eventual floor,
// not a claim that it is live.
const ROWS = [
  {
    title: 'Approval outcomes',
    subtitle: 'When your business or a change is approved, or needs a few tweaks.',
  },
  {
    title: 'Voucher review results',
    subtitle: 'When a voucher you submitted is approved or sent back.',
  },
  {
    title: 'Redemption milestones',
    subtitle: 'Friendly nudges, like reaching your 100th redemption.',
  },
  {
    title: 'Document requests',
    subtitle: 'When Redeemo needs a document, or one we hold is due to expire.',
  },
  {
    title: 'News and offers from Redeemo',
    subtitle: 'Product updates, tips and the occasional newsletter.',
  },
] as const

export function NotificationPreferencesCard() {
  return (
    <Card className="gap-4" data-testid="notification-preferences-card">
      <div className="space-y-1 px-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Account and security</h2>
        <p className="text-sm text-muted-foreground">
          The bell in the top bar always shows these. This is just about which ones also reach you by email, at
          your login address.
        </p>
      </div>

      <div className="flex items-start gap-2 px-6 text-sm" role="status">
        <Info size={16} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          Email notifications are being switched on. These preferences will apply once they go live; nothing
          below sends an email yet.
        </p>
      </div>

      <div className="space-y-3 px-6">
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold text-foreground">Security alerts</p>
            <p className="max-w-[52ch] text-xs text-muted-foreground">
              New sign-ins, and any change to your email, phone or password. Always on, so you hear straight away
              if someone tries to take over your account.
            </p>
          </div>
          <Badge variant="neutral">Always on</Badge>
        </div>

        {ROWS.map((row) => (
          <div key={row.title} className="flex items-center justify-between gap-3 px-1 py-1">
            <div>
              <p className="text-sm font-semibold text-foreground">{row.title}</p>
              <p className="max-w-[52ch] text-xs text-muted-foreground">{row.subtitle}</p>
            </div>
            <Switch
              checked={false}
              onCheckedChange={() => {}}
              disabled
              label={`${row.title} (coming soon)`}
              id={`notif-${row.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            />
          </div>
        ))}
      </div>
    </Card>
  )
}
