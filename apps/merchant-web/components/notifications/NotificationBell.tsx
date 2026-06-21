'use client'

/**
 * M4 F2: the topbar notification bell. Replaces the inert Notifications button.
 *
 * - An unread-count poll (45s, refetch on focus) drives a small red count bubble
 *   (brand red #E20C04), capped at "9+", hidden when 0.
 * - Clicking the bell opens a custom popover (mirrors the Topbar account-menu
 *   pattern: a fixed scrim that closes on outside-click + an absolute panel at
 *   top:46 right:0, Escape closes and returns focus to the trigger, the first row
 *   is focused on open). The popover lazily loads the most-recent 8 (enabled only
 *   while open, same 45s poll).
 * - Each row: the type icon + title + truncated body + a relative timestamp + an
 *   unread dot. A row click marks it read, invalidates ['notifications'], closes
 *   the popover, and navigates to the resolved deep-link destination.
 * - Footer: "Mark all as read" + "See all" -> /notifications.
 *
 * Privacy: renders only title/body/type/sentAt/isRead from the curated API; no
 * recipient ids and no customer PII.
 */
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from '@/lib/icons'
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
const RECENT_PAGE_SIZE = 8
const BRAND_RED = '#E20C04'

export function NotificationBell() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
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

  const closePopover = React.useCallback((returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }, [])

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
        onClick={() => setOpen((o) => !o)}
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
              background: BRAND_RED,
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
              width: 360,
              maxWidth: 'calc(100vw - 32px)',
              background: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: 12,
              boxShadow: 'var(--shadow-md)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 14px',
                borderBottom: '1px solid #EEF1F4',
                fontSize: 14,
                fontWeight: 700,
                color: '#010C35',
              }}
            >
              Notifications
            </div>

            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {recent.isLoading ? (
                <div
                  role="status"
                  aria-live="polite"
                  style={{ padding: '20px 14px', fontSize: 13, color: '#6B7280' }}
                >
                  Loading notifications...
                </div>
              ) : recent.isError ? (
                <div role="alert" style={{ padding: '20px 14px', fontSize: 13, color: 'var(--danger)' }}>
                  We could not load your notifications.
                </div>
              ) : items.length === 0 ? (
                <div style={{ padding: '24px 14px', fontSize: 13, color: '#6B7280', textAlign: 'center' }}>
                  You are all caught up.
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
                        padding: '12px 14px',
                        border: 'none',
                        borderBottom: '1px solid #F4F6F8',
                        background: n.isRead ? '#fff' : '#FBFCFE',
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
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#010C35',
                          }}
                        >
                          {n.title}
                        </span>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 12,
                            color: '#6B7280',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {n.body}
                        </span>
                        <span style={{ display: 'block', fontSize: 11, color: '#9AA3B2', marginTop: 2 }}>
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

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                padding: '10px 14px',
                borderTop: '1px solid #EEF1F4',
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={handleMarkAll}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#455373',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Mark all as read
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={handleSeeAll}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: BRAND_RED,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                See all
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
