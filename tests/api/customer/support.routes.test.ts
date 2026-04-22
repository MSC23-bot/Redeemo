import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/customer/support/service', () => ({
  createSupportTicket: vi.fn(),
  listSupportTickets:  vi.fn(),
  getSupportTicket:    vi.fn(),
  VALID_TOPICS: [
    'Account issue',
    'Subscription',
    'Technical problem',
    'Voucher dispute',
    'General enquiry',
    'Other',
  ] as const,
}))

vi.mock('../../../src/api/customer/discovery/service', () => ({
  getHomeFeed:                 vi.fn(),
  getCustomerMerchant:         vi.fn(),
  getCustomerMerchantBranches: vi.fn(),
  getCustomerVoucher:          vi.fn(),
  searchMerchants:             vi.fn(),
  listActiveCategories:        vi.fn(),
  getActiveCampaigns:          vi.fn(),
  getCampaignMerchants:        vi.fn(),
}))

vi.mock('../../../src/api/customer/profile/service', () => ({
  getCustomerProfile:      vi.fn(),
  updateCustomerProfile:   vi.fn(),
  updateCustomerInterests: vi.fn(),
  changeCustomerPassword:  vi.fn(),
}))

vi.mock('../../../src/api/customer/favourites/service', () => ({
  addFavouriteMerchant:    vi.fn(),
  removeFavouriteMerchant: vi.fn(),
  listFavouriteMerchants:  vi.fn(),
  addFavouriteVoucher:     vi.fn(),
  removeFavouriteVoucher:  vi.fn(),
  listFavouriteVouchers:   vi.fn(),
}))

vi.mock('../../../src/api/customer/reviews/service', () => ({
  listMerchantReviews: vi.fn(),
  listBranchReviews:   vi.fn(),
  upsertBranchReview:  vi.fn(),
  deleteBranchReview:  vi.fn(),
  reportReview:        vi.fn(),
}))

vi.mock('../../../src/api/customer/savings/service', () => ({
  getSavingsSummary:     vi.fn(),
  getSavingsRedemptions: vi.fn(),
}))

vi.mock('../../../src/api/customer/merchant-requests/service', () => ({
  createMerchantRequest: vi.fn(),
}))

import {
  createSupportTicket,
  listSupportTickets,
  getSupportTicket,
} from '../../../src/api/customer/support/service'

describe('customer support ticket routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', { auditLog: { create: vi.fn().mockResolvedValue({}) } } as any)
    app.decorate('redis', {
      get:    vi.fn().mockResolvedValue(null),
      set:    vi.fn().mockResolvedValue('OK'),
      del:    vi.fn().mockResolvedValue(1),
      incr:   vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
    } as any)
    await app.ready()
    const jwtAny = app.jwt as any
    customerToken = jwtAny.customer.sign(
      { sub: 'user-1', role: 'customer', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' },
    )
  })

  afterEach(async () => { await app.close() })

  const mockTicket = {
    id:             'ticket-1',
    ticketNumber:   'RDM-20260422-0001',
    subject:        'I need help',
    message:        'This is a detailed message about my problem.',
    topic:          'General enquiry',
    status:         'OPEN',
    attachmentUrls: [],
    createdAt:      new Date().toISOString(),
    updatedAt:      new Date().toISOString(),
  }

  // -------------------------------------------------------------------------
  // GET /api/v1/customer/support/tickets
  // -------------------------------------------------------------------------
  describe('GET /api/v1/customer/support/tickets', () => {
    it('returns 200 with paginated ticket list', async () => {
      ;(listSupportTickets as any).mockResolvedValue({
        items: [mockTicket],
        total: 1,
        page:  1,
        limit: 20,
      })

      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/customer/support/tickets',
        headers: { authorization: `Bearer ${customerToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.total).toBe(1)
      expect(body.page).toBe(1)
      expect(body.limit).toBe(20)
      expect(Array.isArray(body.items)).toBe(true)
      expect(body.items[0].ticketNumber).toBe('RDM-20260422-0001')
      expect(listSupportTickets).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        { page: 1, limit: 20 },
      )
    })

    it('returns 401 without auth', async () => {
      const res = await app.inject({
        method: 'GET',
        url:    '/api/v1/customer/support/tickets',
      })
      expect(res.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/v1/customer/support/tickets
  // -------------------------------------------------------------------------
  describe('POST /api/v1/customer/support/tickets', () => {
    it('returns 201 with created ticket', async () => {
      ;(createSupportTicket as any).mockResolvedValue(mockTicket)

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/customer/support/tickets',
        headers: { authorization: `Bearer ${customerToken}` },
        payload: {
          topic:   'General enquiry',
          subject: 'I need help',
          message: 'This is a detailed message about my problem.',
        },
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.ticketNumber).toBe('RDM-20260422-0001')
      expect(body.topic).toBe('General enquiry')
      expect(createSupportTicket).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(), // redis
        'user-1',
        {
          topic:   'General enquiry',
          subject: 'I need help',
          message: 'This is a detailed message about my problem.',
        },
      )
    })

    it('returns 400 when message is too short', async () => {
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/customer/support/tickets',
        headers: { authorization: `Bearer ${customerToken}` },
        payload: {
          topic:   'General enquiry',
          subject: 'I need help',
          message: 'Too short',
        },
      })
      expect(res.statusCode).toBe(400)
    })

    it('returns 400 when topic is not a valid enum value', async () => {
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/customer/support/tickets',
        headers: { authorization: `Bearer ${customerToken}` },
        payload: {
          topic:   'Not a real topic',
          subject: 'I need help',
          message: 'This is a detailed message about my problem.',
        },
      })
      expect(res.statusCode).toBe(400)
    })

    it('returns 400 when topic is missing', async () => {
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/customer/support/tickets',
        headers: { authorization: `Bearer ${customerToken}` },
        payload: {
          subject: 'I need help',
          message: 'This is a detailed message about my problem.',
        },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/v1/customer/support/tickets/:id
  // -------------------------------------------------------------------------
  describe('GET /api/v1/customer/support/tickets/:id', () => {
    it('returns 200 with ticket detail', async () => {
      ;(getSupportTicket as any).mockResolvedValue(mockTicket)

      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/customer/support/tickets/ticket-1',
        headers: { authorization: `Bearer ${customerToken}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.id).toBe('ticket-1')
      expect(body.subject).toBe('I need help')
      expect(getSupportTicket).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        'ticket-1',
      )
    })

    it('returns 404 when getSupportTicket throws SUPPORT_TICKET_NOT_FOUND', async () => {
      const { AppError } = await import('../../../src/api/shared/errors')
      ;(getSupportTicket as any).mockRejectedValue(new AppError('SUPPORT_TICKET_NOT_FOUND'))

      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/customer/support/tickets/nonexistent',
        headers: { authorization: `Bearer ${customerToken}` },
      })

      expect(res.statusCode).toBe(404)
    })
  })
})
