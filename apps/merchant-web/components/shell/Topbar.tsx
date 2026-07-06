'use client'
import * as React from 'react'
import { Menu, ScanLine } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { useValidateDialog } from '@/components/redemptions/validateDialogContext'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { AccountMenu } from './AccountMenu'
import { QuickActionsMenu } from './QuickActionsMenu'

type TopbarMenu = 'quick' | 'bell' | 'account' | null

/**
 * Top bar (shell wave, prototype-faithful):
 * - The hamburger is ALWAYS rendered: on wide it collapses/expands the sidebar
 *   (72px icon rail), on narrow it toggles the drawer (the shell decides via onMenu).
 * - Validate-a-code stays enabled in every lifecycle (suspended surfaces inside the
 *   dialog as "Validation paused" - prototype behaviour); its label collapses to
 *   icon-only below the 720px compact threshold (isCompact).
 * - Quick Actions launcher + account menu + notification bell are mutually
 *   exclusive (opening one closes the others).
 */
export function Topbar({
  onMenu,
  isNarrow = false,
  isCompact = false,
  businessName = null,
  displayName = null,
  role = null,
  canManageVouchers = false,
  onSignOut,
}: {
  onMenu: () => void
  isNarrow?: boolean
  isCompact?: boolean
  businessName?: string | null
  displayName?: string | null
  role?: string | null
  canManageVouchers?: boolean
  onSignOut?: () => void
}) {
  const [activeMenu, setActiveMenu] = React.useState<TopbarMenu>(null)
  const { openValidate } = useValidateDialog()

  const menuChange = (menu: Exclude<TopbarMenu, null>) => (open: boolean) =>
    setActiveMenu(open ? menu : null)

  return (
    <header
      style={{
        position: 'sticky', top: 0, zIndex: 40, height: 64,
        display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px',
        background: 'rgba(255,255,255,0.86)', backdropFilter: 'saturate(160%) blur(8px)',
        borderBottom: '1px solid #EEF1F4',
      }}
    >
      <button
        type="button"
        aria-label="Toggle navigation"
        onClick={onMenu}
        style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', color: '#455373', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
      >
        <Menu size={18} />
      </button>
      {isNarrow ? (
        <>
          {/* Centred title clipped to the middle band so it can never collide
              with the left hamburger / right controls on small phones. */}
          <span style={{ position: 'absolute', left: '30%', right: '30%', textAlign: 'center', pointerEvents: 'none', fontWeight: 700, fontSize: 15, color: '#010C35', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Redeemo for Business
          </span>
          <div style={{ flex: 1 }} />
        </>
      ) : (
        <div style={{ flex: 1 }} />
      )}
      <Button variant="gradient" size="default" onClick={openValidate} aria-label="Validate a code">
        <ScanLine size={16} />
        {!isCompact && 'Validate a code'}
      </Button>
      <QuickActionsMenu
        open={activeMenu === 'quick'}
        onOpenChange={menuChange('quick')}
        role={role}
        canManageVouchers={canManageVouchers}
      />
      <NotificationBell open={activeMenu === 'bell'} onOpenChange={menuChange('bell')} />
      <AccountMenu
        open={activeMenu === 'account'}
        onOpenChange={menuChange('account')}
        businessName={businessName}
        displayName={displayName}
        role={role}
        onSignOut={onSignOut}
        compact={isCompact}
      />
    </header>
  )
}
