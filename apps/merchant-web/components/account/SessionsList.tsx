'use client'

import { Monitor, Smartphone, Tablet } from '@/lib/icons'
import { Badge } from '@/components/ui/badge'
import { formatSessionDeviceLabel, formatSessionLastActive } from '@/lib/account/sessionLabel'
import type { MerchantSession } from '@/lib/api/account'

// My Account "Where you are signed in" (§BP-ACC). Deliberately shows device +
// relative last-active ONLY - no location line. There is no geo-IP lookup
// anywhere in this codebase (the backend row carries `ipAddress`, not a city), so
// a location line here would have to be fabricated; the prototype's "Bristol,
// United Kingdom" is not reproduced.
function deviceIcon(userAgent: string) {
  if (/iPad/.test(userAgent) || /Tablet/.test(userAgent)) return Tablet
  if (/iPhone|Android/.test(userAgent)) return Smartphone
  return Monitor
}

export function SessionsList({ sessions }: { sessions: MerchantSession[] }) {
  if (sessions.length === 0) {
    return (
      <p className="px-6 text-sm text-muted-foreground" data-testid="sessions-empty">
        No active sign-ins found.
      </p>
    )
  }

  return (
    <ul className="space-y-2 px-6" data-testid="sessions-list">
      {sessions.map((session, i) => {
        const Icon = deviceIcon(session.userAgent)
        const label = formatSessionDeviceLabel(session, session.isCurrent)
        const lastActive = formatSessionLastActive(session.lastActiveAt, session.isCurrent)
        return (
          <li
            key={`${session.createdAt}-${i}`}
            className="flex items-center gap-3 rounded-[10px] border border-border px-3 py-2.5"
            data-testid="session-row"
            data-current={session.isCurrent ? 'true' : 'false'}
          >
            <Icon size={18} aria-hidden className="shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">{label}</p>
                {session.isCurrent ? <Badge variant="neutral">This device</Badge> : null}
              </div>
              <p className="text-xs text-muted-foreground">{lastActive}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
