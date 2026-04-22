import { z } from 'zod'
import { FastifyInstance, FastifyRequest } from 'fastify'
import { createSupportTicket, listSupportTickets, getSupportTicket, VALID_TOPICS } from './service'
import { writeAuditLog } from '../../shared/audit'

const prefix = '/api/v1/customer/support/tickets'

const pageSchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

const createSchema = z.object({
  topic:   z.enum(VALID_TOPICS as unknown as [string, ...string[]]),
  subject: z.string().trim().min(1).max(100),
  message: z.string().trim().min(20).max(2000),
})

export async function supportRoutes(app: FastifyInstance) {
  app.get(prefix, async (req: FastifyRequest, reply) => {
    const query = pageSchema.parse(req.query)
    const result = await listSupportTickets(app.prisma, req.user.sub, query)
    return reply.send(result)
  })

  app.post(prefix, async (req: FastifyRequest, reply) => {
    const data = createSchema.parse(req.body)
    const ticket = await createSupportTicket(app.prisma, app.redis, req.user.sub, data)
    writeAuditLog(app.prisma, {
      entityId:   req.user.sub,
      entityType: 'customer',
      event:      'SUPPORT_TICKET_CREATED',
      ipAddress:  req.ip,
      userAgent:  req.headers['user-agent'] ?? '',
      sessionId:  req.user.sessionId,
      metadata:   { ticketNumber: ticket.ticketNumber },
    })
    return reply.status(201).send(ticket)
  })

  app.get(`${prefix}/:id`, async (req: FastifyRequest, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params)
    const ticket = await getSupportTicket(app.prisma, req.user.sub, id)
    return reply.send(ticket)
  })
}
