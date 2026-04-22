import { z } from 'zod'
import { api } from '../api'

export const ticketStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED'])

export const ticketSchema = z.object({
  id:             z.string(),
  ticketNumber:   z.string(),
  subject:        z.string(),
  message:        z.string(),
  topic:          z.string(),
  status:         ticketStatusSchema,
  attachmentUrls: z.array(z.string()),
  createdAt:      z.string(),
  updatedAt:      z.string(),
})

const listSchema = z.object({
  items: z.array(ticketSchema),
  total: z.number(),
  page:  z.number(),
  limit: z.number(),
})

export type SupportTicket = z.infer<typeof ticketSchema>
export type TicketStatus  = z.infer<typeof ticketStatusSchema>

export const supportApi = {
  list: (params: { page?: number; limit?: number } = {}) =>
    api
      .get<unknown>(
        `/api/v1/customer/support/tickets?page=${params.page ?? 1}&limit=${params.limit ?? 20}`,
      )
      .then(listSchema.parse),

  create: (data: { topic: string; subject: string; message: string }) =>
    api.post<unknown>('/api/v1/customer/support/tickets', data).then(ticketSchema.parse),

  get: (id: string) =>
    api.get<unknown>(`/api/v1/customer/support/tickets/${id}`).then(ticketSchema.parse),
}
