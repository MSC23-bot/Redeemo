/**
 * F1 type-meta tests for lib/notifications/typeMeta.ts.
 *
 * Each known NotificationType maps to a label + Icon; an unknown/future type
 * falls back to the generic { label: 'Notification', Icon: Bell } so the bell
 * renders any row safely.
 */
import { Bell, ScanLine, Ticket } from '@/lib/icons'
import { notificationTypeMeta } from '../typeMeta'

describe('notificationTypeMeta', () => {
  it('maps MERCHANT_VERIFICATION_UPDATE to a label + the ScanLine icon', () => {
    const meta = notificationTypeMeta('MERCHANT_VERIFICATION_UPDATE')
    expect(meta.label).toBe('Application update')
    expect(meta.Icon).toBe(ScanLine)
  })

  it('maps VOUCHER_APPROVAL_UPDATE to a label + the Ticket icon', () => {
    const meta = notificationTypeMeta('VOUCHER_APPROVAL_UPDATE')
    expect(meta.label).toBe('Voucher update')
    expect(meta.Icon).toBe(Ticket)
  })

  it('maps VOUCHER_REDEEMED to a label + the Ticket icon (PR-7 bell row, not the fallback)', () => {
    const meta = notificationTypeMeta('VOUCHER_REDEEMED')
    expect(meta.label).toBe('Voucher redeemed')
    expect(meta.Icon).toBe(Ticket)
    // explicitly NOT the generic fallback
    expect(meta.label).not.toBe('Notification')
    expect(meta.Icon).not.toBe(Bell)
  })

  it('falls back to the generic Notification meta for an unknown type', () => {
    const meta = notificationTypeMeta('SOME_FUTURE_TYPE')
    expect(meta.label).toBe('Notification')
    expect(meta.Icon).toBe(Bell)
  })
})
