import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdminCapability } from '../capability'
import { confirmBranchLocation } from './service'

export async function adminBranchRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/admin/branches'

  // Admin location pin-drop fallback (M4, slice spec §8 / Q7). authenticateAdmin
  // is applied by the admin-management plugin scope; this route additionally
  // requires the `branch:confirm-location` capability.
  app.post(
    `${prefix}/:id/confirm-location`,
    { preHandler: [requireAdminCapability('branch:confirm-location')] },
    async (req: any, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params)
      const body = z
        .object({
          latitude: z.number().gte(-90).lte(90),
          longitude: z.number().gte(-180).lte(180),
        })
        .parse(req.body)

      const result = await confirmBranchLocation(app.prisma, req.user.sub, id, body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? '',
      })
      return reply.status(200).send(result)
    },
  )
}
