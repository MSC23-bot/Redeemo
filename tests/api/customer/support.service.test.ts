import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupportTicket, listSupportTickets, getSupportTicket } from '../../../src/api/customer/support/service'
import { AppError } from '../../../src/api/shared/errors'

const mockPrisma = {
  supportTicket: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
  },
  auditLog: { create: vi.fn() },
} as any

const mockRedis = { incr: vi.fn(), expire: vi.fn() } as any

beforeEach(() => { vi.clearAllMocks() })

describe('createSupportTicket', () => {
  it('generates ticket number and creates ticket', async () => {
    mockRedis.incr.mockResolvedValue(42)
    mockRedis.expire.mockResolvedValue(1)
    mockPrisma.supportTicket.create.mockResolvedValue({
      id: 'ticket-1',
      ticketNumber: 'RDM-20260422-0042',
    })

    const result = await createSupportTicket(mockPrisma, mockRedis, 'user-1', {
      topic: 'General enquiry',
      subject: 'Test subject',
      message: 'A test message that is long enough',
    })

    expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringMatching(/^ticket:seq:\d{8}$/))
    expect(mockPrisma.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          topic: 'General enquiry',
          subject: 'Test subject',
          attachmentUrls: [],
        }),
        select: expect.objectContaining({ id: true }),
      })
    )
    expect(result.ticketNumber).toBe('RDM-20260422-0042')
  })

  it('works for the second-through-Nth ticket of the day (no collision)', async () => {
    mockRedis.incr.mockResolvedValue(2)  // second ticket
    mockRedis.expire.mockResolvedValue(1)
    mockPrisma.supportTicket.create.mockResolvedValue({
      id: 'ticket-2', ticketNumber: 'RDM-20260422-0002',
    })

    const result = await createSupportTicket(mockPrisma, mockRedis, 'user-1', {
      topic: 'General enquiry', subject: 'Test', message: 'Message body here',
    })

    expect(result.ticketNumber).toBe('RDM-20260422-0002')
  })

  it('throws SERVICE_UNAVAILABLE if Redis INCR fails', async () => {
    mockRedis.incr.mockRejectedValue(new Error('Redis connection refused'))
    await expect(
      createSupportTicket(mockPrisma, mockRedis, 'user-1', {
        topic: 'General enquiry',
        subject: 'Test',
        message: 'Test message content here',
      })
    ).rejects.toThrow(AppError)
  })
})

describe('listSupportTickets', () => {
  it('returns paginated results sorted by updatedAt', async () => {
    mockPrisma.supportTicket.findMany.mockResolvedValue([{ id: 't1' }])
    mockPrisma.supportTicket.count.mockResolvedValue(1)

    const result = await listSupportTickets(mockPrisma, 'user-1', { page: 1, limit: 20 })

    expect(result).toEqual({ items: [{ id: 't1' }], total: 1, page: 1, limit: 20 })
    expect(mockPrisma.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        orderBy: { updatedAt: 'desc' },
        skip: 0,
        take: 20,
        select: expect.objectContaining({ id: true }),
      })
    )
  })
})

describe('getSupportTicket', () => {
  it('returns the ticket when it belongs to the user', async () => {
    mockPrisma.supportTicket.findUnique.mockResolvedValue({ id: 't1', userId: 'user-1' })
    const result = await getSupportTicket(mockPrisma, 'user-1', 't1')
    expect(result).toEqual({ id: 't1' })
  })

  it('throws SUPPORT_TICKET_NOT_FOUND when ticket belongs to different user', async () => {
    mockPrisma.supportTicket.findUnique.mockResolvedValue({ id: 't1', userId: 'user-2' })
    await expect(
      getSupportTicket(mockPrisma, 'user-1', 't1'),
    ).rejects.toMatchObject({ code: 'SUPPORT_TICKET_NOT_FOUND' })
  })

  it('throws SUPPORT_TICKET_NOT_FOUND when ticket does not exist', async () => {
    mockPrisma.supportTicket.findUnique.mockResolvedValue(null)
    await expect(
      getSupportTicket(mockPrisma, 'user-1', 't1'),
    ).rejects.toMatchObject({ code: 'SUPPORT_TICKET_NOT_FOUND' })
  })
})
