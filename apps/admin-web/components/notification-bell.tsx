'use client'

/**
 * NotificationBell — header bell icon + popover feed.
 *
 * Uses the Radix Popover primitive (from the unified `radix-ui` package) for
 * focus management, Escape-to-close, and outside-click-close.
 *
 * - Trigger: ghost icon button with an unread-count badge when count > 0.
 * - Panel: a w-80 card with a header row, a divider, and a scrollable feed.
 *   The list only fetches while the panel is open (enabled prop to the hook).
 *   Loading, empty, and row states are all covered.
 * - Each unread row calls markRead on click.
 * - "Mark all read" button appears when unreadCount > 0.
 */

import { useState } from 'react'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { Popover } from 'radix-ui'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/notifications/relativeTime'
import {
  useUnreadCount,
  useNotificationList,
  useMarkRead,
  useMarkAllRead,
} from '@/lib/notifications/useNotifications'
import type { AdminNotification } from '@/lib/api/notifications'

// ── Unread badge ──────────────────────────────────────────────────────────────

function UnreadBadge({ count }: { count: number }) {
  const label = count > 9 ? '9+' : String(count)
  return (
    <span
      aria-label={`${count} unread notification${count === 1 ? '' : 's'}`}
      className={cn(
        'absolute -right-1.5 -top-1.5 flex min-w-[18px] items-center justify-center',
        'rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground',
        'h-[18px]'
      )}
    >
      {label}
    </span>
  )
}

// ── Notification row ──────────────────────────────────────────────────────────

function NotificationRow({
  notification,
  onMarkRead,
  isMarking,
}: {
  notification: AdminNotification
  onMarkRead: (id: string) => void
  isMarking: boolean
}) {
  const relative = formatRelativeTime(notification.sentAt)

  return (
    <button
      type="button"
      aria-label={`${notification.title}: ${notification.body}`}
      disabled={!notification.isRead && isMarking}
      onClick={() => {
        if (!notification.isRead && !isMarking) {
          onMarkRead(notification.id)
        }
      }}
      className={cn(
        'flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors',
        'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        !notification.isRead && 'bg-primary/5'
      )}
    >
      <div className="flex items-start gap-2">
        {!notification.isRead && (
          <span
            aria-hidden="true"
            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
          />
        )}
        <span
          className={cn(
            'text-sm font-medium text-foreground',
            notification.isRead && 'pl-3.5'
          )}
        >
          {notification.title}
        </span>
      </div>
      <p className="line-clamp-2 pl-3.5 text-xs text-muted-foreground">
        {notification.body}
      </p>
      <span className="pl-3.5 text-xs text-muted-foreground">{relative}</span>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function NotificationBell() {
  const [open, setOpen] = useState(false)

  const { data: unreadData } = useUnreadCount()
  const { data: listData, isLoading: listLoading, isError: listError } = useNotificationList(open)

  const markRead = useMarkRead()
  const markAllRead = useMarkAllRead()

  const unreadCount = unreadData?.count ?? 0
  const notifications = listData?.notifications ?? []

  function handleMarkRead(id: string) {
    markRead.mutate(id)
  }

  function handleMarkAllRead() {
    markAllRead.mutate()
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className={cn(
            'relative inline-flex size-8 items-center justify-center rounded-md',
            'border border-border bg-transparent text-muted-foreground',
            'transition-colors hover:bg-muted hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
          )}
        >
          <Bell className="size-4" aria-hidden="true" />
          {unreadCount > 0 && <UnreadBadge count={unreadCount} />}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className={cn(
            'z-50 w-80 rounded-lg border border-border bg-card shadow-lg',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2'
          )}
        >
          {/* Header row */}
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markAllRead.isPending}
                className={cn(
                  'text-xs text-primary transition-colors hover:text-primary/80',
                  'disabled:cursor-not-allowed disabled:opacity-50'
                )}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* Feed */}
          <div className="max-h-96 overflow-y-auto">
            {listLoading ? (
              /* Loading state */
              <div className="flex items-center justify-center py-10">
                <Loader2
                  className="size-5 animate-spin text-muted-foreground"
                  aria-label="Loading notifications"
                />
              </div>
            ) : listError ? (
              /* Error state — distinct from empty so a failed fetch never reads as "all caught up" */
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <BellOff className="size-6 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Could not load notifications</p>
              </div>
            ) : notifications.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <BellOff className="size-6 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">You&apos;re all caught up</p>
                <p className="text-xs text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              /* Notification rows */
              <div role="list" aria-label="Notifications list">
                {notifications.map((n) => (
                  <div key={n.id} role="listitem">
                    <NotificationRow
                      notification={n}
                      onMarkRead={handleMarkRead}
                      isMarking={markRead.isPending}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
