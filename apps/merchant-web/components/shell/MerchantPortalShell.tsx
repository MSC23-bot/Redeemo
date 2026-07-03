'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { MobileTabBar } from './MobileTabBar'
import { ValidateDialogProvider } from '@/components/redemptions/ValidateDialogProvider'
import { useSession } from '@/lib/auth/session'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'
import { deriveStatusPill } from '@/lib/auth/lifecycle'

const NARROW = 820
// Below this the topbar goes compact (Validate label + account chevron hidden) -
// the prototype's second, lower threshold, independent of the sidebar mode.
const COMPACT = 720

export function MerchantPortalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const session = useSession()
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [isNarrow, setIsNarrow] = React.useState(false)
  const [isCompact, setIsCompact] = React.useState(false)
  // Wide-viewport icon-only rail (72px), toggled by the topbar hamburger.
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)

  React.useEffect(() => {
    const onResize = () => {
      setIsNarrow(window.innerWidth < NARROW)
      setIsCompact(window.innerWidth < COMPACT)
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Client route guard. The middleware only checks cookie PRESENCE; once the
  // refresh-on-mount settles, an unauthenticated visitor (no cookie, or a dead
  // session whose refresh failed) is sent to /sign-in. Closes the dead-session gap.
  React.useEffect(() => {
    if (session.ready && !session.isAuthenticated) router.replace('/sign-in')
  }, [session.ready, session.isAuthenticated, router])

  const profile = useMerchantProfile(session.isAuthenticated)
  const status = profile.data ? deriveStatusPill(profile.data) : 'setup'
  // Viewer capability hints (fail closed on absence): Insights nav needs a positive
  // canViewInsights; role/canManageVouchers/displayName shape the nav, the quick
  // actions and the account-menu identity. Backend asserts remain the boundary.
  const caps = profile.data?.viewerCapabilities
  const canViewInsights = caps?.canViewInsights === true
  const role = caps?.role ?? null
  const canManageVouchers = caps?.canManageVouchers === true
  const displayName = caps?.displayName ?? null

  // No-flash gate: hold until the session is known, and don't paint the portal for an
  // unauthenticated visitor (the effect above is redirecting them).
  if (!session.ready || !session.isAuthenticated) {
    return (
      <div role="status" aria-live="polite" style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#fff', color: '#6B7390', fontSize: 14 }}>
        Loading...
      </div>
    )
  }

  const showDrawer = isNarrow && drawerOpen
  const collapsed = !isNarrow && sidebarCollapsed

  // Hamburger: drawer toggle on narrow, collapse toggle on wide (prototype).
  const handleMenu = () => {
    if (isNarrow) setDrawerOpen((v) => !v)
    else setSidebarCollapsed((v) => !v)
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#fff' }}>
      {/* Sidebar: fixed drawer on narrow, static (collapsible) column on wide */}
      <aside
        style={
          isNarrow
            ? { position: 'fixed', top: 0, left: 0, bottom: 0, width: 282, zIndex: 60, background: '#fff', borderRight: '1px solid #EEF1F4', transform: showDrawer ? 'translateX(0)' : 'translateX(-101%)', transition: 'transform .2s ease' }
            : { width: collapsed ? 72 : 262, flexShrink: 0, borderRight: '1px solid #EEF1F4', background: '#fff', transition: 'width .2s ease' }
        }
      >
        <Sidebar
          status={status}
          canViewInsights={canViewInsights}
          role={role}
          collapsed={collapsed}
          onNavigate={isNarrow ? () => setDrawerOpen(false) : undefined}
        />
      </aside>

      {showDrawer && (
        <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(1,12,53,0.38)' }} />
      )}

      <ValidateDialogProvider>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Topbar
            onMenu={handleMenu}
            isNarrow={isNarrow}
            isCompact={isCompact}
            businessName={session.businessName ?? profile.data?.businessName ?? null}
            displayName={displayName}
            role={role}
            canManageVouchers={canManageVouchers}
            onSignOut={session.signOut}
          />
          <main style={{ flex: 1, padding: isNarrow ? '20px 16px 88px' : '30px 40px 64px' }}>
            <div style={{ maxWidth: 1180, margin: '0 auto' }}>{children}</div>
          </main>
        </div>
      </ValidateDialogProvider>

      {isNarrow && <MobileTabBar role={role} canViewInsights={canViewInsights} />}
    </div>
  )
}
