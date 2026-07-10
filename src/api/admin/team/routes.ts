// Team & Roles S1 (spec 2026-07-10-admin-capability-grants-field-role §6).
// SUPER_ADMIN-only team-management routes. Every route is gated on
// `admin:manage-team`, which is held ONLY by SUPER_ADMIN (it is not in any role
// baseline and not grantable), so the capability gate IS the SUPER_ADMIN gate.
// `authenticateAdmin` is applied by the admin-management plugin scope.
//
// S2 addendum: GET (list) added as the roster read for the Team & Roles
// admin-web screen. No list route existed under S1 — this is the one
// permitted additive backend route for slice S2 (spec §6.2 / plan S2).

import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { emailSchema } from '../../shared/schemas'
import { requireAdminCapability } from '../capability'
import {
  listTeamAdmins,
  createAdminAccount,
  setAdminRole,
  deactivateAdmin,
  grantCapability,
  revokeCapability,
} from './service'

const ASSIGNABLE_ROLE = z.enum(['OPERATIONS', 'FINANCE', 'CONTENT', 'SUPPORT', 'FIELD'])
// Capability is accepted as a bounded free string; the SERVICE is the
// authoritative allow-list gate (grantCapability throws CAPABILITY_NOT_GRANTABLE
// for anything off GRANTABLE_CAPABILITIES), so the 400 carries a semantic code
// rather than a generic Zod validation error.
const CAPABILITY = z.string().trim().min(1).max(100)

export async function adminTeamRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/admin/team'
  const gate = { preHandler: [requireAdminCapability('admin:manage-team')] }

  const auditCtx = (req: any) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '' })
  const adminIdParam = (req: any) => z.object({ adminId: z.string().min(1) }).parse(req.params).adminId

  // S2: list every admin account + its active capability grants (the Team &
  // Roles roster read). No pagination — the admin roster is small. Curated
  // select (never passwordHash); see listTeamAdmins for the exact shape.
  app.get(prefix, gate, async () => {
    return listTeamAdmins(app.prisma)
  })

  // Create an admin account (email, name, base role). A random unusable password
  // is set; NO email is sent (email is a later slice). 409 on duplicate email.
  app.post(prefix, gate, async (req: any, reply) => {
    const body = z
      .object({
        email: emailSchema,
        firstName: z.string().trim().min(1),
        lastName: z.string().trim().min(1),
        role: ASSIGNABLE_ROLE,
      })
      .parse(req.body)
    const admin = await createAdminAccount(app.prisma, req.user.sub, body, auditCtx(req))
    return reply.status(201).send(admin)
  })

  // Set an admin's base role.
  app.patch(`${prefix}/:adminId/role`, gate, async (req: any) => {
    const { role } = z.object({ role: ASSIGNABLE_ROLE }).parse(req.body)
    return setAdminRole(app.prisma, req.user.sub, adminIdParam(req), role, auditCtx(req))
  })

  // Deactivate an admin account (isActive=false + revoke sessions).
  app.post(`${prefix}/:adminId/deactivate`, gate, async (req: any) => {
    return deactivateAdmin(app.prisma, app.redis, req.user.sub, adminIdParam(req), auditCtx(req))
  })

  // Grant a curated capability. A capability outside GRANTABLE_CAPABILITIES is
  // rejected by the service with CAPABILITY_NOT_GRANTABLE (400).
  app.post(`${prefix}/:adminId/grants`, gate, async (req: any, reply) => {
    const { capability } = z.object({ capability: CAPABILITY }).parse(req.body)
    const grant = await grantCapability(app.prisma, req.user.sub, adminIdParam(req), capability, auditCtx(req))
    return reply.status(201).send(grant)
  })

  // Revoke a capability grant (soft revoke + revoke sessions = escape hatch).
  app.post(`${prefix}/:adminId/revoke`, gate, async (req: any) => {
    const { capability } = z.object({ capability: CAPABILITY }).parse(req.body)
    return revokeCapability(app.prisma, app.redis, req.user.sub, adminIdParam(req), capability, auditCtx(req))
  })
}
