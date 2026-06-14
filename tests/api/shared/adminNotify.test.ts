import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the email dispatcher so the email-only alert path can be asserted without
// touching Redis / BullMQ. The emit helpers lazy-import './notify', so the mock
// must be in place before they run.
const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }))
vi.mock('../../../src/api/shared/notify', () => ({ notify: notifyMock }))

import {
  adminNotify,
  getAlertableAdmins,
  emitMerchantSubmittedAlert,
  emitMerchantResubmittedAlert,
} from '../../../src/api/shared/adminNotify'

const dummyRedis = {} as any
const MERCHANT = { id: 'm1', businessName: 'Pixel Coffee' }

function makePrisma() {
  return {
    notification: { create: vi.fn().mockResolvedValue({}) },
    communicationLog: { create: vi.fn().mockResolvedValue({}) },
    adminUser: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
  } as any
}

beforeEach(() => {
  notifyMock.mockReset()
  notifyMock.mockResolvedValue({ queued: true, communicationLogId: 'c1', enqueued: true })
  delete process.env.ADMIN_OPS_ALERT_EMAIL
})

afterEach(() => {
  delete process.env.ADMIN_OPS_ALERT_EMAIL
})

describe('adminNotify — in-app-only writer', () => {
  it('writes ONE IN_APP ADMIN Notification with userId null and the right fields', async () => {
    const prisma = makePrisma()
    await adminNotify(prisma, {
      adminUserId: 'admin-1',
      type: 'ADMIN_MERCHANT_SUBMITTED',
      title: 'New merchant submitted for approval',
      body: 'Pixel Coffee has submitted.',
      referenceId: 'm1',
      referenceType: 'merchant',
    })

    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        recipientType: 'ADMIN',
        recipientId: 'admin-1',
        userId: null,
        channel: 'IN_APP',
        type: 'ADMIN_MERCHANT_SUBMITTED',
        title: 'New merchant submitted for approval',
        body: 'Pixel Coffee has submitted.',
        referenceId: 'm1',
        referenceType: 'merchant',
      },
    })
  })

  it('creates NO CommunicationLog row and NO email (it is in-app only)', async () => {
    const prisma = makePrisma()
    await adminNotify(prisma, {
      adminUserId: 'admin-1',
      type: 'ADMIN_MERCHANT_SUBMITTED',
      title: 't',
      body: 'b',
    })
    expect(prisma.communicationLog.create).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('defaults referenceId/referenceType to null when omitted', async () => {
    const prisma = makePrisma()
    await adminNotify(prisma, { adminUserId: 'a', type: 'ADMIN_MERCHANT_RESUBMITTED', title: 't', body: 'b' })
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ referenceId: null, referenceType: null }) }),
    )
  })
})

describe('getAlertableAdmins', () => {
  it('queries active OPERATIONS + SUPER_ADMIN admins only', async () => {
    const prisma = makePrisma()
    prisma.adminUser.findMany.mockResolvedValue([{ id: 'a', email: 'a@x.com', firstName: 'A', lastName: 'B' }])
    const result = await getAlertableAdmins(prisma)
    expect(prisma.adminUser.findMany).toHaveBeenCalledWith({
      where: { isActive: true, role: { in: ['OPERATIONS', 'SUPER_ADMIN'] } },
      select: { id: true, email: true, firstName: true, lastName: true },
    })
    expect(result).toHaveLength(1)
  })
})

describe('emitMerchantSubmittedAlert', () => {
  it('fans the bell out to every alertable admin', async () => {
    const prisma = makePrisma()
    prisma.adminUser.findMany.mockResolvedValue([
      { id: 'op1', email: 'op1@x.com', firstName: 'O', lastName: '1' },
      { id: 'sa1', email: 'sa1@x.com', firstName: 'S', lastName: 'A' },
    ])
    await emitMerchantSubmittedAlert(prisma, dummyRedis, MERCHANT)

    expect(prisma.notification.create).toHaveBeenCalledTimes(2)
    const recipients = prisma.notification.create.mock.calls.map((c: any) => c[0].data.recipientId)
    expect(recipients).toEqual(['op1', 'sa1'])
    for (const call of prisma.notification.create.mock.calls) {
      expect(call[0].data).toMatchObject({
        recipientType: 'ADMIN',
        userId: null,
        channel: 'IN_APP',
        type: 'ADMIN_MERCHANT_SUBMITTED',
        referenceId: 'm1',
        referenceType: 'merchant',
      })
    }
  })

  it('with ADMIN_OPS_ALERT_EMAIL set: sends ONE email-only alert to it (no inApp field)', async () => {
    process.env.ADMIN_OPS_ALERT_EMAIL = 'ops@redeemo.co.uk'
    const prisma = makePrisma()
    prisma.adminUser.findMany.mockResolvedValue([{ id: 'op1', email: 'op1@x.com', firstName: 'O', lastName: '1' }])

    await emitMerchantSubmittedAlert(prisma, dummyRedis, MERCHANT)

    expect(notifyMock).toHaveBeenCalledTimes(1)
    const arg = notifyMock.mock.calls[0][2]
    expect(arg).toMatchObject({
      to: 'ops@redeemo.co.uk',
      recipientType: 'ADMIN',
      recipientId: 'm1',
      userId: null,
      type: 'admin_merchant_submitted',
    })
    // Email-only — must NOT carry an inApp field (that would write a Notification).
    expect(arg.inApp).toBeUndefined()
    expect(arg.email.subject).toContain('Pixel Coffee')
  })

  it('with ADMIN_OPS_ALERT_EMAIL unset: NO email, but bell rows still written', async () => {
    delete process.env.ADMIN_OPS_ALERT_EMAIL
    const prisma = makePrisma()
    prisma.adminUser.findMany.mockResolvedValue([{ id: 'op1', email: 'op1@x.com', firstName: 'O', lastName: '1' }])

    await emitMerchantSubmittedAlert(prisma, dummyRedis, MERCHANT)

    expect(notifyMock).not.toHaveBeenCalled()
    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
  })

  it('with ADMIN_OPS_ALERT_EMAIL empty/whitespace: treated as unset (no email)', async () => {
    process.env.ADMIN_OPS_ALERT_EMAIL = '   '
    const prisma = makePrisma()
    prisma.adminUser.findMany.mockResolvedValue([{ id: 'op1', email: 'op1@x.com', firstName: 'O', lastName: '1' }])
    await emitMerchantSubmittedAlert(prisma, dummyRedis, MERCHANT)
    expect(notifyMock).not.toHaveBeenCalled()
    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
  })

  it('anti-storm: the queued ops email writes no further/recursive Notification', async () => {
    // The email is dark (EMAIL_ENABLED unset) so the worker will mark it FAILED.
    // M8 wires NO "email failed → alert" path, so emitting SUBMITTED must produce
    // exactly the bell fan-out and nothing recursive. We assert notify() (the
    // ONLY email writer) is called once and adminNotify writes only the fan-out.
    process.env.ADMIN_OPS_ALERT_EMAIL = 'ops@redeemo.co.uk'
    const prisma = makePrisma()
    prisma.adminUser.findMany.mockResolvedValue([{ id: 'op1', email: 'op1@x.com', firstName: 'O', lastName: '1' }])

    await emitMerchantSubmittedAlert(prisma, dummyRedis, MERCHANT)

    expect(prisma.notification.create).toHaveBeenCalledTimes(1) // bell only — no recursive row.
    expect(notifyMock).toHaveBeenCalledTimes(1) // one email, no cascade.
  })

  it('best-effort: a thrown notification is swallowed (does not reject)', async () => {
    const prisma = makePrisma()
    prisma.adminUser.findMany.mockResolvedValue([{ id: 'op1', email: 'op1@x.com', firstName: 'O', lastName: '1' }])
    prisma.notification.create.mockRejectedValue(new Error('db down'))
    await expect(emitMerchantSubmittedAlert(prisma, dummyRedis, MERCHANT)).resolves.toBeUndefined()
  })
})

describe('emitMerchantResubmittedAlert', () => {
  it('resolvable active reviewer: ONE bell row + ONE email to that reviewer', async () => {
    const prisma = makePrisma()
    prisma.adminUser.findUnique.mockResolvedValue({ id: 'rev1', email: 'rev1@x.com', isActive: true })

    await emitMerchantResubmittedAlert(prisma, dummyRedis, MERCHANT, 'rev1')

    expect(prisma.adminUser.findUnique).toHaveBeenCalledWith({
      where: { id: 'rev1' },
      select: { id: true, email: true, isActive: true },
    })
    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recipientId: 'rev1', type: 'ADMIN_MERCHANT_RESUBMITTED', userId: null }),
      }),
    )
    expect(notifyMock).toHaveBeenCalledTimes(1)
    const arg = notifyMock.mock.calls[0][2]
    expect(arg).toMatchObject({ to: 'rev1@x.com', type: 'admin_merchant_resubmitted' })
    expect(arg.inApp).toBeUndefined()
  })

  it('null reviewer id: skips entirely (no bell, no email, no lookup)', async () => {
    const prisma = makePrisma()
    await emitMerchantResubmittedAlert(prisma, dummyRedis, MERCHANT, null)
    expect(prisma.adminUser.findUnique).not.toHaveBeenCalled()
    expect(prisma.notification.create).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('reviewer not found: skips entirely', async () => {
    const prisma = makePrisma()
    prisma.adminUser.findUnique.mockResolvedValue(null)
    await emitMerchantResubmittedAlert(prisma, dummyRedis, MERCHANT, 'gone')
    expect(prisma.notification.create).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('reviewer inactive: skips entirely', async () => {
    const prisma = makePrisma()
    prisma.adminUser.findUnique.mockResolvedValue({ id: 'rev1', email: 'rev1@x.com', isActive: false })
    await emitMerchantResubmittedAlert(prisma, dummyRedis, MERCHANT, 'rev1')
    expect(prisma.notification.create).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('best-effort: a thrown lookup is swallowed (does not reject)', async () => {
    const prisma = makePrisma()
    prisma.adminUser.findUnique.mockRejectedValue(new Error('db down'))
    await expect(emitMerchantResubmittedAlert(prisma, dummyRedis, MERCHANT, 'rev1')).resolves.toBeUndefined()
  })
})

describe('self-action silence (M8 adds NO alert to approve/reject/suspend/reactivate)', () => {
  it('the only emit entry points are the SUBMITTED + RESUBMITTED helpers', async () => {
    // M8 wires emitters ONLY into submitForApproval (submit/resubmit). The
    // actioner service does not import them; this asserts the module surface
    // exposes exactly the two emit helpers, so there is no approve/reject/
    // suspend/reactivate alert path to invoke.
    const mod = await import('../../../src/api/shared/adminNotify')
    const emitFns = Object.keys(mod).filter((k) => k.startsWith('emit'))
    expect(emitFns.sort()).toEqual(['emitMerchantResubmittedAlert', 'emitMerchantSubmittedAlert'])
  })
})
