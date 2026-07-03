'use client'

/**
 * Shell wave: the topbar account menu (prototype + blueprint §2.2/§13.4).
 * - Identity header: gradient avatar with the business initials, business name,
 *   and a "person · role" sub-line from viewerCapabilities (self-identity only).
 * - Items: My account (/account), Business profile (/profile, hidden for STAFF -
 *   mirrors the prototype routeAllowed('profile') gate), Help & support (/help).
 * - "Log out" opens the CONFIRMATION dialog (blueprint §13.4: shared-device
 *   safety) - it never signs out directly. Confirm calls onSignOut.
 * Open state is controlled by the Topbar so the topbar menus stay mutually
 * exclusive.
 */
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Settings, Building2, LifeBuoy, LogOut } from '@/lib/icons'
import { Dialog } from '@/components/ui/dialog'

export function businessInitials(name: string | null | undefined): string {
  if (!name) return 'R'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((p) => p[0]!.toUpperCase())
  return letters.join('') || 'R'
}

export function roleLabel(role: string | null | undefined): string | null {
  if (role === 'OWNER') return 'Owner'
  if (role === 'BRANCH_MANAGER') return 'Branch manager'
  if (role === 'STAFF') return 'Staff'
  return null
}

interface AccountMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  businessName: string | null
  displayName: string | null
  role: string | null
  onSignOut?: () => void
  /** Hides the trailing chevron below the 720px topbar-compact threshold. */
  compact?: boolean
}

const ITEM_STYLE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
  padding: '9px 11px', borderRadius: 9, border: 'none', background: 'transparent',
  color: '#1F2A4A', fontWeight: 600, fontSize: 14, cursor: 'pointer',
}

export function AccountMenu({
  open,
  onOpenChange,
  businessName,
  displayName,
  role,
  onSignOut,
  compact = false,
}: AccountMenuProps) {
  const router = useRouter()
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const firstItemRef = React.useRef<HTMLButtonElement>(null)
  const [confirmingLogout, setConfirmingLogout] = React.useState(false)

  React.useEffect(() => {
    if (open) firstItemRef.current?.focus()
  }, [open])

  const closeMenu = React.useCallback(
    (returnFocus: boolean) => {
      onOpenChange(false)
      if (returnFocus) triggerRef.current?.focus()
    },
    [onOpenChange],
  )

  function go(href: string) {
    closeMenu(false)
    router.push(href)
  }

  const initials = businessInitials(businessName)
  const label = roleLabel(role)
  const showBusinessProfile = role !== 'STAFF'

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 38, padding: '3px 4px', borderRadius: 10,
          border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer',
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: 8, background: '#FEF0EE',
            color: '#E20C04', fontWeight: 800, fontSize: 12,
          }}
        >
          {initials}
        </span>
        {!compact && <ChevronDown size={14} aria-hidden />}
      </button>

      {open && (
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
            style={{
              position: 'absolute', right: 0, top: 46, zIndex: 50, width: 268,
              maxWidth: 'calc(100vw - 24px)', background: '#fff',
              border: '1px solid #E5E7EB', borderRadius: 16,
              boxShadow: '0 24px 60px -24px rgba(1,12,53,0.4)', overflow: 'hidden',
            }}
          >
            {/* Identity header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '15px 16px', background: '#FFF9F5', borderBottom: '1px solid #F3F4F6' }}>
              <span
                aria-hidden
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  background: 'linear-gradient(135deg,#E20C04,#E84A00)',
                  color: '#fff', fontWeight: 800, fontSize: 14,
                }}
              >
                {initials}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#010C35', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {businessName ?? 'Your business'}
                </div>
                {(displayName || label) && (
                  <div style={{ fontSize: 12, color: '#455373', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {displayName && <span style={{ fontWeight: 700, color: '#1F2A4A' }}>{displayName}</span>}
                    {displayName && label && ' · '}
                    {label}
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: 7 }}>
              <button ref={firstItemRef} type="button" role="menuitem" onClick={() => go('/account')} style={ITEM_STYLE}>
                <Settings size={17} aria-hidden /> My account
              </button>
              {showBusinessProfile && (
                <button type="button" role="menuitem" onClick={() => go('/profile')} style={ITEM_STYLE}>
                  <Building2 size={17} aria-hidden /> Business profile
                </button>
              )}
              <button type="button" role="menuitem" onClick={() => go('/help')} style={ITEM_STYLE}>
                <LifeBuoy size={17} aria-hidden /> Help & support
              </button>
            </div>

            <div style={{ padding: 7, borderTop: '1px solid #F3F4F6' }}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpenChange(false)
                  setConfirmingLogout(true)
                }}
                style={{ ...ITEM_STYLE, color: '#B91C1C', fontWeight: 700 }}
              >
                <LogOut size={17} aria-hidden />
                Log out
              </button>
            </div>
          </div>
        </>
      )}

      {confirmingLogout && (
        <Dialog label="Log out of Redeemo for Business?" onClose={() => setConfirmingLogout(false)} panelTestId="logout-confirm">
          <div style={{ maxWidth: 380, padding: '26px 26px 22px', textAlign: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#010C35', fontFamily: 'var(--font-body)' }}>
              Log out of Redeemo for Business?
            </h2>
            <p style={{ margin: '10px 0 0', fontSize: 14, color: '#455373' }}>
              You will need your email and password to sign back in. This is handy on a shared till.
            </p>
            <div style={{ display: 'flex', gap: 11, marginTop: 28 }}>
              <button
                type="button"
                onClick={() => setConfirmingLogout(false)}
                style={{ flex: 1, height: 46, borderRadius: 12, border: '1px solid #D1D5DB', background: '#fff', color: '#010C35', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                Stay logged in
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingLogout(false)
                  onSignOut?.()
                }}
                style={{ flex: 1, height: 46, borderRadius: 12, border: 'none', background: '#B91C1C', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                Log out
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
