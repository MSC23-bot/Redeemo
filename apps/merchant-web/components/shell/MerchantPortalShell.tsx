'use client'
import * as React from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

const NARROW = 820

export function MerchantPortalShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [isNarrow, setIsNarrow] = React.useState(false)

  React.useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < NARROW)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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
        <Sidebar />
      </aside>

      {showDrawer && (
        <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(1,12,53,0.38)' }} />
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar onMenu={() => setDrawerOpen((v) => !v)} isNarrow={isNarrow} />
        <main style={{ flex: 1, padding: isNarrow ? '20px 16px 88px' : '30px 40px 64px' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto' }}>{children}</div>
        </main>
      </div>
    </div>
  )
}
