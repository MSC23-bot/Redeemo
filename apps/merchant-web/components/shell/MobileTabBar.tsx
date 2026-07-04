'use client'

/**
 * Shell wave: the narrow-viewport bottom tab bar (prototype responsive spec).
 * Exactly the curated subset Home / Vouchers / Redemptions / Insights, filtered by
 * the same role/capability rules as the sidebar (STAFF loses Vouchers; Insights is
 * capability-gated). Everything else stays reachable via the drawer. Active tab is
 * brand rose; the shell adds 88px bottom content padding to clear this bar.
 */
import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { mobileTabItems, type ViewerRole } from './navItems'
import { isNavItemActive } from './Sidebar'

export function MobileTabBar({ role, canViewInsights }: { role: ViewerRole; canViewInsights: boolean }) {
  const pathname = usePathname()
  const tabs = mobileTabItems(role, canViewInsights)
  return (
    <nav
      aria-label="Quick navigation"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 45, height: 64,
        display: 'flex', alignItems: 'stretch',
        background: 'rgba(255,255,255,0.94)', backdropFilter: 'saturate(160%) blur(8px)',
        borderTop: '1px solid #EEF1F4',
      }}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon
        const active = isNavItemActive(pathname, tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 3, textDecoration: 'none',
              color: active ? '#E20C04' : '#9CA3AF',
            }}
          >
            <Icon size={21} />
            <span style={{ fontSize: 12, fontWeight: 700 }}>{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
