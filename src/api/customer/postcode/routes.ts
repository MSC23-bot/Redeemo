// src/api/customer/postcode/routes.ts
//
// Plan 4 M1.19 — GET /api/v1/customer/postcode/preview
//
// Open scope — no auth required. PC2 typing happens during onboarding before
// the user is fully verified; the preview endpoint must be reachable without
// an auth header. Read-only by design (preview service uses findExistingLocality,
// NOT findOrCreateLocality).
//
// Response shape mirrors PostcodePreview from service.ts. Status codes:
//   200 — success; body = PostcodePreview.
//   400 — invalid postcode shape (Zod parse failure).
//   404 — POSTCODE_NOT_FOUND (postcodes.io 404).
//   503 — GAZETTEER_UNAVAILABLE (postcodes.io 5xx / network failure).

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { previewPostcode } from './service'

const previewQuery = z.object({
  code: z.string().min(5).max(10),
})

export async function postcodeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/customer/postcode/preview', async (req, reply) => {
    const parse = previewQuery.safeParse(req.query)
    if (!parse.success) {
      return reply.code(400).send({ error: 'INVALID_POSTCODE' })
    }
    const result = await previewPostcode(req.server.prisma, parse.data.code)
    if (!result.ok) {
      const status = result.error === 'POSTCODE_NOT_FOUND' ? 404 : 503
      return reply.code(status).send({ error: result.error })
    }
    return reply.code(200).send(result.preview)
  })
}
