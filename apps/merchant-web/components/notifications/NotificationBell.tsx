'use client'

/**
 * The topbar notification bell (M4 F2, restyled to the prototype in the shell wave).
 *
 * - An unread-count poll (45s, refetch on focus) drives a small count bubble
 *   (brand gradient), capped at "9+", hidden when 0.
 * - The popover follows the prototype: header "Notifications" + a summary line
 *   ("All caught up" / "N unread") with "Mark all as read" in the header ONLY when
 *   something is unread; a flat list of the 5 most recent (unread rows tinted
 *   #FFF7F3 with a rose dot); footer "See all notifications" -> /notifications.
 *   Grouping (New/Earlier) lives on the full view, not the popover.
 * - Open state can be CONTROLLED by the parent (open/onOpenChange) so the topbar
 *   menus stay mutually exclusive; uncontrolled falls back to internal state.
 * - Row click marks read, invalidates ['notifications'], closes, navigates to the
 *   resolved deep-link destination.
 *
 * Privacy: renders only title/body/type/sentAt/isRead from the curated API; no
 * recipient ids and no customer PII.
 */
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, ChevronDown } from '@/lib/icons'
import {
  getUnreadCount,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
} from '@/lib/api/notifications'
import { notificationTypeMeta } from '@/lib/notifications/typeMeta'
import { resolveNotificationDestination } from '@/lib/notifications/resolveDestination'
import { formatRelativeTime } from '@/lib/notifications/relativeTime'

const POLL_MS = 45_000
const RECENT_PAGE_SIZE = 5
const BRAND_RED = '#E20C04'

export function NotificationBell({
  open: controlledOpen,
  onOpenChange,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
} = {}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = React.useCallback(
    (next: boolean) => {
      setInternalOpen(next)
      onOpenChange?.(next)
    },
    [onOpenChange],
  )
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const firstItemRef = React.useRef<HTMLButtonElement>(null)

  const unread = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: getUnreadCount,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  })

  const recent = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: () => listNotifications({ pageSize: RECENT_PAGE_SIZE }),
    enabled: open,
    refetchInterval: POLL_MS,
  })

  // Move focus into the popover when it opens with at least one item (keyboard
  // users land on the first row). Mirrors the Topbar account-menu pattern.
  React.useEffect(() => {
    if (open) firstItemRef.current?.focus()
  }, [open, recent.data])

  const closePopover = React.useCallback(
    (returnFocus: boolean) => {
      setOpen(false)
      if (returnFocus) triggerRef.current?.focus()
    },
    [setOpen],
  )

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  function handleRowClick(n: Notification) {
    void markNotificationRead(n.id).finally(invalidate)
    const dest = resolveNotificationDestination(n.referenceType, n.referenceId, n.type)
    closePopover(false)
    router.push(dest.href)
  }

  function handleMarkAll() {
    void markAllNotificationsRead().finally(invalidate)
  }

  function handleSeeAll() {
    closePopover(false)
    router.push('/notifications')
  }

  const count = unread.data?.count ?? 0
  const badge = count > 9 ? '9+' : String(count)
  const items = recent.data?.notifications ?? []

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{
          position: 'relative',
          width: 38,
          height: 38,
          borderRadius: 10,
          border: '1px solid #E5E7EB',
          background: '#fff',
          color: '#455373',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <Bell size={18} />
        {count > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              borderRadius: 999,
              background: 'linear-gradient(135deg,#E20C04,#E84A00)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 800,
              lineHeight: '16px',
              textAlign: 'center',
              boxShadow: '0 0 0 2px #fff',
            }}
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            data-testid="notification-popover-scrim"
            onClick={() => closePopover(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 45 }}
          />
          <div
            role="menu"
            aria-label="Notifications"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                closePopover(true)
              }
            }}
            style={{
              position: 'absolute',
              right: 0,
              top: 46,
              zIndex: 50,
              width: 372,
              maxWidth: 'calc(100vw - 24px)',
              background: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: 18,
              boxShadow: '0 28px 70px -26px rgba(1,12,53,0.46)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 8,
                padding: '14px 17px 10px',
                borderBottom: '1px solid #EEF1F4',
              }}
            >
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: '#010C35' }}>
                  Notifications
                </div>
                <div style={{ fontSize: 11.5, color: '#9AA0B0' }}>
                  {count > 0 ? `${count} unread` : 'All caught up'}
                </div>
              </div>
              {count > 0 && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleMarkAll}
                  style={{ border: 'none', background: 'transparent', color: BRAND_RED, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0, marginTop: 2 }}
                >
                  Mark all as read
                </button>
              )}
            </div>

            <div style={{ maxHeight: 392, overflowY: 'auto' }}>
              {recent.isLoading ? (
                <div
                  role="status"
                  aria-live="polite"
                  style={{ padding: '20px 17px', fontSize: 13, color: '#6B7280' }}
                >
                  Loading notifications...
                </div>
              ) : recent.isError ? (
                <div role="alert" style={{ padding: '20px 17px', fontSize: 13, color: 'var(--danger)' }}>
                  We could not load your notifications.
                </div>
              ) : items.length === 0 ? (
                <div style={{ padding: '28px 17px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: '#010C35' }}>
                    You are all caught up
                  </div>
                  <div style={{ fontSize: 13, color: '#8089A4', marginTop: 4 }}>
                    New updates about your business, vouchers and redemptions will show here.
                  </div>
                </div>
              ) : (
                items.map((n, i) => {
                  const meta = notificationTypeMeta(n.type)
                  const Icon = meta.Icon
                  return (
                    <button
                      key={n.id}
                      ref={i === 0 ? firstItemRef : undefined}
                      type="button"
                      role="menuitem"
                      onClick={() => handleRowClick(n)}
                      style={{
                        display: 'flex',
                        gap: 10,
                        width: '100%',
                        textAlign: 'left',
                        padding: '13px 17px',
                        border: 'none',
                        borderBottom: '1px solid #F4F1EC',
                        background: n.isRead ? '#fff' : '#FFF7F3',
                        cursor: 'pointer',
                        alignItems: 'flex-start',
                      }}
                    >
                      <span
                        style={{
                          flexShrink: 0,
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: '#F1F4F8',
                          color: '#455373',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon size={16} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 13.5,
                            fontWeight: n.isRead ? 600 : 700,
                            color: n.isRead ? '#3A465F' : '#010C35',
                          }}
                        >
                          {n.title}
                        </span>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 12,
                            color: n.isRead ? '#8089A4' : '#566079',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {n.body}
                        </span>
                        <span style={{ display: 'block', fontSize: 11, color: '#9AA0B0', marginTop: 2 }}>
                          {formatRelativeTime(n.sentAt)}
                        </span>
                      </span>
                      {!n.isRead && (
                        <span
                          data-testid={`unread-dot-${n.id}`}
                          aria-label="Unread"
                          style={{
                            flexShrink: 0,
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: BRAND_RED,
                            marginTop: 5,
                          }}
                        />
                      )}
                    </button>
                  )
                })
              )}
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={handleSeeAll}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                width: '100%',
                padding: '11px 14px',
                border: 'none',
                borderTop: '1px solid #F1ECE6',
                background: '#FBFAF8',
                color: '#010C35',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              See all notifications
              <ChevronDown size={13} aria-hidden style={{ transform: 'rotate(-90deg)' }} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
