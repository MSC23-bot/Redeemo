'use client'

/**
 * M4 F3: the "see all" notifications view. Reached from the topbar bell popover's
 * "See all" link (the route is intentionally NOT in the sidebar, the bell is the
 * entry point). A paginated full list with an unread-only filter, a "Mark all as
 * read" action, loading/empty/error states. Each row marks itself read and
 * deep-links to the resolved destination.
 *
 * Privacy: renders only the curated fields (title/body/type/sentAt/isRead); no
 * recipient ids and no customer PII.
 */
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { NotificationsList } from '@/components/notifications/NotificationsList'
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
} from '@/lib/api/notifications'
import { resolveNotificationDestination } from '@/lib/notifications/resolveDestination'

const PAGE_SIZE = 20

export default function NotificationsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [page, setPage] = React.useState(1)
  const [unreadOnly, setUnreadOnly] = React.useState(false)

  const list = useQuery({
    queryKey: ['notifications', 'list', { page, unreadOnly }],
    queryFn: () => listNotifications({ page, pageSize: PAGE_SIZE, unreadOnly }),
    staleTime: 30_000,
  })

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  function handleSelect(n: Notification) {
    void markNotificationRead(n.id).finally(invalidate)
    const dest = resolveNotificationDestination(n.referenceType, n.referenceId, n.type)
    router.push(dest.href)
  }

  function handleMarkAll() {
    void markAllNotificationsRead().finally(invalidate)
  }

  function toggleUnreadOnly() {
    setUnreadOnly((v) => !v)
    setPage(1)
  }

  const total = list.data?.total ?? 0
  const items = list.data?.notifications ?? []
  const hasPrev = page > 1
  const hasNext = page * PAGE_SIZE < total

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Application updates, voucher decisions, and other notices about your business.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              aria-label="Unread only"
              checked={unreadOnly}
              onChange={toggleUnreadOnly}
            />
            Unread only
          </label>
          <Button variant="secondary" onClick={handleMarkAll}>
            Mark all as read
          </Button>
        </div>
      </header>

      {list.isLoading ? (
        <Card>
          <div role="status" aria-live="polite" className="px-6 text-sm text-muted-foreground">
            Loading your notifications...
          </div>
        </Card>
      ) : list.isError ? (
        <Card>
          <div role="alert" className="space-y-3 px-6">
            <p className="text-sm text-foreground">We could not load your notifications.</p>
            <Button variant="secondary" onClick={() => list.refetch()}>
              Try again
            </Button>
          </div>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <div className="px-6 text-sm text-muted-foreground">
            You have no notifications yet.
          </div>
        </Card>
      ) : (
        <>
          <NotificationsList items={items} onSelect={handleSelect} />
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1} to {(page - 1) * PAGE_SIZE + items.length} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!hasPrev}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button variant="secondary" size="sm" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
