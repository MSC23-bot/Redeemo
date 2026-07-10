'use client'

/**
 * MerchantWorkspaceTabBar: the horizontal, URL-addressable tab bar for the
 * Merchant 360 workspace. Each tab is a `?tab=<key>` link on the current path,
 * so tabs are deep-linkable, back-button friendly, and shareable. The active
 * tab (already resolved by the page, with unknown values folded to Overview) is
 * marked with a rose underline + bold navy label and `aria-current`.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { M360_TABS } from './tabs'
import type { M360TabKey } from './tabs'

export function MerchantWorkspaceTabBar({ activeTab }: { activeTab: M360TabKey }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Merchant workspace sections"
      className="-mb-px flex gap-1 overflow-x-auto border-b border-border"
      data-testid="merchant-workspace-tabs"
    >
      {M360_TABS.map((tab) => {
        const isActive = tab.key === activeTab
        return (
          <Link
            key={tab.key}
            href={`${pathname}?tab=${tab.key}`}
            scroll={false}
            aria-current={isActive ? 'page' : undefined}
            data-testid={`workspace-tab-${tab.key}`}
            data-active={isActive ? 'true' : 'false'}
            className={cn(
              'whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? 'border-primary font-semibold text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
