'use client'
import * as React from 'react'
import { Menu, ScanLine, Grid3x3, Bell } from '@/lib/icons'
import { Button } from '@/components/ui/button'

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', color: '#455373', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </button>
  )
}

/**
 * Top bar. M0 renders placeholder slots only (no behaviour): Validate-a-code CTA,
 * quick actions, notifications bell, account avatar. The prototype-only View-as and
 * Demo switchers are intentionally NOT built (spec exclusion).
 *
 * isNarrow: when true, renders the hamburger toggle and a centred wordmark (spec §10
 * narrow top bar). When false (wide), neither the hamburger nor the centred wordmark
 * is rendered; the sidebar lockup is always visible on wide.
 */
export function Topbar({
  onMenu,
  isNarrow = false,
  businessName = null,
  onSignOut,
}: {
  onMenu: () => void
  isNarrow?: boolean
  businessName?: string | null
  onSignOut?: () => void
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const firstItemRef = React.useRef<HTMLButtonElement>(null)

  // Move focus into the menu when it opens (keyboard users land on the first item).
  React.useEffect(() => {
    if (menuOpen) firstItemRef.current?.focus()
  }, [menuOpen])

  // Close + optionally return focus to the trigger (Escape / outside-click dismissal).
  const closeMenu = React.useCallback((returnFocus: boolean) => {
    setMenuOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }, [])

  return (
    <header
      style={{
        position: 'sticky', top: 0, zIndex: 40, height: 64,
        display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px',
        background: 'rgba(255,255,255,0.86)', backdropFilter: 'saturate(160%) blur(8px)',
        borderBottom: '1px solid #EEF1F4',
      }}
    >
      {isNarrow && (
        <button type="button" aria-label="Toggle navigation" onClick={onMenu} style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', color: '#455373', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Menu size={18} />
        </button>
      )}
      {isNarrow ? (
        <span style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none', fontWeight: 700, fontSize: 15, color: '#010C35', letterSpacing: '-0.01em' }}>
          Redeemo for Business
        </span>
      ) : (
        <div style={{ flex: 1 }} />
      )}
      <Button variant="navy" size="default"><ScanLine size={16} /> Validate a code</Button>
      <IconButton label="Quick actions"><Grid3x3 size={18} /></IconButton>
      <IconButton label="Notifications"><Bell size={18} /></IconButton>
      <div style={{ position: 'relative' }}>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Account menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
          style={{ width: 38, height: 38, borderRadius: 999, border: '1px solid #E5E7EB', background: '#FEF0EE', color: '#E20C04', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
        >
          R
        </button>
        {menuOpen && (
          <>
            <div onClick={() => closeMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 45 }} />
            <div
              role="menu"
              aria-label="Account options"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  closeMenu(true)
                }
              }}
              style={{ position: 'absolute', right: 0, top: 46, zIndex: 50, minWidth: 184, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: 'var(--shadow-md)', padding: 8 }}
            >
              {businessName && (
                <div style={{ padding: '6px 10px 8px', fontSize: 13, fontWeight: 700, color: '#010C35', borderBottom: '1px solid #EEF1F4', marginBottom: 4 }}>{businessName}</div>
              )}
              <button
                ref={firstItemRef}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  onSignOut?.()
                }}
                style={{ width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: '#B91C1C', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
