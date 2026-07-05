'use client'

/**
 * Shell wave: the topbar Quick Actions launcher (prototype 332px popover).
 * Actions, gated by the viewer's own capabilities (UX hints only - the backend
 * asserts remain the boundary):
 *   1. Validate a code - always; opens the shared Validate dialog.
 *   2. Create a voucher - canManageVouchers only; routes to /vouchers?create=1.
 *   3. View a branch redemption PIN - OWNER only in this wave (backend PR-2 D3
 *      also admits an assigned BRANCH_MANAGER, but the branch page's PIN section
 *      renders for OWNER and assigned BMs since D-BM1; keep both surfaces aligned when the per-branch
 *      capability signal exists). Single branch: routes straight to its PIN
 *      section; multiple: expands an inline branch sub-picker. The PIN is NEVER
 *      revealed here - the destination is the guarded on-page PinCard
 *      (/branches/{id}#pin), which decrypts only on an explicit Reveal.
 *   4. Today's redemptions - always; routes to /redemptions?range=today.
 * Open state is controlled by the Topbar (mutual exclusivity across menus).
 */
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Grid3x3, ScanLine, Ticket, KeyRound, Clock, ChevronDown } from '@/lib/icons'
import { useValidateDialog } from '@/components/redemptions/validateDialogContext'
import { listBranches } from '@/lib/api/branch'
import { businessInitials } from './AccountMenu'

interface QuickActionsMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: string | null
  canManageVouchers: boolean
}

function ActionRow({
  icon, accent, tint, title, sub, chevron = false, onClick, itemRef,
}: {
  icon: React.ReactNode
  accent: string
  tint: string
  title: string
  sub: string
  chevron?: boolean
  onClick: () => void
  itemRef?: React.Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={itemRef}
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
        padding: '10px 11px', borderRadius: 12, border: 'none', background: 'transparent', cursor: 'pointer',
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 38, height: 38, borderRadius: 11, background: tint, color: accent, flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#010C35' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12, color: '#8089A4' }}>{sub}</span>
      </span>
      {chevron && <ChevronDown size={14} aria-hidden style={{ color: '#8089A4' }} />}
    </button>
  )
}

export function QuickActionsMenu({ open, onOpenChange, role, canManageVouchers }: QuickActionsMenuProps) {
  const router = useRouter()
  const { openValidate } = useValidateDialog()
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const firstItemRef = React.useRef<HTMLButtonElement>(null)
  const [pinPickerOpen, setPinPickerOpen] = React.useState(false)

  // D-BM1: the PIN row widens to assigned Branch Managers. Safe by chain: the
  // branch list below is scope-filtered server-side (a BM receives ONLY assigned
  // branches), every listed branch satisfies assertCanManageBranch for that BM,
  // and the reveal route itself stays server-guarded regardless. STAFF keeps no
  // PIN row and is server-denied in depth.
  const canPinRow = role === 'OWNER' || role === 'BRANCH_MANAGER'

  // Branch list only fetched while the popover is open for a PIN-capable
  // viewer (OWNER or an assigned BRANCH_MANAGER via canPinRow) (lazy; the
  // list endpoint is scope-safe server-side).
  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: listBranches,
    enabled: open && canPinRow,
    staleTime: 60_000,
  })
  // CLOSED branches are terminal/soft-deleted; everything else may carry a PIN.
  const branchRows = (branches.data ?? []).filter((b) => b.lifecycleStatus !== 'CLOSED')

  React.useEffect(() => {
    if (open) firstItemRef.current?.focus()
    else setPinPickerOpen(false)
  }, [open])

  const closeMenu = React.useCallback(
    (returnFocus: boolean) => {
      onOpenChange(false)
      setPinPickerOpen(false)
      if (returnFocus) triggerRef.current?.focus()
    },
    [onOpenChange],
  )

  function go(href: string) {
    closeMenu(false)
    router.push(href)
    // Same-page #pin jump: when the target branch page is ALREADY mounted,
    // pushing only changes the hash (no PinCard remount, so its mount-scroll
    // effect never re-runs, and pushState fires no hashchange). If the card is
    // in the DOM, scroll it directly after the navigation settles.
    if (href.includes('#pin')) {
      window.setTimeout(() => {
        document.getElementById('pin')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 150)
    }
  }

  function handlePinAction() {
    if (branchRows.length === 1) {
      go(`/branches/${branchRows[0]!.id}#pin`)
      return
    }
    setPinPickerOpen((v) => !v)
  }

  const multiBranch = branchRows.length > 1

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Quick actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        style={{
          width: 38, height: 38, borderRadius: 10, border: '1px solid #E5E7EB',
          background: '#fff', color: '#455373', display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}
      >
        <Grid3x3 size={18} />
      </button>

      {open && (
        <>
          <div onClick={() => closeMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 45 }} />
          <div
            role="menu"
            aria-label="Quick actions"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                closeMenu(true)
              }
            }}
            style={{
              position: 'absolute', right: 0, top: 46, zIndex: 50, width: 332,
              maxWidth: 'calc(100vw - 24px)', background: '#fff',
              border: '1px solid #E5E7EB', borderRadius: 18,
              boxShadow: '0 28px 70px -26px rgba(1,12,53,0.46)', overflow: 'hidden',
            }}
          >
            <div style={{ padding: '14px 17px 8px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: '#010C35' }}>Quick actions</div>
              <div style={{ fontSize: 11.5, color: '#9AA0B0' }}>Jump straight to what you do most</div>
            </div>

            <div style={{ padding: 7 }}>
              <ActionRow
                itemRef={firstItemRef}
                icon={<ScanLine size={18} />}
                accent="#010C35"
                tint="#EAEDF5"
                title="Validate a code"
                sub="Redeem a customer voucher in store"
                onClick={() => {
                  closeMenu(false)
                  openValidate()
                }}
              />
              {canManageVouchers && (
                <ActionRow
                  icon={<Ticket size={18} />}
                  accent="#E20C04"
                  tint="#FEF0EE"
                  title="Create a voucher"
                  sub="Build a new offer for customers"
                  onClick={() => go('/vouchers?create=1')}
                />
              )}
              {canPinRow && branchRows.length > 0 && (
                <ActionRow
                  icon={<KeyRound size={18} />}
                  accent="#198375"
                  tint="#E7F5F1"
                  title="View a branch redemption PIN"
                  sub={multiBranch ? 'Pick a branch to reveal its PIN' : 'Reveal your branch PIN'}
                  chevron={multiBranch}
                  onClick={handlePinAction}
                />
              )}
              <ActionRow
                icon={<Clock size={18} />}
                accent="#B45309"
                tint="#FBF1E4"
                title="Today's redemptions"
                sub={multiBranch ? 'See every branch redeemed today' : 'See what was redeemed today'}
                onClick={() => go('/redemptions?range=today')}
              />
            </div>

            {pinPickerOpen && multiBranch && (
              <div style={{ borderTop: '1px solid #F1ECE6', background: '#FCFBF9', padding: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 11px 4px' }}>
                  <KeyRound size={13} aria-hidden style={{ color: '#198375' }} />
                  <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.7, color: '#198375' }}>
                    Choose a branch to reveal its PIN
                  </span>
                </div>
                {branchRows.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    role="menuitem"
                    onClick={() => go(`/branches/${b.id}#pin`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                      padding: '8px 11px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 30, height: 30, borderRadius: 8, background: '#E7F5F1', color: '#198375',
                        fontWeight: 800, fontSize: 11, flexShrink: 0,
                      }}
                    >
                      {businessInitials(b.name)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: '#010C35', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
                      {b.city && <span style={{ display: 'block', fontSize: 11.5, color: '#8089A4' }}>{b.city}</span>}
                    </span>
                    <ChevronDown size={13} aria-hidden style={{ color: '#8089A4', transform: 'rotate(-90deg)' }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
