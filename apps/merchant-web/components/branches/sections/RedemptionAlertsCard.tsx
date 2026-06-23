'use client'

// Branches PR-1 F13: the Redemption alerts card (prototype 04). Per the plan, this card
// is ALWAYS VISIBLE so the surface matches the prototype, but EVERY control is a
// DISABLED locked affordance: per-branch alerts + the recipient model ship in PR-7. It
// performs NO network write.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Bell } from '@/lib/icons'
import { LockedAffordance } from '@/components/branches/LockedAffordance'

export function RedemptionAlertsCard({ isOwner }: { isOwner: boolean }) {
  return (
    <Card className="gap-4" data-testid="branch-alerts-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6">
        <div className="flex items-center gap-2">
          <Bell size={16} aria-hidden style={{ color: 'var(--text-tertiary)' }} />
          <h2 className="font-display text-lg font-semibold text-foreground">Redemption alerts</h2>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}
        >
          Coming soon
        </span>
      </div>

      <div className="space-y-4 px-6">
        <p className="text-sm text-muted-foreground">
          When a voucher is redeemed here, everyone below gets an email so you can keep an eye on activity.
          The alert carries the time and the redemption code, never the customer personal details.
        </p>

        {/* The recipient management + add-recipient controls are locked for everyone in
            PR-1 (alerts ship in PR-7). The email field is disabled and the Add control
            is a locked affordance performing no network write. */}
        {isOwner ? (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Add an extra recipient
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <Input
                id="alerts-extra-recipient"
                type="email"
                placeholder="name@example.co.uk"
                disabled
                aria-label="Add an extra recipient email (coming in this Branches rollout)"
                className="max-w-xs"
              />
              <LockedAffordance label="Add" variant="gradient" />
            </div>
          </div>
        ) : (
          <LockedAffordance label="Manage alerts" />
        )}
      </div>
    </Card>
  )
}
