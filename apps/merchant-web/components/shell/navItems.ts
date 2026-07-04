import { Home, Ticket, ScanLine, BarChart3, MapPin, Users, Building2, Megaphone, CreditCard, Settings, LifeBuoy } from '@/lib/icons'
import type { ComponentType } from 'react'

export interface NavItem { label: string; href: string; icon: ComponentType<{ size?: number }>; soon?: boolean }
export interface NavGroup { title?: string; tag?: string; items: NavItem[] }

/**
 * Shell wave: the full IA with real destinations (the former `#` dead links now
 * route to honest placeholder/teaser routes per the roadmap shell-wave rule:
 * destinations must not pretend to work, but must exist before they are linked).
 * Role visibility is applied by `visibleNavGroups` below, mirroring the prototype's
 * ROLE_ROUTES: STAFF = Home/Redemptions (+ pinned); BRANCH_MANAGER = everything
 * except the owner-only "Grow your business" group; OWNER = everything. Nav
 * visibility is a UX hint only - backend authz remains the boundary.
 */
export const HOME_ITEM: NavItem = { label: 'Home', href: '/', icon: Home }

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Vouchers & customers',
    items: [
      { label: 'Vouchers', href: '/vouchers', icon: Ticket },
      { label: 'Redemptions', href: '/redemptions', icon: ScanLine },
      { label: 'Insights & reports', href: '/insights', icon: BarChart3 },
    ],
  },
  {
    title: 'Locations & team',
    items: [
      { label: 'Branches', href: '/branches', icon: MapPin },
      { label: 'Staff & access', href: '/staff', icon: Users },
    ],
  },
  {
    // Documents is folded into Business profile (findings 2AH): no standalone item.
    title: 'Business',
    items: [{ label: 'Business profile', href: '/profile', icon: Building2 }],
  },
  {
    title: 'Grow your business',
    tag: 'Soon',
    items: [
      { label: 'Promote', href: '/promote', icon: Megaphone, soon: true },
      { label: 'Payments & billing', href: '/billing', icon: CreditCard, soon: true },
    ],
  },
]

export const PINNED_ITEMS: NavItem[] = [
  { label: 'My account', href: '/account', icon: Settings },
  { label: 'Help & support', href: '/help', icon: LifeBuoy },
]

/** The viewer's membership role as emitted by viewerCapabilities (string-loose so an
 * unknown/future role falls into the fail-closed baseline, never a wider view). */
export type ViewerRole = string | null

// Least-privilege baseline: what EVERY member may see regardless of role
// (Home, Redemptions, and the pinned My account / Help & support). This is also
// exactly the prototype's STAFF route set.
const BASELINE_HREFS = new Set(['/', '/redemptions', '/account', '/help'])
// Positive allowlist for the full management nav. An unresolved (null) or
// unknown/future role gets ONLY the baseline - wider affordances appear when
// the role is positively known (fail closed; backend authz stays the boundary).
const FULL_NAV_ROLES = new Set(['OWNER', 'BRANCH_MANAGER'])
const GROW_TITLE = 'Grow your business'

/**
 * Prototype ROLE_ROUTES filtering, fail-closed:
 * - OWNER: everything, including the owner-only Grow group.
 * - BRANCH_MANAGER: all standard groups; Grow hidden.
 * - STAFF, null (loading / backend field not deployed), or any unknown future
 *   role: the least-privilege baseline (Home + Redemptions; pinned items stay).
 * Insights visibility stays additionally driven by `canViewInsights`.
 */
export function visibleNavGroups(role: ViewerRole, canViewInsights: boolean): NavGroup[] {
  const fullNav = role !== null && FULL_NAV_ROLES.has(role)
  return NAV_GROUPS
    .filter((group) => group.title !== GROW_TITLE || role === 'OWNER')
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.href === '/insights' && !canViewInsights) return false
        if (!fullNav && !BASELINE_HREFS.has(item.href)) return false
        return true
      }),
    }))
    .filter((group) => group.items.length > 0)
}

/** Pinned items are role-universal in the prototype (My account + Help & support). */
export function visiblePinnedItems(): NavItem[] {
  return PINNED_ITEMS
}

/**
 * Narrow-viewport bottom tab bar (prototype responsive spec): Home, Vouchers,
 * Redemptions, Insights - filtered by the same fail-closed role/capability rules
 * (an unresolved/unknown role gets only the baseline tabs).
 */
export function mobileTabItems(role: ViewerRole, canViewInsights: boolean): NavItem[] {
  const fullNav = role !== null && FULL_NAV_ROLES.has(role)
  const tabs: NavItem[] = [
    HOME_ITEM,
    { label: 'Vouchers', href: '/vouchers', icon: Ticket },
    { label: 'Redemptions', href: '/redemptions', icon: ScanLine },
    { label: 'Insights', href: '/insights', icon: BarChart3 },
  ]
  return tabs.filter((t) => {
    if (t.href === '/insights' && !canViewInsights) return false
    if (!fullNav && !BASELINE_HREFS.has(t.href)) return false
    return true
  })
}
