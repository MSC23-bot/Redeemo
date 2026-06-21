import { Bell, ScanLine, Ticket } from '@/lib/icons'
import type { ComponentType } from 'react'

export interface NotificationTypeMeta {
  label: string
  Icon: ComponentType<{ size?: number }>
}

// type -> { label, Icon }. Only the NotificationType values that fire today are
// mapped; a future producer adds one entry when its type ships. Any unknown /
// future type falls back to the generic Notification meta so the bell renders
// every row safely.
const NOTIFICATION_TYPE_META: Record<string, NotificationTypeMeta> = {
  MERCHANT_VERIFICATION_UPDATE: { label: 'Application update', Icon: ScanLine },
  VOUCHER_APPROVAL_UPDATE: { label: 'Voucher update', Icon: Ticket },
}

export function notificationTypeMeta(type: string): NotificationTypeMeta {
  return NOTIFICATION_TYPE_META[type] ?? { label: 'Notification', Icon: Bell }
}
