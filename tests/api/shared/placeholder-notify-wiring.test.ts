import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 0 PR-0.4: prove each placeholder calls notify() with the intended
// template / category / recipient fields. notify() is MOCKED here (its own
// contract is pinned in notify.test.ts); the real emailTemplates run so the
// subject/link are asserted end-to-end.

const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }))
vi.mock('../../../src/api/shared/notify', () => ({ notify: notifyMock }))

// branch-PIN deps (mirror pin.test.ts): real encryption/twilio/SMS not needed.
vi.mock('../../../src/api/shared/encryption', () => ({
  encrypt: (v: string) => `enc:${v}`,
  decrypt: (v: string) => v.replace('enc:', ''),
}))
vi.mock('twilio', () => ({ default: vi.fn(() => ({ messages: { create: vi.fn() } })) }))
vi.mock('../../../src/api/shared/smsLimiter', () => ({
  consumeSmsSend: vi.fn().mockResolvedValue(undefined),
}))
// forgot-password: allow the pwd-reset limiter (keep the rest of the module).
vi.mock('../../../src/api/shared/pwdResetLimiter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/shared/pwdResetLimiter')>()
  return { ...actual, consumePwdResetAttempt: vi.fn().mockResolvedValue(undefined) }
})

import { forgotPasswordCustomer } from '../../../src/api/auth/customer/service'
import { forgotPasswordMerchant } from '../../../src/api/auth/merchant/service'
import { forgotPasswordAdmin } from '../../../src/api/auth/admin/service'
import { sendBranchPin } from '../../../src/api/merchant/branch/service'

beforeEach(() => {
  notifyMock.mockReset()
  notifyMock.mockResolvedValue({ queued: true, communicationLogId: 'c1', enqueued: true })
})

const fakeRedis = () => ({ set: vi.fn().mockResolvedValue('OK') }) as any

describe('forgotPassword* → notify (reset link, type=password_reset)', () => {
  it('customer: USER recipient + userId set + reset subject + link + ip threaded', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1' }) } } as any
    const redis = fakeRedis()
    await forgotPasswordCustomer(prisma, redis, 'maya@example.com', '1.2.3.4')

    expect(notifyMock).toHaveBeenCalledTimes(1)
    const [p, r, input] = notifyMock.mock.calls[0]
    expect(p).toBe(prisma)
    expect(r).toBe(redis)
    expect(input).toMatchObject({
      to: 'maya@example.com',
      recipientType: 'USER',
      recipientId: 'u1',
      userId: 'u1',
      type: 'password_reset',
      ip: '1.2.3.4',
    })
    expect(input.email.subject).toMatch(/reset your redeemo password/i)
    expect(input.email.html).toContain('/reset-password?token=')
  })

  it('merchant: MERCHANT_ADMIN recipient + userId null', async () => {
    const prisma = { merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1' }) } } as any
    await forgotPasswordMerchant(prisma, fakeRedis(), 'owner@biz.com', null)
    expect(notifyMock.mock.calls[0][2]).toMatchObject({
      to: 'owner@biz.com',
      recipientType: 'MERCHANT_ADMIN',
      recipientId: 'ma1',
      userId: null,
      type: 'password_reset',
    })
  })

  it('admin: ADMIN recipient + userId null', async () => {
    const prisma = { adminUser: { findUnique: vi.fn().mockResolvedValue({ id: 'a1' }) } } as any
    await forgotPasswordAdmin(prisma, fakeRedis(), 'admin@redeemo.com', null)
    expect(notifyMock.mock.calls[0][2]).toMatchObject({
      to: 'admin@redeemo.com',
      recipientType: 'ADMIN',
      recipientId: 'a1',
      userId: null,
      type: 'password_reset',
    })
  })

  it('does NOT call notify when the account does not exist (anti-enumeration preserved)', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } } as any
    await forgotPasswordCustomer(prisma, fakeRedis(), 'nobody@example.com', null)
    expect(notifyMock).not.toHaveBeenCalled()
  })
})

describe('sendBranchPin → notify (branch PIN, type=branch_pin)', () => {
  const branchPinPrisma = (email: string | null) =>
    ({
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      branch: {
        findFirst: vi.fn().mockResolvedValue({ redemptionPin: 'enc:1234', name: 'Soho', email, phone: null }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }) as any

  it('BRANCH_USER recipient + branch email + PIN subject', async () => {
    const prisma = branchPinPrisma('staff@soho.com')
    await sendBranchPin(prisma, {} as any, 'ma1', 'b1', { ipAddress: '9.9.9.9', userAgent: 'test' })
    expect(notifyMock).toHaveBeenCalledTimes(1)
    const input = notifyMock.mock.calls[0][2]
    expect(input).toMatchObject({
      to: 'staff@soho.com',
      recipientType: 'BRANCH_USER',
      recipientId: 'b1',
      type: 'branch_pin',
      ip: '9.9.9.9',
    })
    expect(input.email.subject).toContain('redemption PIN')
  })

  it('does NOT email when the branch has no email set', async () => {
    const prisma = branchPinPrisma(null)
    await sendBranchPin(prisma, {} as any, 'ma1', 'b1', { ipAddress: '9.9.9.9', userAgent: 'test' })
    expect(notifyMock).not.toHaveBeenCalled()
  })
})
