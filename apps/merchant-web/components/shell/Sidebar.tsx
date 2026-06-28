import * as React from 'react'
import Image from 'next/image'
import { StatusPill, type LifecycleState } from './StatusPill'
import { HOME_ITEM, NAV_GROUPS, PINNED_ITEMS, type NavItem } from './navItems'

function NavRow({ item, active = false }: { item: NavItem; active?: boolean }) {
  const Icon = item.icon
  return (
    <a
      href={item.href}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px',
        borderRadius: 10, textDecoration: 'none',
        fontWeight: active ? 700 : 500,
        color: item.soon ? '#6B7390' : active ? '#010C35' : '#455373',
        background: active ? '#FEF6F5' : 'transparent',
        boxShadow: active ? 'inset 3px 0 0 #010C35' : undefined,
        fontSize: 14,
      }}
    >
      <Icon size={18} />
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.soon && (
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6B7390', border: '1px solid #E5E7EB', borderRadius: 999, padding: '1px 6px' }}>Soon</span>
      )}
    </a>
  )
}

/**
 * Left sidebar. `canViewInsights` hides ONLY the Insights & reports item for callers
 * who cannot view Insights (STAFF). It defaults to false so an absent signal FAILS
 * CLOSED (the item stays hidden until we positively know the viewer may see it); the
 * backend assertInsightsAccess remains the real boundary. Owner + Branch Manager nav
 * is unchanged.
 */
export function Sidebar({
  status = 'setup' as LifecycleState,
  canViewInsights = false,
}: {
  status?: LifecycleState
  canViewInsights?: boolean
}) {
  return (
    <nav aria-label="Primary" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '18px 14px', height: '100%' }}>
      {/* Brand lockup */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px' }}>
        <Image src="/redeemo-r-mark.png" alt="Redeemo" width={34} height={34} />
        <div style={{ lineHeight: 1.1 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 15, color: '#010C35' }}>Redeemo</div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#6B7390' }}>for Business</div>
        </div>
      </div>

      <div style={{ padding: '0 6px' }}><StatusPill state={status} /></div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <NavRow item={HOME_ITEM} />
      </div>

      {NAV_GROUPS.map((group) => {
        // Hide ONLY the Insights item for a viewer who cannot view Insights (STAFF);
        // every other item is untouched. A group emptied by the filter is dropped.
        const items = group.items.filter((item) => canViewInsights || item.href !== '/insights')
        if (items.length === 0) return null
        return (
          <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#8089A4' }}>{group.title}</span>
              {group.tag && (
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#6B7390', background: '#F3F4F6', borderRadius: 999, padding: '1px 6px' }}>{group.tag}</span>
              )}
            </div>
            {items.map((item) => <NavRow key={item.label} item={item} />)}
          </div>
        )
      })}

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 12, borderTop: '1px solid #EEF1F4' }}>
        {PINNED_ITEMS.map((item) => <NavRow key={item.label} item={item} />)}
      </div>
    </nav>
  )
}
