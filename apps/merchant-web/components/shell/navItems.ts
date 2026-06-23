import { Home, Ticket, ScanLine, BarChart3, MapPin, Users, Building2, Megaphone, CreditCard, Settings, LifeBuoy } from '@/lib/icons'
import type { ComponentType } from 'react'

export interface NavItem { label: string; href: string; icon: ComponentType<{ size?: number }>; soon?: boolean }
export interface NavGroup { title?: string; tag?: string; items: NavItem[] }

/** Static IA for M0. Items render but do not route or gate (no auth/capability). */
export const HOME_ITEM: NavItem = { label: 'Home', href: '/', icon: Home }

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Vouchers & customers',
    items: [
      { label: 'Vouchers', href: '/vouchers', icon: Ticket },
      { label: 'Redemptions', href: '/redemptions', icon: ScanLine },
      { label: 'Insights & reports', href: '#', icon: BarChart3 },
    ],
  },
  {
    title: 'Locations & team',
    items: [
      { label: 'Branches', href: '#', icon: MapPin },
      { label: 'Staff & access', href: '/staff', icon: Users },
    ],
  },
  {
    // Documents is folded into Business profile (findings 2AH): no standalone item.
    title: 'Business',
    items: [{ label: 'Business profile', href: '#', icon: Building2 }],
  },
  {
    title: 'Grow your business',
    tag: 'Coming soon',
    items: [
      { label: 'Promote', href: '#', icon: Megaphone, soon: true },
      { label: 'Payments & billing', href: '#', icon: CreditCard, soon: true },
    ],
  },
]

export const PINNED_ITEMS: NavItem[] = [
  { label: 'My account', href: '#', icon: Settings },
  { label: 'Help & support', href: '#', icon: LifeBuoy },
]
