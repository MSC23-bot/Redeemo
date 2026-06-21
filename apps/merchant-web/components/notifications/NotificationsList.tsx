'use client'

/**
 * M4 F3: the notification rows for the "see all" view. Each row is a button:
 * type icon + title + body + relative timestamp + an unread dot. Clicking marks
 * it read (via the parent's onSelect) and deep-links to the resolved destination.
 *
 * Privacy: renders only title/body/type/sentAt/isRead from the curated API.
 */
import * as React from 'react'
import { notificationTypeMeta } from '@/lib/notifications/typeMeta'
import { formatRelativeTime } from '@/lib/notifications/relativeTime'
import type { Notification } from '@/lib/api/notifications'

const BRAND_RED = '#E20C04'

export function NotificationsList({
  items,
  onSelect,
}: {
  items: Notification[]
  onSelect: (n: Notification) => void
}) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((n) => {
        const meta = notificationTypeMeta(n.type)
        const Icon = meta.Icon
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => onSelect(n)}
              style={{
                display: 'flex',
                gap: 12,
                width: '100%',
                textAlign: 'left',
                padding: '14px 16px',
                borderRadius: 12,
                border: '1px solid #EEF1F4',
                background: n.isRead ? '#fff' : '#FBFCFE',
                cursor: 'pointer',
                alignItems: 'flex-start',
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  background: '#F1F4F8',
                  color: '#455373',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={18} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#010C35' }}>{n.title}</span>
                  <span style={{ flexShrink: 0, fontSize: 12, color: '#9AA3B2' }}>{formatRelativeTime(n.sentAt)}</span>
                </span>
                <span style={{ display: 'block', fontSize: 13, color: '#6B7280', marginTop: 2 }}>{n.body}</span>
              </span>
              {!n.isRead && (
                <span
                  data-testid={`unread-dot-${n.id}`}
                  aria-label="Unread"
                  style={{ flexShrink: 0, width: 9, height: 9, borderRadius: 999, background: BRAND_RED, marginTop: 6 }}
                />
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
