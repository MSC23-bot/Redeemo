'use client'
import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { StatusPill, type LifecycleState } from './StatusPill'
import { HOME_ITEM, visibleNavGroups, visiblePinnedItems, type NavItem, type ViewerRole } from './navItems'

/** '/' matches exactly; every other item highlights on itself + its subtree
 * (e.g. /branches/abc keeps Branches active). */
export function isNavItemActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

function NavRow({ item, active = false, collapsed = false, onNavigate }: {
  item: NavItem
  active?: boolean
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      style={{
        display: 'flex', alignItems: 'center',
        gap: collapsed ? 0 : 12,
        justifyContent: collapsed ? 'center' : undefined,
        padding: collapsed ? '11px 0' : '9px 12px',
        borderRadius: 10, textDecoration: 'none',
        fontWeight: active ? 700 : 500,
        color: item.soon ? '#6B7390' : active ? '#010C35' : '#455373',
        background: active ? '#FEF6F5' : 'transparent',
        boxShadow: active ? 'inset 3px 0 0 #010C35' : undefined,
        fontSize: 14,
      }}
    >
      <Icon size={18} />
      {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
      {!collapsed && item.soon && (
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6B7390', border: '1px solid #E5E7EB', borderRadius: 999, padding: '1px 6px' }}>Soon</span>
      )}
    </Link>
  )
}

/**
 * Left sidebar (shell wave).
 * - Active route highlighting via usePathname (prototype: tint bg + inset navy bar).
 * - Role-aware nav via visibleNavGroups (positive allowlist: OWNER/BM get the
 *   full nav, Grow group owner-only; STAFF, null and unknown roles get the
 *   least-privilege baseline). `canViewInsights` keeps its original fail-closed
 *   contract; backend authz remains the real boundary.
 * - `collapsed` renders the 72px icon-only rail (labels, group titles, badges and
 *   status text hidden; dot-only status pill).
 * - `onNavigate` lets the narrow drawer close itself when a nav item is tapped.
 */
export function Sidebar({
  status = 'setup' as LifecycleState,
  canViewInsights = false,
  role = null,
  collapsed = false,
  onNavigate,
}: {
  status?: LifecycleState
  canViewInsights?: boolean
  role?: ViewerRole
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const groups = visibleNavGroups(role, canViewInsights)
  const pinned = visiblePinnedItems()

  return (
    <nav aria-label="Primary" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: collapsed ? '18px 10px' : '18px 14px', height: '100%' }}>
      {/* Brand lockup */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : undefined, gap: collapsed ? 0 : 10, padding: collapsed ? 0 : '0 6px' }}>
        <Image src="/redeemo-r-mark.png" alt="Redeemo" width={34} height={34} />
        {!collapsed && (
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 15, color: '#010C35' }}>Redeemo</div>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#6B7390' }}>for Business</div>
          </div>
        )}
      </div>

      <div style={{ padding: collapsed ? 0 : '0 6px', display: 'flex', justifyContent: collapsed ? 'center' : undefined }}>
        <StatusPill state={status} dotOnly={collapsed} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <NavRow item={HOME_ITEM} active={isNavItemActive(pathname, HOME_ITEM.href)} collapsed={collapsed} onNavigate={onNavigate} />
      </div>

      {groups.map((group) => (
        <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#8089A4' }}>{group.title}</span>
              {group.tag && (
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#6B7390', background: '#F3F4F6', borderRadius: 999, padding: '1px 6px' }}>{group.tag}</span>
              )}
            </div>
          )}
          {group.items.map((item) => (
            <NavRow key={item.label} item={item} active={isNavItemActive(pathname, item.href)} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>
      ))}

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 12, borderTop: '1px solid #EEF1F4' }}>
        {pinned.map((item) => (
          <NavRow key={item.label} item={item} active={isNavItemActive(pathname, item.href)} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  )
}
