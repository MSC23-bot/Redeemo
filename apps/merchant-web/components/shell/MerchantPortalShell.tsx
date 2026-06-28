'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { ValidateDialogProvider } from '@/components/redemptions/ValidateDialogProvider'
import { useSession } from '@/lib/auth/session'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'
import { deriveStatusPill } from '@/lib/auth/lifecycle'

const NARROW = 820

export function MerchantPortalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const session = useSession()
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [isNarrow, setIsNarrow] = React.useState(false)

  React.useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < NARROW)
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
  // Insights nav visibility. FAIL CLOSED: only show it when the profile positively
  // reports canViewInsights (absent during loading / pre-deploy -> hidden). The
  // backend assertInsightsAccess remains the real boundary.
  const canViewInsights = profile.data?.viewerCapabilities?.canViewInsights === true

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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#fff' }}>
      {/* Sidebar: fixed drawer on narrow, static column on wide */}
      <aside
        style={
          isNarrow
            ? { position: 'fixed', top: 0, left: 0, bottom: 0, width: 282, zIndex: 60, background: '#fff', borderRight: '1px solid #EEF1F4', transform: showDrawer ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform .2s ease' }
            : { width: 262, flexShrink: 0, borderRight: '1px solid #EEF1F4', background: '#fff' }
        }
      >
        <Sidebar status={status} canViewInsights={canViewInsights} />
      </aside>

      {showDrawer && (
        <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(1,12,53,0.38)' }} />
      )}

      <ValidateDialogProvider>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Topbar
            onMenu={() => setDrawerOpen((v) => !v)}
            isNarrow={isNarrow}
            businessName={session.businessName ?? profile.data?.businessName ?? null}
            onSignOut={session.signOut}
          />
          <main style={{ flex: 1, padding: isNarrow ? '20px 16px 88px' : '30px 40px 64px' }}>
            <div style={{ maxWidth: 1180, margin: '0 auto' }}>{children}</div>
          </main>
        </div>
      </ValidateDialogProvider>
    </div>
  )
}
