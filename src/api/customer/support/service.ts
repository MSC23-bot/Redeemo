import { PrismaClient } from '../../../../generated/prisma/client'
import type Redis from 'ioredis'
import { AppError } from '../../shared/errors'

export const VALID_TOPICS = [
  'Account issue',
  'Subscription',
  'Technical problem',
  'Voucher dispute',
  'General enquiry',
  'Other',
] as const

export type SupportTopic = (typeof VALID_TOPICS)[number]

const CUSTOMER_TICKET_SELECT = {
  id: true,
  ticketNumber: true,
  topic: true,
  subject: true,
  message: true,
  status: true,
  attachmentUrls: true,
  createdAt: true,
  updatedAt: true,
  // adminNote intentionally omitted — staff-only
} as const

function ticketDateKey(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

async function generateTicketNumber(redis: Redis): Promise<string> {
  const dateKey = ticketDateKey()
  const redisKey = `ticket:seq:${dateKey}`
  let seq: number
  try {
    seq = await redis.incr(redisKey)
    // Expire after 2 days — provides buffer past midnight while keeping Redis clean
    await redis.expire(redisKey, 86400 * 2)
  } catch {
    throw new AppError('SERVICE_UNAVAILABLE')
  }
  return `RDM-${dateKey}-${String(seq).padStart(4, '0')}`
}

export async function createSupportTicket(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
  data: { topic: string; subject: string; message: string },
) {
  if (!(VALID_TOPICS as readonly string[]).includes(data.topic)) {
    throw new AppError('VALIDATION_ERROR')
  }

  const ticketNumber = await generateTicketNumber(redis)

  return prisma.supportTicket.create({
    data: {
      ticketNumber,
      userId,
      topic: data.topic,
      subject: data.subject,
      message: data.message,
      attachmentUrls: [],
    },
    select: CUSTOMER_TICKET_SELECT,
  })
}

export async function listSupportTickets(
  prisma: PrismaClient,
  userId: string,
  query: { page: number; limit: number },
) {
  const { page, limit } = query
  const skip = (page - 1) * limit
  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
      select: CUSTOMER_TICKET_SELECT,
    }),
    prisma.supportTicket.count({ where: { userId } }),
  ])
  return { items, total, page, limit }
}

export async function getSupportTicket(
  prisma: PrismaClient,
  userId: string,
  ticketId: string,
) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { ...CUSTOMER_TICKET_SELECT, userId: true },
  })
  if (!ticket || ticket.userId !== userId) throw new AppError('SUPPORT_TICKET_NOT_FOUND')
  const { userId: _uid, ...rest } = ticket
  return rest
}
